const express = require('express');
const path = require("path");  
const ejs = require("ejs");
const mongoose = require("mongoose");
const session = require("express-session");

const User = require("./model/user");
const Chat = require("./model/chat");   // ✅ import chat schema
const getGeminiResponse = require("./controller/gemini");

const port = 3000;
const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: "priyanshu",  
  resave: false,
  saveUninitialized: true,
}));

// MongoDB Connection
mongoose.connect("mongodb+srv://test1:test121@cluster0.3jrysla.mongodb.net/traumaDB?retryWrites=true&w=majority")
  .then(() => console.log("✅ Connected to MongoDB Atlas"))
  .catch(err => console.error("❌ MongoDB connection error:", err));

// View Engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "view"));

// ---------------- ROUTES ----------------

// Home
app.get('/home', (req,res) => {
  res.sendFile(path.join(__dirname,"view","home.html"));
});

// Signup
app.get('/signup',(req,res)=>{
  res.sendFile(path.join(__dirname, "view", "signup.html"));
});

app.post('/signup', async (req,res)=>{
  try {
    const { name, email, password } = req.body;
    const nuser = new User({ name, email, password });
    await nuser.save();
    res.redirect('/login');
  } catch (err) {
    res.status(400).send("Error: " + err.message);
  }
});

// Login
app.get('/login',(req,res)=>{
  res.sendFile(path.join(__dirname, "view", "login.html"));
});

app.post('/login', async (req,res)=>{
  try {
    const { name, password } = req.body;
    const nuser = await User.findOne({ name });

    if (!nuser) {
      return res.status(400).send("No user found with this name");
    }

    if (nuser.password !== password) {
      return res.status(400).send("Wrong password");
    }

    // ✅ Save user info in session
    req.session.userId = nuser._id;
    req.session.userName = nuser.name;

    res.redirect('/chat');
  } catch (err) {
    res.status(500).send("Server error: " + err.message);
  }
});

// Chat page
app.get("/chat", async (req, res) => {
    if (!req.session.userName) {
      return res.redirect("/login");
    }
  
    try {
      const history = await Chat.find({ user: req.session.userName }).sort({ timestamp: 1 });
      res.render("chat", { name: req.session.userName, history });
    } catch (err) {
      console.error("❌ Error fetching chat history:", err);
      res.render("chat", { name: req.session.userName, history: [] });
    }
  });

// Chat API
// Chat API
app.post("/chat-api", async (req, res) => {
    try {
      if (!req.session.userId) 
        return res.status(401).json({ reply: "Unauthorized" });
  
      const { message } = req.body;
      if (!message) 
        return res.status(400).json({ reply: "No message provided" });
  
      // ✅ Save user message
      await Chat.create({
        userId: req.session.userId,
        role: "user",
        message
      });
  
      // ✅ Get last 20 messages for context
      const history = await Chat.find({ userId: req.session.userId })
        .sort({ timestamp: 1 })
        .limit(20);
  
      const formattedHistory = history.map(h => ({
        role: h.role,
        parts: h.message
      }));
  
      // ✅ Call Gemini with history
      const reply = await getGeminiResponse(formattedHistory);
  
      // ✅ Save model reply
      await Chat.create({
        userId: req.session.userId,
        role: "model",
        message: reply
      });
  
      res.json({ reply });
    } catch (err) {
      console.error("Chat error:", err);
      res.status(500).json({ reply: "Server error: " + err.message });
    }
  });


  // Fetch chat history for logged-in user
app.get("/chat-history", async (req, res) => {
    try {
      if (!req.session.userId) return res.json({ messages: [] });
  
      const messages = await Chat.find({ userId: req.session.userId })
        .sort({ timestamp: 1 })
        .limit(50); // last 50 messages
  
      res.json({ messages });
    } catch (err) {
      console.error("History error:", err);
      res.status(500).json({ messages: [] });
    }
  });
  
  

// Start Server
app.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port}`);
});
