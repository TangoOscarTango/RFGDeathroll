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
app.use(cors({ origin: 'https://rfgdeathroll-frontend.onrender.com' })); // Replace with your Render frontend URL after deployment - DONE 05-29-25

mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });

const UserSchema = new mongoose.Schema({
    email: String,
    password: String,
    foxyPesos: { type: Number, default: 1000 },
});
const RoomSchema = new mongoose.Schema({
    roomId: Number,
    player1: String,
    player2: String,
    wager: Number,
    currentMax: Number,
    currentPlayer: String,
    status: String,
    rolls: [{ player: String, value: Number }],
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
    if (req.user.foxyPesos < wager) return res.status(400).json({ error: 'Insufficient Foxy Pesos' });
    req.user.foxyPesos -= wager;
    await req.user.save();
    const room = new Room({
        roomId: Date.now(),
        player1: req.user._id,
        wager,
        status: 'open',
    });
    await room.save();
    io.emit('roomCreated', room);
    res.json(room);
});

app.post('/api/rooms/:id/join', auth, async (req, res) => {
    const room = await Room.findOne({ roomId: req.params.id });
    if (!room || room.status !== 'open') return res.status(400).json({ error: 'Room unavailable' });
    if (req.user.foxyPesos < room.wager) return res.status(400).json({ error: 'Insufficient Foxy Pesos' });
    req.user.foxyPesos -= room.wager;
    await req.user.save();
    room.player2 = req.user._id;
    room.status = 'active';
    room.currentMax = room.wager;
    room.currentPlayer = room.player1;
    await room.save();
    io.emit('playerJoined', room);
    res.json(room);
});

app.post('/api/rooms/:id/roll', auth, async (req, res) => {
    const room = await Room.findOne({ roomId: req.params.id });
    if (!room || room.status !== 'active') return res.status(400).json({ error: 'Room not active' });
    if (room.currentPlayer !== req.user._id.toString()) return res.status(400).json({ error: 'Not your turn' });
    const rollValue = crypto.randomInt(1, room.currentMax + 1);
    room.rolls.push({ player: req.user._id, value: rollValue });
    io.emit('rollResult', { roomId: room.roomId, player: req.user._id, value: rollValue });

    if (rollValue === 1) {
        const winnerId = room.currentPlayer === room.player1 ? room.player2 : room.player1;
        const winner = await User.findById(winnerId);
        winner.foxyPesos += room.wager * 2;
        await winner.save();
        room.status = 'closed';
        io.emit('gameEnded', { roomId: room.roomId, winner: winnerId });
    } else {
        room.currentMax = rollValue;
        room.currentPlayer = room.currentPlayer === room.player1 ? room.player2 : room.player1;
    }
    await room.save();
    res.json({ rollValue });
});

app.get('/api/rooms', async (req, res) => {
    const rooms = await Room.find({ status: 'open' });
    res.json(rooms);
});

io.on('connection', (socket) => {
    console.log('User connected');
    socket.on('disconnect', () => console.log('User disconnected'));
});

server.listen(process.env.PORT || 3001, () => console.log('Server running on port', process.env.PORT || 3001));
