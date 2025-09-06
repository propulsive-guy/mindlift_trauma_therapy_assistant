const mongoose = require("mongoose");

const chatSchema = new mongoose.Schema({
  userId: String,
  role: String, // "user" or "model"
  message: String,
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Chat", chatSchema);
