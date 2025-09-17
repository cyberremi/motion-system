// server.js
const express = require('express');
const http = require('http');
const path = require('path');
const multer = require('multer');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// Socket.IO with permissive CORS for demo (tighten in prod)
const io = new Server(server, { cors: { origin: "*" } });

// multer memory storage for binary frame uploads (multipart/form-data)
const storage = multer.memoryStorage();
const upload = multer({ storage });

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

// tweak this to increase frames/sec (100ms -> 10 FPS). Lower = smoother but more bandwidth.
const FRAME_INTERVAL_MS = process.env.FRAME_INTERVAL_MS ? parseInt(process.env.FRAME_INTERVAL_MS) : 100;

let latestFrame = null;         // Buffer containing last JPEG
let events = [];                // recent detection events
const MAX_EVENTS = 500;

app.use(express.static(PUBLIC_DIR));

// POST /frame accepts multipart form field 'frame' (jpeg blob)
app.post('/frame', upload.single('frame'), (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      console.log('[FRAME] no frame in request');
      return res.status(400).json({ ok:false, msg:'no frame' });
    }
    latestFrame = req.file.buffer;
    // simple log w/size and timestamp
    console.log(`[FRAME] received size=${latestFrame.length} bytes at ${new Date().toISOString()}`);
    return res.json({ ok:true, ts: Date.now() });
  } catch (err) {
    console.error('[ERR /frame]', err);
    return res.status(500).json({ ok:false, error: err.message });
  }
});

// MJPEG endpoint (multipart/x-mixed-replace)
app.get('/video', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'multipart/x-mixed-replace; boundary=frame',
    'Cache-Control': 'no-cache',
    'Connection': 'close',
    'Pragma': 'no-cache'
  });

  console.log(`[VIDEO] client connected ${req.ip}`);

  const sendFrame = () => {
    if (!latestFrame) return;
    try {
      res.write(`--frame\r\n`);
      res.write(`Content-Type: image/jpeg\r\n`);
      res.write(`Content-Length: ${latestFrame.length}\r\n\r\n`);
      res.write(latestFrame);
      res.write(`\r\n`);
    } catch (e) {
      // likely client disconnected
      clearInterval(interval);
    }
  };

  // immediate first attempt if frame exists
  sendFrame();
  const interval = setInterval(sendFrame, FRAME_INTERVAL_MS);

  req.on('close', () => {
    console.log('[VIDEO] client disconnected');
    clearInterval(interval);
  });
});

// Socket.IO for events + status
io.on('connection', socket => {
  console.log('[SOCKET] connected', socket.id);
  socket.emit('status', { hasFrame: !!latestFrame, events: events.slice(0,50) });

  socket.on('detection', payload => {
    try {
      const ev = Object.assign({ time: Date.now() }, payload);
      events.unshift(ev);
      if (events.length > MAX_EVENTS) events.pop();
      console.log('[DETECTION]', ev.label, Math.round((ev.confidence||0)*100)+'%', `from ${socket.id}`);
      io.emit('detection', ev); // broadcast to all dashboards
    } catch (e) {
      console.error('[ERR detection handler]', e);
    }
  });

  socket.on('disconnect', () => {
    console.log('[SOCKET] disconnected', socket.id);
  });
});

// root -> dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'dashboard.html'));
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT} (http://localhost:${PORT})`);
  console.log('Open /cam_sender.html on phone and /dashboard.html on viewer');
});
