const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI("AIzaSyANEObu86QiRhhuoFwdeQfAYkIcuGkEp6g"); 
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

const SYSTEM_PROMPT = `
You are "Trauma Assistant", a compassionate and professional trauma therapist.
Your role:
- Provide empathetic, supportive, and non-judgmental responses.
- Encourage safe emotional expression.
- Offer gentle coping strategies (like breathing exercises, grounding techniques).
- Never replace a real therapist, but act as a helpful companion.
- Be concise, but warm and caring.
`;

async function getGeminiResponse(prompt) {





  try {
    const result = await model.generateContent(SYSTEM_PROMPT+prompt);
    return result.response.text();
  } catch (err) {
    console.error("❌ Gemini Error:", err);
    return "Sorry, I couldn't process that right now.";
  }
}

module.exports = getGeminiResponse;
