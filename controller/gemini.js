// controller/gemini.js

const axios = require("axios");

const API_KEY = "AIzaSyAdHju1NIDjUIow5mqd2bUgfe_bYz3GAFg";
const API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

// System prompt for Trauma Assistant
const SYSTEM_PROMPT = `
You are "Trauma Assistant", a compassionate and professional trauma therapist.
Your role:
- Provide empathetic, supportive, and non-judgmental responses.
- Encourage safe emotional expression.
- Offer gentle coping strategies (like breathing exercises, grounding techniques).
- Never replace a real therapist, but act as a helpful companion.
- Be concise, but warm and caring.
`;

// Store chat history per user (in-memory)
const chatHistories = new Map();

/**
 * Get or initialize chat history for a user
 * @param {string} userId - Unique identifier for the user
 */
function getChatHistory(userId) {
  if (!chatHistories.has(userId)) {
    chatHistories.set(userId, []);
  }
  return chatHistories.get(userId);
}

/**
 * Clear a user's chat history
 * @param {string} userId - Unique identifier for the user
 */
function clearChatHistory(userId) {
  chatHistories.delete(userId);
}

/**
 * Format conversation history for Gemini API
 * @param {Array} history - Conversation history
 * @returns {Array} Formatted contents array
 */
function formatHistory(history) {
  return history
    .filter(msg => msg && (msg.text || msg.content)) // Filter out invalid messages
    .map(msg => {
      const text = msg.text || msg.content || msg.parts?.[0]?.text || "";
      return {
        role: msg.role === "user" ? "user" : "model",
        parts: [{ text: String(text).trim() }]
      };
    })
    .filter(msg => msg.parts[0].text !== ""); // Remove empty messages
}

/**
 * Get response from Gemini using direct HTTP POST
 * @param {string} prompt - User's message
 * @param {string} userId - Unique identifier for the user (default: 'default')
 * @param {Array} externalHistory - Optional external history (from DB)
 */
async function getGeminiResponse(prompt, userId = "default", externalHistory = null) {
  try {
    // Use external history if provided, otherwise use in-memory history
    let history;
    if (externalHistory && Array.isArray(externalHistory)) {
      history = externalHistory;
    } else {
      history = getChatHistory(userId);
    }

    // Build the contents array: system prompt + history + new user message
    const contents = [];

    // Add system instruction as first user message if history is empty
    if (history.length === 0) {
      contents.push({
        role: "user",
        parts: [{ text: SYSTEM_PROMPT }]
      });
      contents.push({
        role: "model",
        parts: [{ text: "I understand. I'm here to provide compassionate support as your Trauma Assistant. How can I help you today?" }]
      });
    }

    // Add conversation history (with validation)
    const formattedHistory = formatHistory(history);
    contents.push(...formattedHistory);

    // Add current user message
    contents.push({
      role: "user",
      parts: [{ text: String(prompt).trim() }]
    });

    console.log("📤 Sending to Gemini:", JSON.stringify({ contents }, null, 2));

    // Make POST request to Gemini API
    const response = await axios.post(
      API_URL,
      {
        contents: contents,
        generationConfig: {
          maxOutputTokens: 1000,
          temperature: 0.7,
        }
      },
      {
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": API_KEY
        }
      }
    );

    // Extract the response text
    const aiResponse = response.data.candidates[0].content.parts[0].text;

    // Update in-memory chat history (only if not using external history)
    if (!externalHistory) {
      const userHistory = getChatHistory(userId);
      userHistory.push({ role: "user", text: prompt });
      userHistory.push({ role: "model", text: aiResponse });

      // Keep only last 20 messages (10 exchanges) to manage memory
      if (userHistory.length > 20) {
        userHistory.splice(0, userHistory.length - 20);
      }
    }

    return aiResponse;

  } catch (err) {
    console.error("❌ Gemini Error:", err.response?.data || err.message);

    // If error is related to conversation context, try resetting
    if (err.response?.status === 400) {
      console.log("🔄 Clearing chat history and retrying...");
      clearChatHistory(userId);

      try {
        // Retry with fresh context - simple single message
        const response = await axios.post(
          API_URL,
          {
            contents: [
              {
                role: "user",
                parts: [{ text: `${SYSTEM_PROMPT}\n\nUser: ${prompt}` }]
              }
            ],
            generationConfig: {
              maxOutputTokens: 1000,
              temperature: 0.7,
            }
          },
          {
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": API_KEY
            }
          }
        );

        const aiResponse = response.data.candidates[0].content.parts[0].text;
        
        // Start fresh history
        const userHistory = getChatHistory(userId);
        userHistory.push({ role: "user", text: prompt });
        userHistory.push({ role: "model", text: aiResponse });

        return aiResponse;

      } catch (retryErr) {
        console.error("❌ Retry failed:", retryErr.response?.data || retryErr.message);
        return "I apologize, but I'm having trouble processing your message. Please try starting a new conversation.";
      }
    }

    return "Sorry, I couldn't process that right now. Please try again.";
  }
}

// Export functions
module.exports = getGeminiResponse;
module.exports.getGeminiResponse = getGeminiResponse;
module.exports.clearChatHistory = clearChatHistory;
module.exports.getChatHistory = getChatHistory;