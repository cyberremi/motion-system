// server.js
// Clean, deploy-ready signaling + frame relay server

const express = require('express');
const http = require('http');
const path = require('path');
const multer = require('multer');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// multer memory storage
const storage = multer.memoryStorage();
const upload = multer({ storage });

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

// in-memory store
let latestFrame = null;
let events = [];
const MAX_EVENTS = 500;

// 1. Serve all static assets from /public
app.use(express.static(PUBLIC_DIR));

// 2. Fallback root → dashboard.html
app.get('/', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'dashboard.html'));
});

// 3. POST /frame → receive jpeg buffer
app.post('/frame', upload.single('frame'), (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ ok: false, msg: 'no frame' });
    }
    latestFrame = req.file.buffer;
    console.log(`[FRAME] received size=${latestFrame.length} bytes`);
    res.json({ ok: true, timestamp: Date.now() });
  } catch (err) {
    console.error('[ERR /frame]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 4. MJPEG stream endpoint
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
      clearInterval(interval);
    }
  };

  const interval = setInterval(sendFrame, 100); // ~10fps

  req.on('close', () => {
    console.log('[VIDEO] client disconnected');
    clearInterval(interval);
  });
});

// 5. Socket.IO events
io.on('connection', socket => {
  console.log('[SOCKET] connected', socket.id);

  socket.emit('status', { hasFrame: !!latestFrame, events: events.slice(0, 50) });

  socket.on('detection', (payload) => {
    try {
      const ev = { time: Date.now(), ...payload };
      events.unshift(ev);
      if (events.length > MAX_EVENTS) events.pop();
      console.log('[DETECTION]', ev.label, Math.round((ev.confidence || 0) * 100) + '%');
      io.emit('detection', ev);
    } catch (e) {
      console.error('[ERR detection handler]', e);
    }
  });

  socket.on('disconnect', () => {
    console.log('[SOCKET] disconnected', socket.id);
  });
});

// 6. Start server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`http://localhost:${PORT}/dashboard.html`);
});
