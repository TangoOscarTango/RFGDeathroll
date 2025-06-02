const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: 'https://rfgdeathroll-frontend.onrender.com',
    methods: ['GET', 'POST'],
    credentials: true
  }
});
const JWT_SECRET = process.env.JWT_SECRET;

app.use(express.json());
app.use(cors({ origin: 'https://rfgdeathroll-frontend.onrender.com' }));

mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

const UserSchema = new mongoose.Schema({
  email: String,
  password: String,
  foxyPesos: { type: Number, default: 1000 },
});
const RoomSchema = new mongoose.Schema({
  roomId: Number,
  player1: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  player2: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  wager: Number,
  currentMax: Number,
  currentPlayer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  status: String,
  rolls: [{ player: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, value: Number }],
});
const User = mongoose.model('User', UserSchema);
const Room = mongoose.model('Room', RoomSchema);

const auth = async (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = await User.findById(decoded.userId);
    next();
  } catch (e) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

app.post('/api/signup', async (req, res) => {
  const { email, password } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const user = new User({ email, password: hashedPassword });
  await user.save();
  const token = jwt.sign({ userId: user._id }, JWT_SECRET);
  res.json({ token, foxyPesos: user.foxyPesos });
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = jwt.sign({ userId: user._id }, JWT_SECRET);
  res.json({ token, foxyPesos: user.foxyPesos });
});

app.post('/api/rooms', auth, async (req, res) => {
  const { wager } = req.body;
  const wagerValue = parseInt(wager);
  if (isNaN(wagerValue) || wagerValue < 20) return res.status(400).json({ error: 'Minimum wager is 20 Foxy Pesos' });
  if (req.user.foxyPesos < wagerValue) return res.status(400).json({ error: 'Insufficient Foxy Pesos' });
  req.user.foxyPesos -= wagerValue;
  await req.user.save();
  console.log('Creating room with wager:', wagerValue);
  const room = new Room({
    roomId: Date.now(),
    player1: req.user._id,
    wager: wagerValue,
    status: 'open',
  });
  await room.save();
  console.log('Room saved:', room);
  io.emit('roomCreated', room);
  res.json(room);
});

app.post('/api/rooms/:id/join', auth, async (req, res) => {
  const room = await Room.findOne({ roomId: parseInt(req.params.id) }).populate('player1 player2 currentPlayer');
  if (!room || room.status !== 'open') return res.status(400).json({ error: 'Room unavailable' });
  if (req.user.foxyPesos < room.wager) return res.status(400).json({ error: 'Insufficient Foxy Pesos' });
  req.user.foxyPesos -= room.wager;
  await req.user.save();
  room.player2 = req.user._id;
  room.status = 'active';
  room.currentMax = 25; // Temporary setting for faster testing
  room.currentPlayer = room.player1;
  room.rolls = [];
  await room.save();
  console.log('Room joined and saved:', room);
  io.emit('playerJoined', room);
  res.json(room);
});

app.post('/api/rooms/:id/roll', auth, async (req, res) => {
  const room = await Room.findOne({ roomId: parseInt(req.params.id) }).populate('player1 player2 currentPlayer');
  console.log('Roll request for room:', req.params.id, 'by user:', req.user._id);
  if (!room) {
    console.log('Room not found:', req.params.id);
    return res.status(400).json({ error: 'Room not found' });
  }
  if (room.status !== 'active') {
    console.log('Room not active:', room.status);
    return res.status(400).json({ error: 'Room not active' });
  }
  console.log('Comparing currentPlayer:', room.currentPlayer._id, 'with user:', req.user._id);
  if (room.currentPlayer._id.toString() !== req.user._id.toString()) {
    console.log('Not your turn - currentPlayer:', room.currentPlayer._id, 'user:', req.user._id);
    return res.status(400).json({ error: 'Not your turn' });
  }
  const rollValue = crypto.randomInt(1, room.currentMax);
  if (rollValue >= room.currentMax) {
    console.log('Invalid roll value generated:', rollValue, 'exceeds currentMax:', room.currentMax);
    return res.status(500).json({ error: 'Internal roll generation error' });
  }
  room.rolls.push({ player: req.user._id, value: rollValue });
  console.log('Generated roll value:', rollValue);
  console.log('Emitting rollResult:', { roomId: room.roomId, player: req.user._id, value: rollValue });
  io.emit('rollResult', { roomId: room.roomId, player: req.user._id, value: rollValue });
  console.log('Socket clients:', io.engine.clientsCount);

  if (rollValue === 1) {
    const winnerId = room.currentPlayer.equals(room.player1) ? room.player2 : room.player1;
    const winner = await User.findById(winnerId);
    winner.foxyPesos += room.wager * 2;
    await winner.save();
    room.status = 'closed';
    console.log('Emitting gameEnded:', { roomId: room.roomId, winner: winnerId });
    io.emit('gameEnded', { roomId: room.roomId, winner: winnerId });
    console.log('Game ended:', { roomId: room.roomId, winner: winnerId });
  } else {
    room.currentMax = rollValue;
    room.currentPlayer = room.currentPlayer.equals(room.player1) ? room.player2 : room.player1;
  }
  await room.save();
  console.log('Roll processed:', { roomId: room.roomId, rollValue });
  res.json({ rollValue });
});

app.post('/api/clear-rooms', auth, async (req, res) => {
  await Room.deleteMany({});
  console.log('All rooms cleared');
  io.emit('roomsCleared');
  res.json({ message: 'All rooms cleared' });
});

app.get('/api/rooms', async (req, res) => {
  const rooms = await Room.find({ status: { $in: ['open', 'active'] } }).populate('player1 player2 currentPlayer');
  res.json(rooms);
});

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  socket.on('disconnect', () => console.log('User disconnected:', socket.id));
});

server.listen(process.env.PORT || 3001, () => console.log('Server running on port', process.env.PORT || 3001));
