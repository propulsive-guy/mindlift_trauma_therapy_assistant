const express = require('express');
const path = require("path");  
const ejs = require("ejs");
const mongoose = require("mongoose");
const session = require("express-session");

const User = require("./model/user");
const Chat = require("./model/chat");
const { getGeminiResponse, clearChatHistory } = require('./controller/gemini');

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
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 10000
})
.then(() => console.log("✅ Connected to MongoDB Atlas"))
.catch(err => console.error("❌ MongoDB connection error:", err));


// View Engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "view"));

// ---------------- ROUTES ----------------

// Home
app.get('/', (req,res) => {
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
    req.session.userId = nuser._id.toString();
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
    const history = await Chat.find({ userId: req.session.userId })
      .sort({ timestamp: 1 });
    
    // ✅ Pass both name and userId to the template
    res.render("chat", { 
      name: req.session.userName, 
      userId: req.session.userId,
      history 
    });
  } catch (err) {
    console.error("❌ Error fetching chat history:", err);
    res.render("chat", { 
      name: req.session.userName, 
      userId: req.session.userId,
      history: [] 
    });
  }
});

// Chat API
app.post("/chat-api", async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ reply: "Unauthorized" });
    }

    const { message, chatId } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ reply: "No message provided" });
    }

    console.log(`💬 User ${req.session.userName} (${chatId}): ${message}`);

    // ✅ Save user message to database
    await Chat.create({
      userId: req.session.userId,
      role: "user",
      message: message.trim()
    });

    // ✅ Get conversation history from database (last 20 messages)
    const history = await Chat.find({ userId: req.session.userId })
      .sort({ timestamp: 1 })
      .limit(20)
      .lean();

    // Format history for Gemini
    const formattedHistory = history.map(h => ({
      role: h.role,
      text: h.message
    }));

    // ✅ Call Gemini with user-specific session and history
    const sessionId = `${req.session.userId}_${chatId}`;
    const reply = await getGeminiResponse(message, sessionId, formattedHistory);

    console.log(`🤖 AI Reply: ${reply.substring(0, 100)}...`);

    // ✅ Save AI response to database
    await Chat.create({
      userId: req.session.userId,
      role: "model",
      message: reply
    });

    res.json({ reply });

  } catch (err) {
    console.error("❌ Chat error:", err);
    res.status(500).json({ 
      reply: "I apologize, but I'm having trouble right now. Please try again.",
      error: err.message 
    });
  }
});

// Fetch chat history for logged-in user
app.get("/chat-history", async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.json({ messages: [] });
    }

    const messages = await Chat.find({ userId: req.session.userId })
      .sort({ timestamp: 1 })
      .limit(50);

    res.json({ messages });
  } catch (err) {
    console.error("❌ History error:", err);
    res.status(500).json({ messages: [] });
  }
});

// Clear chat session (optional endpoint)
app.post("/clear-chat", async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ success: false });
    }

    const { chatId } = req.body;
    const sessionId = `${req.session.userId}_${chatId}`;
    
    clearChatHistory(sessionId);
    
    res.json({ success: true });
  } catch (err) {
    console.error("❌ Clear chat error:", err);
    res.status(500).json({ success: false });
  }
});

// Logout
app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/login");
});

// Start Server
app.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port}`);
});