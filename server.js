// server.js
// Clean, deploy-ready signaling + frame relay server
// - Serves static files from /public
// - POST /frame accepts latest JPEG frame (multer memory storage)
// - GET /video streams MJPEG from latestFrame (sends latest frame only)
// - Socket.IO relays 'detection' events and provides 'status' on connect

const express = require('express');
const http = require('http');
const path = require('path');
const multer = require('multer');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// allow CORS for socket.io (safe for demo)
const io = new Server(server, { cors: { origin: "*" } });

// multer for memory uploads
const storage = multer.memoryStorage();
const upload = multer({ storage });

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

// in-memory latest frame (Buffer) and events
let latestFrame = null;
let events = [];
const MAX_EVENTS = 500;

// Serve static files from /public
app.use(express.static(PUBLIC_DIR));

// POST /frame - accept single field 'frame' (jpeg blob)
app.post('/frame', upload.single('frame'), (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      console.log('[FRAME] no file in request');
      return res.status(400).json({ ok:false, msg:'no frame' });
    }
    latestFrame = req.file.buffer;
    // small log, include size and timestamp
    console.log(`[FRAME] received size=${latestFrame.length} bytes`);
    res.json({ ok:true, timestamp: Date.now() });
  } catch (err) {
    console.error('[ERR /frame]', err);
    res.status(500).json({ ok:false, error: err.message });
  }
});

// MJPEG endpoint - serves latestFrame repeatedly (no backlog)
app.get('/video', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'multipart/x-mixed-replace; boundary=frame',
    'Cache-Control': 'no-cache',
    'Connection': 'close',
    'Pragma': 'no-cache'
  });

  console.log('[VIDEO] client connected to /video');

  const sendFrame = () => {
    if (!latestFrame) return;
    try {
      res.write(`--frame\r\n`);
      res.write(`Content-Type: image/jpeg\r\n`);
      res.write(`Content-Length: ${latestFrame.length}\r\n\r\n`);
      res.write(latestFrame);
      res.write('\r\n');
    } catch (e) {
      // client disconnected or write error
      clearInterval(interval);
    }
  };

  // Send at ~10 fps (100ms). We always send the latestFrame directly.
  const interval = setInterval(sendFrame, 100);

  req.on('close', () => {
    console.log('[VIDEO] client disconnected');
    clearInterval(interval);
  });
});

// Socket.IO handling
io.on('connection', socket => {
  console.log('[SOCKET] connected', socket.id);
  // send current status and some recent events
  socket.emit('status', { hasFrame: !!latestFrame, events: events.slice(0,50) });

  socket.on('detection', (payload) => {
    try {
      const ev = Object.assign({ time: Date.now() }, payload);
      events.unshift(ev);
      if (events.length > MAX_EVENTS) events.pop();
      console.log('[DETECTION] ', ev.label, Math.round((ev.confidence||0)*100)+'%');
      // broadcast to all clients (dashboards)
      io.emit('detection', ev);
    } catch (e) {
      console.error('[ERR detection handler]', e);
    }
  });

  socket.on('disconnect', () => {
    console.log('[SOCKET] disconnected', socket.id);
  });
});

// Fallback root - show README or redirect to dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'dashboard.html'));
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT} (http://localhost:${PORT})`);
  console.log('Open /cam_sender.html on the phone and /dashboard.html on PC');
});
