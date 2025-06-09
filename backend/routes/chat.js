// chat.js — Routes for retrieving chat history (global & private)

const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const { verifyJWT } = require('../utils/auth');

router.use(verifyJWT);

// Get last 25 global messages
router.get('/global', async (req, res) => {
  const messages = await Message.find({ receiver: null }).sort({ timestamp: -1 }).limit(25).populate('sender', 'username profilePic');
  res.json(messages.reverse());
});

// Get private chat history between two users
router.get('/private/:userId', async (req, res) => {
  const userA = req.user.id;
  const userB = req.params.userId;

  const messages = await Message.find({
    $or: [
      { sender: userA, receiver: userB },
      { sender: userB, receiver: userA }
    ]
  }).sort({ timestamp: 1 }).populate('sender', 'username profilePic');
  
  res.json(messages);
});

module.exports = router;
