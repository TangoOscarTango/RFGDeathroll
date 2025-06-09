// Mongoose User model for DeathRoll player profile and authentication

const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  username: { type: String, required: true, unique: true },
  foxyPesos: { type: Number, default: 1000 },
  profilePic: { type: Number, default: 0 },
  borderPic: { type: Number, default: 0 },
  unlockedProfilePics: { type: String, default: '1000000' }, // 7 options
  unlockedBorderPics: { type: String, default: '100' },      // 3 options
  soundOn: { type: Boolean, default: true },
  musicOn: { type: Boolean, default: true },
  avatarURL: { type: String, default: '' },
  statusMessage: { type: String, default: '' },
  online: { type: Boolean, default: false }
});

module.exports = mongoose.model('User', UserSchema);
