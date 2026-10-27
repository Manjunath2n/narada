const express = require('express');
const path = require('path');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
  cors: { origin: "*" }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

io.on('connection', (socket) => {
  socket.on('join', ({ room, pin }) => {
    
    const expectedPin = process.env.ACCESS_PIN;
    if (expectedPin && pin !== expectedPin) {
      socket.emit('auth-error', 'Invalid Access PIN');
      return;
    }

    const clients = io.sockets.adapter.rooms.get(room);
    const numClients = clients ? clients.size : 0;

    if (numClients >= 2) {
      socket.emit('full');
      return;
    }

    socket.join(room);
    socket.room = room;

    // 2. Send TURN credentials securely from environment variables
    const turnUser = process.env.TURN_USERNAME;
    const turnPass = process.env.TURN_PASSWORD;

    const iceServers = [
      { urls: "stun:stun.relay.metered.ca:80" }
    ];

    if (turnUser && turnPass) {
      iceServers.push(
        {
          urls: "turn:global.relay.metered.ca:80",
          username: turnUser,
          credential: turnPass,
        },
        {
          urls: "turn:global.relay.metered.ca:80?transport=tcp",
          username: turnUser,
          credential: turnPass,
        },
        {
          urls: "turn:global.relay.metered.ca:443",
          username: turnUser,
          credential: turnPass,
        },
        {
          urls: "turns:global.relay.metered.ca:443?transport=tcp",
          username: turnUser,
          credential: turnPass,
        }
      );
    }

    // Send ICE config to the authenticated user
    socket.emit('joined', { iceServers, isInitiator: numClients === 1 });

    // Notify the first user when the second user arrives
    if (numClients === 1) {
      socket.to(room).emit('peer-joined');
    }
  });

  socket.on('signal', (data) => {
    if (socket.room) {
      socket.to(socket.room).emit('signal', data);
    }
  });

  socket.on('disconnect', () => {
    if (socket.room) {
      socket.to(socket.room).emit('peer-left');
    }
  });
});

const PORT = process.env.PORT || 7860;
http.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});