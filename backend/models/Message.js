// Message.js — Mongoose schema for chat messages (global and player-to-player)

const mongoose = require('mongoose');
const { Schema } = mongoose;

const MessageSchema = new Schema({
  sender: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  receiver: { type: Schema.Types.ObjectId, ref: 'User', default: null }, // null for global
  content: { type: String, required: true },
  contentType: { type: String, enum: ['text', 'image', 'emoji'], default: 'text' },
  timestamp: { type: Date, default: Date.now },
  read: { type: Boolean, default: false }
});

module.exports = mongoose.model('Message', MessageSchema);
