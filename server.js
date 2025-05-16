// server.js - Main server file
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const redis = require('redis');
const { createAdapter } = require('@socket.io/redis-adapter');
const MessageQueue = require('./messageQueue');

// Initialize Express app
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Connect to MongoDB for persistent storage
mongoose.connect('mongodb://localhost:27017/multichat', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

// Set up Redis for pub/sub and session storage
const pubClient = redis.createClient();
const subClient = pubClient.duplicate();

Promise.all([
  pubClient.connect(),
  subClient.connect()
]).then(() => {
  io.adapter(createAdapter(pubClient, subClient));
  console.log("Redis adapter configured");
});

// Initialize message queue
const messageQueue = new MessageQueue();

// Authentication middleware
io.use(async (socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error('Authentication error'));
  }
  
  try {
    // Verify token and attach user data to socket
    socket.user = await verifyToken(token);
    next();
  } catch (error) {
    next(new Error('Authentication error'));
  }
});

// Handle connections
io.on('connection', (socket) => {
  const userId = socket.user.id;
  console.log(`User connected: ${userId}`);
  
  // Join user's personal room
  socket.join(`user:${userId}`);
  
  // Get and join all user's chat rooms
  getUserChatRooms(userId).then(rooms => {
    rooms.forEach(room => {
      socket.join(`chat:${room}`);
    });
  });

  // Handle new messages
  socket.on('send_message', async (data) => {
    try {
      const { chatId, content, attachments } = data;
      
      // Create message object
      const message = {
        sender: userId,
        content,
        attachments: attachments || [],
        timestamp: new Date(),
        chatId
      };
      
      // Queue the message for processing and storage
      await messageQueue.queueMessage(message);
      
      // Emit to all users in the chat room
      io.to(`chat:${chatId}`).emit('new_message', message);
      
      // Store delivery receipts
      storeMessageDeliveryStatus(message);
    } catch (error) {
      socket.emit('error', { message: 'Failed to send message' });
    }
  });
  
  // Handle typing indicators
  socket.on('typing', (data) => {
    const { chatId } = data;
    socket.to(`chat:${chatId}`).emit('user_typing', { userId, chatId });
  });
  
  // Handle read receipts
  socket.on('mark_read', async (data) => {
    const { chatId, messageId } = data;
    await updateMessageReadStatus(chatId, messageId, userId);
    socket.to(`chat:${chatId}`).emit('message_read', { userId, messageId, chatId });
  });
  
  // Handle creating new chats
  socket.on('create_chat', async (data) => {
    try {
      const { name, participants, isGroup } = data;
      const chatRoom = await createNewChatRoom(name, participants, isGroup, userId);
      
      // Join all participants to the new chat room
      participants.forEach(participantId => {
        const participantSocket = findUserSocket(participantId);
        if (participantSocket) {
          participantSocket.join(`chat:${chatRoom.id}`);
          participantSocket.emit('chat_created', chatRoom);
        }
      });
      
      socket.emit('chat_created', chatRoom);
    } catch (error) {
      socket.emit('error', { message: 'Failed to create chat' });
    }
  });
  
  // Handle disconnection
  socket.on('disconnect', async () => {
    console.log(`User disconnected: ${userId}`);
    await updateUserStatus(userId, 'offline');
    io.emit('user_status_change', { userId, status: 'offline' });
  });
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Helper functions (would be in separate files in a real application)
async function verifyToken(token) {
  // Implement JWT verification here
  // Return user object if token is valid
  return { id: 'user123', name: 'Test User' }; // Placeholder
}

async function getUserChatRooms(userId) {
  // Get user's chat rooms from database
  return ['room1', 'room2']; // Placeholder
}

async function storeMessageDeliveryStatus(message) {
  // Store message delivery status in database
  console.log(`Storing delivery status for message: ${message.id}`);
}

async function updateMessageReadStatus(chatId, messageId, userId) {
  // Update message read status in database
  console.log(`User ${userId} read message ${messageId} in chat ${chatId}`);
}

async function createNewChatRoom(name, participants, isGroup, creatorId) {
  // Create new chat room in database
  const chatRoom = {
    id: `chat_${Date.now()}`,
    name,
    participants,
    isGroup,
    createdBy: creatorId,
    createdAt: new Date()
  };
  
  console.log(`New chat room created: ${chatRoom.id}`);
  return chatRoom;
}

async function updateUserStatus(userId, status) {
  // Update user status in database
  console.log(`Updating status for user ${userId} to ${status}`);
}

function findUserSocket(userId) {
  // Find socket for a specific user
  const userSockets = io.sockets.adapter.rooms.get(`user:${userId}`);
  if (userSockets) {
    const socketId = Array.from(userSockets)[0];
    return io.sockets.sockets.get(socketId);
  }
  return null;
}