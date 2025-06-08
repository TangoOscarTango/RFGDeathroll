//backend logic
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User'); // adjust if path differs

// POST /api/saveProfile
router.post('/saveProfile', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    console.log('[saveProfile] No token provided');
    return res.status(401).json({ message: 'No token provided' });
  }

  let userData;
  try {
    userData = jwt.verify(token, process.env.JWT_SECRET);
    console.log('[saveProfile] Token verified:', userData);
  } catch (err) {
    console.log('[saveProfile] Invalid token');
    return res.status(403).json({ message: 'Invalid token' });
  }

  const { profilePic, borderPic, username, deductFoxyPesos } = req.body;
  console.log('[saveProfile] Body:', req.body);

  if (typeof profilePic !== 'number' || typeof borderPic !== 'number' || typeof username !== 'string') {
    console.log('[saveProfile] Invalid input types');
    return res.status(400).json({ message: 'Invalid input types' });
  }

  try {
    const user = await User.findById(userData.userId);
    if (!user) {
      console.log('[saveProfile] User not found');
      return res.status(404).json({ message: 'User not found' });
    }

    if (username !== user.username) {
      const existing = await User.findOne({ username });
      if (existing) {
        console.log('[saveProfile] Username taken');
        return res.status(409).json({ message: 'Username already taken' });
      }

      if (user.foxyPesos < 50) {
        console.log('[saveProfile] Not enough FP');
        return res.status(400).json({ message: 'Not enough Foxy Pesos' });
      }

      console.log('[saveProfile] Deducting 50 FP and changing username');
      user.foxyPesos -= 50;
      user.username = username;
    }

    user.profilePic = profilePic;
    user.borderPic = borderPic;
    await user.save();
    console.log('[saveProfile] User saved successfully');

    res.json({
      username: user.username,
      profilePic: user.profilePic,
      borderPic: user.borderPic,
      unlockedProfilePics: user.unlockedProfilePics,
      unlockedBorderPics: user.unlockedBorderPics,
      foxyPesos: user.foxyPesos,
      soundOn: user.soundOn,
      musicOn: user.musicOn,
    });
  } catch (err) {
    console.error('[saveProfile] Server error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
