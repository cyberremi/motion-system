// server.js - WebRTC signaling with Socket.IO
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

app.use(express.static(PUBLIC_DIR));

io.on('connection', socket => {
  console.log('Peer connected:', socket.id);

  // Relay WebRTC SDP & ICE between peers
  socket.on('offer', data => {
    socket.broadcast.emit('offer', data);
  });
  socket.on('answer', data => {
    socket.broadcast.emit('answer', data);
  });
  socket.on('ice-candidate', data => {
    socket.broadcast.emit('ice-candidate', data);
  });

  socket.on('disconnect', () => {
    console.log('Peer disconnected:', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
