import { GoogleGenerativeAI } from "@google/generative-ai";
import { GoogleGenAI } from "@google/genai";

const genAI = new GoogleGenerativeAI(process.env.Llm_Api_Key1);

// send a journal entry  and past 5 related entries . it will return a responce form ai
export const getAIFeedback = (genAIClient = genAI) => async (entryContent, pastEntries) => {
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
      5. return rating varing from 1 to 10 signifying how relevant or important were the past enteries as a context .
      6. add a 6 to 7 line paragraph what insight or relevance can be fond from the past entries history  
    `;

    // 3. Initialize the fast model layer
    const model = genAIClient.getGenerativeModel({ model: "gemini-2.5-flash" });

    // 4. Initiate the live content stream transaction
    // Passing the prompt structure and the current live entry content separately
    const result = await model.generateContentStream([systemPrompt, entryContent]);
    
    return result.stream;
  } catch (err) {
    console.error("❌ AI Service Internal Pipeline Error:", err);
    throw new Error("Failed to initialize generative feedback stream");
  }
};

export const generateRoomDigest = () => async (entries,key) => {
  const genAIClient = new GoogleGenerativeAI(key);
  const model = genAIClient.getGenerativeModel({ model: "gemini-2.0-flash-lite" });

 const entryText = entries
    .map(e => `- ${e.username}: ${e.content}`)
    .join("\n");

  const prompt = `
    You are a technical project manager. Below is a list of journal entries 
    from a development team for today. 
    
    ENTRIES:
    ${entryText}
    
    TASK:
    Create a "Daily Standup Summary" for each user seperately. 
    Focus on: What was accomplished by every user .
    Keep it concise and professional.
  `;

  const result = await model.generateContent(prompt);
  return result.response.text();
};
export const generateDigest = generateRoomDigest();

export const generateEmbeddings = (GoogleGenAILib = GoogleGenAI) => async (text) => {
  try {
    // If there is no text content (e.g., an image-only entry), return an empty array
    if (!text || text.trim() === "") return [];
    const AI = new GoogleGenAILib({
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