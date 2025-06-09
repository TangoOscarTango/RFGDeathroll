// server.js — Main entry point, handles REST and socket logic

const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const { Server } = require('socket.io');
const http = require('http');
require('dotenv').config();
const { socketAuth } = require('./utils/auth');
const Message = require('./models/Message');
const User = require('./models/User');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: 'https://rfgdeathroll-frontend.onrender.com',
    methods: ['GET', 'POST'],
  },
});

app.use(cors({
  origin: '*', // temporarily allow all origins for testing
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());

mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => console.log('MongoDB connected'))
  .catch(err => console.log(err));

const RoomSchema = new mongoose.Schema({
  roomId: { type: String, required: true, unique: true },
  player1: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  player2: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  wager: { type: Number, required: true },
  status: { type: String, default: 'open' },
  currentMax: { type: Number, default: 1000 },
  currentPlayer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  rolls: [{
    player: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    value: { type: Number },
  }],
  winner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
});
const Room = mongoose.model('Room', RoomSchema);

const authenticateToken = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
};

app.post('/api/check-email', async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });
  res.json({ exists: !!user });
});

app.post('/api/signup', async (req, res) => {
  console.log('Received signup request:', req.body);
  const { email, password, username } = req.body;
  try {
    console.log('Checking for existing username:', username);
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      console.log('Username check failed: Username already exists');
      return res.status(400).json({ error: 'Username already taken' });
    }
    console.log('Username check passed, proceeding to hash password');
    const hashedPassword = await bcrypt.hash(password, 10);
    console.log('Password hashed, creating new user');
    const user = new User({ email, password: hashedPassword, username, foxyPesos: 1000 });
    console.log('Attempting to save user:', user);
    await user.save();
    console.log('User saved successfully');
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET);
    console.log('Token generated:', token);
    console.log('Sending success response');
    res.status(201).json({ token, foxyPesos: user.foxyPesos });
  } catch (error) {
    console.error('Error during signup:', error.message);
    if (error.code === 11000) {
      console.log('Database unique constraint violation:', error.message);
      return res.status(400).json({ error: 'Username or email already taken' });
    }
    console.log('Sending error response');
    res.status(500).json({ error: 'Error signing up' });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user) return res.status(400).json({ error: 'Invalid email or password' });
  const validPassword = await bcrypt.compare(password, user.password);
  if (!validPassword) return res.status(400).json({ error: 'Invalid email or password' });
  const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET);
  res.json({ token, foxyPesos: user.foxyPesos });
});

app.get('/api/user', authenticateToken, async (req, res) => {
  const user = await User.findById(req.user.userId).select('-password');
  res.json(user);
});

app.post('/api/rooms', authenticateToken, async (req, res) => {
  const { wager } = req.body;
  const user = await User.findById(req.user.userId);
  if (user.foxyPesos < wager) return res.status(400).json({ error: 'Insufficient Foxy Pesos' });
  user.foxyPesos -= wager;
  await user.save();
  const roomId = Math.random().toString(36).substring(2, 15);
  const room = new Room({
    roomId,
    player1: req.user.userId,
    wager,
    currentPlayer: req.user.userId,
    currentMax: wager // Set initial currentMax to wager
  });
  await room.save();
  io.emit('roomCreated', room);
  res.json(room);
});

app.post('/api/rooms/:id/join', authenticateToken, async (req, res) => {
  const room = await Room.findOne({ roomId: req.params.id }).populate('player1 player2');
  if (!room || room.status !== 'open') return res.status(400).json({ error: 'Room not available' });
  const user = await User.findById(req.user.userId);
  if (user.foxyPesos < room.wager) return res.status(400).json({ error: 'Insufficient Foxy Pesos' });
  if (room.player1._id.toString() === req.user.userId) return res.status(400).json({ error: 'Cannot join your own room' });
  user.foxyPesos -= room.wager;
  await user.save();
  room.player2 = req.user.userId;
  room.status = 'active';
  room.currentPlayer = Math.random() < 0.5 ? room.player1 : req.user.userId; //randomly choose the current player
  await room.save();
  const populatedRoom = await Room.findOne({ roomId: req.params.id }).populate('player1 player2');
  io.emit('playerJoined', populatedRoom);
  res.json(populatedRoom);
});

app.post('/api/rooms/:id/roll', authenticateToken, async (req, res) => {
  const room = await Room.findOne({ roomId: req.params.id }).populate('player1 player2');
  if (!room || room.status !== 'active') return res.status(400).json({ error: 'Room not active' });
  if (room.currentPlayer.toString() !== req.user.userId) return res.status(400).json({ error: 'Not your turn' });
  
  // Fix: Roll from 1 to currentMax - 1
  const maxRoll = room.currentMax || room.wager; // Use wager as initial max if currentMax is unset
  const rollValue = Math.floor(Math.random() * (maxRoll - 1)) + 1;
  
  room.rolls.push({ player: req.user.userId, value: rollValue });
  room.currentMax = rollValue;
  room.currentPlayer = room.player1._id.toString() === req.user.userId ? room.player2._id : room.player1._id;
  if (rollValue === 1) {
    room.status = 'closed';
    const winner = room.currentPlayer;
    room.winner = winner;
    const loserId = room.player1._id.toString() === winner.toString() ? room.player2._id : room.player1._id;
    const winnerUser = await User.findById(winner);
    const loserUser = await User.findById(loserId);
    winnerUser.foxyPesos += room.wager * 2;
    await winnerUser.save();
    await loserUser.save();
    await room.save();
    io.emit('gameEnded', { roomId: room.roomId, winner: winner._id });
    return res.json({ rollValue });
  }
  await room.save();
  io.to(room.roomId).emit('rollResult', {
    roomId: room.roomId,
    player: req.user.userId,
    value: rollValue,
  });
  console.log('rollResult emitted to room', room.roomId, 'with value', rollValue);
  res.json({ rollValue });
  console.log('ROLL RESULT EMITTED:', { roomId: req.params.id, player: req.user.userId, value: rollValue });
});

app.get('/api/rooms', async (req, res) => {
  const rooms = await Room.find().populate('player1 player2');
  res.json(rooms);
});

app.post('/api/clear-rooms', async (req, res) => {
  await Room.deleteMany({});
  io.emit('roomsCleared');
  res.json({ message: 'Rooms cleared' });
});

io.use(socketAuth);

io.on('connection', async (socket) => {
  const userId = socket.user.userId;

  // Mark user online
  await User.findByIdAndUpdate(userId, { online: true });

  // Join rooms
  socket.join('globalChat');
  socket.join(`user:${userId}`);

  // Global message
  socket.on('globalMessage', async (data) => {
  const user = await User.findById(userId).select('username chatColor');
  const msg = new Message({ sender: userId, content: data.content });
  await msg.save();

  io.to('globalChat').emit('globalMessage', {
    senderId: userId,
    senderUsername: user.username,
    chatColor: user.chatColor, // ✅ send this
    content: data.content,
    timestamp: msg.timestamp
  });
});

  // Private message
  socket.on('privateMessage', async ({ to, content, contentType }) => {
    const msg = new Message({ sender: userId, receiver: to, content, contentType });
    await msg.save();
    const room = [`user:${userId}`, `user:${to}`].sort().join(':');
    io.to(`user:${to}`).emit('privateMessage', {
      from: userId,
      content,
      contentType,
      timestamp: msg.timestamp
    });
  });

  // Typing indicator
  socket.on('typing', ({ to, isTyping }) => {
    io.to(`user:${to}`).emit('typing', { from: userId, isTyping });
  });

  // Rolling the Dice
  socket.on('roll', async ({ roomId, userId }) => {
  console.log('ROLL RECEIVED:', { roomId, userId });

  const room = await Room.findOne({ roomId }).populate('player1 player2');
  if (!room || room.status !== 'active') return;

  if (room.currentPlayer.toString() !== userId) return;

  const maxRoll = room.currentMax || room.wager;
  const roll = Math.floor(Math.random() * (maxRoll - 1)) + 1;

  room.rolls.push({ player: userId, value: roll });
  room.currentMax = roll;

  if (roll === 1) {
    room.status = 'closed';
    room.winner = room.player1._id.toString() === userId ? room.player2._id : room.player1._id;
    await room.save();

    io.to(roomId).emit('game_over', {
      winner: room.winner,
      loser: userId,
      finalRoll: roll,
      rolls: room.rolls
    });
    return;
  }

  room.currentPlayer = room.player1._id.toString() === userId ? room.player2._id : room.player1._id;
  await room.save();

  io.to(roomId).emit('room_update', {
    roomId: room.roomId,
    currentMax: room.currentMax,
    currentPlayer: room.currentPlayer,
    rolls: room.rolls
  });
});

  // Disconnect
  socket.on('disconnect', async () => {
    await User.findByIdAndUpdate(userId, { online: false });
  });
});

const profileRoutes = require('./routes/profile');
app.use('/api', profileRoutes);
const chatRoutes = require('./routes/chat');
app.use('/api/chat', chatRoutes);

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
