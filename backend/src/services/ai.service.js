import { GoogleGenerativeAI } from "@google/generative-ai";
import { GoogleGenAI } from "@google/genai";

const genAI = new GoogleGenerativeAI(process.env.Llm_Api_Key);

// send a journal entry  and past 5 related entries . it will return a responce form ai
export const getAIFeedback = async (entryContent, pastEntries) => {
  try {
    // 1. Map recursive context blocks (handling cases where past AI feedback is empty)
    const contextBlocks = pastEntries
      .map((entry, i) => `
=== HISTORICAL JOURNAL REFERENCE #${i + 1} ===
[USER LOG]: "${entry.content}"
[PREVIOUS AI METRIC ANALYSIS]: "${entry.aiResponse || "No prior analysis recorded for this entry."}"
================================================
      `).join("\n");

    // 2. Build the highly targeted Mentor prompt instructions
    const systemPrompt = `
      You are an elite Developer Journal Mentor. Your goal is to provide insightful, 
      encouraging, and technical feedback based on a user's current journal entry.
      
      CONTEXT OF PAST ENTRIES AND PRIOR ANALYSIS:
      ${contextBlocks || "No past tracking logs available for this user in this room."}
      
      INSTRUCTIONS:
      1. Review the historical logs and prior AI analysis to identify continuity, persistent patterns, or compounding progress.
      2. If the user is wrestling with a bug, deliver high-level architectural suggestions or debugging mental models.
      3. Keep the tone professional, empowering, and grounded—acting as an expert senior developer peer.
      4. Crucial: Keep your complete response highly concise and strictly under 200 words.
    `;

    // 3. Initialize the fast model layer
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    // 4. Initiate the live content stream transaction
    // Passing the prompt structure and the current live entry content separately
    const result = await model.generateContentStream([systemPrompt, entryContent]);
    
    return result.stream;
  } catch (err) {
    console.error("❌ AI Service Internal Pipeline Error:", err);
    throw new Error("Failed to initialize generative feedback stream");
  }
};

export const generateRoomDigest = async (entries) => {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

  const entryText = entries.map(e => `- ${e.content}`).join("\n");

  const prompt = `
    You are a technical project manager. Below is a list of journal entries 
    from a development team for today. 
    
    ENTRIES:
    ${entryText}
    
    TASK:
    Create a 3-sentence "Daily Standup Summary". 
    Focus on: What was accomplished and what are the common blockers? 
    Keep it concise and professional.
  `;

  const result = await model.generateContent(prompt);
  return result.response.text();
};

export const generateEmbeddings = async (text) => {
  try {
    // If there is no text content (e.g., an image-only entry), return an empty array
    if (!text || text.trim() === "") return [];
    const AI = new GoogleGenAI({
  apiKey: process.env.Llm_Api_Key,
});
    const response = await AI.models.embedContent({
      model: "gemini-embedding-001",
      contents: text,
      config: {
        outputDimensionality: 768,
      },
    });
    return response.embeddings[0].values;
  } catch (error) {
    console.error("❌ Gemini Embedding Generation Failed:", error);
    throw new Error("Failed to process text semantic layer.");
  }
};