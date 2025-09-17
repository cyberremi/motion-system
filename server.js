// server.js
const express = require('express');
const http = require('http');
const path = require('path');
const https = require('https');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

// XIRSYS: prefer env vars, but fallback to the values you gave earlier
const XIRSYS_IDENT = process.env.XIRSYS_IDENT || 'nextgen';
const XIRSYS_SECRET = process.env.XIRSYS_SECRET || 'cdfcfc2c-9246-11f0-af15-4662eff0c0a9';
const XIRSYS_CHANNEL = process.env.XIRSYS_CHANNEL || 'camera-test';
const XIRSYS_HOST = process.env.XIRSYS_HOST || 'global.xirsys.net';

app.use(express.static(PUBLIC_DIR));

// /ice endpoint: fetch TURN/STUN list from Xirsys and return { iceServers: [...] }
app.get('/ice', async (req, res) => {
  try {
    const bodyStr = JSON.stringify({ format: "urls" });
    const auth = Buffer.from(`${XIRSYS_IDENT}:${XIRSYS_SECRET}`).toString('base64');

    const options = {
      hostname: XIRSYS_HOST,
      path: `/_turn/${XIRSYS_CHANNEL}`,
      method: 'PUT',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr)
      }
    };

    const req2 = https.request(options, (resp) => {
      let data = '';
      resp.on('data', (chunk) => data += chunk);
      resp.on('end', () => {
        try {
          const json = JSON.parse(data || '{}');

          // Xirsys typically returns something in json.v.iceServers or json.v?.iceServers
          const iceServers = (json && (json.v?.iceServers || json.v?.ice_servers || json.iceServers)) || null;

          if (iceServers && Array.isArray(iceServers)) {
            console.log('[ICE] fetched from Xirsys', iceServers.length, 'servers');
            return res.json({ iceServers });
          }

          // fallback – return simple STUN only
          console.warn('[ICE] xirsys returned unexpected payload, fallback to public STUN', json);
          return res.json({
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' }
            ]
          });
        } catch (err) {
          console.error('[ICE] parse error', err);
          return res.json({
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' }
            ]
          });
        }
      });
    });

    req2.on('error', (err) => {
      console.error('[ICE] request error', err);
      res.json({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' }
        ]
      });
    });

    req2.write(bodyStr);
    req2.end();

  } catch (err) {
    console.error('[ICE] unexpected error', err);
    res.json({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
      ]
    });
  }
});

// Simple signaling: relay offer/answer/candidates to everyone (broadcast)
io.on('connection', socket => {
  console.log('[SOCKET] connected', socket.id);

  socket.on('offer', (offer) => {
    console.log('[SIGNAL] offer from', socket.id);
    // send to everyone except sender
    socket.broadcast.emit('offer', offer);
  });

  socket.on('answer', (answer) => {
    console.log('[SIGNAL] answer from', socket.id);
    socket.broadcast.emit('answer', answer);
  });

  socket.on('ice-candidate', (cand) => {
    // cand is RTCIceCandidateInit-like
    socket.broadcast.emit('ice-candidate', cand);
  });

  socket.on('disconnect', () => {
    console.log('[SOCKET] disconnected', socket.id);
  });
});

// default root -> dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'dashboard.html'));
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('Serve files from /public; /ice returns dynamic Xirsys iceServers (or STUN fallback).');
});
