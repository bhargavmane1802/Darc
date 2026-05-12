import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.Llm_Api_Key);

// send a journal entry  and past 5 related entries . it will return a responce form ai
export const getAIFeedback = async (entryContent, pastEntries) => {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    // Format past entries into a readable string for context
    const contextString = pastEntries
      .map((e, i) => `Entry ${i + 1}: ${e.content}`)
      .join("\n\n");

    const systemPrompt = `
      You are an elite Developer Journal Mentor. Your goal is to provide insightful, 
      encouraging, and technical feedback based on a user's journal entry.
      
      CONTEXT OF PAST ENTRIES:
      ${contextString || "No past entries available."}
      
      INSTRUCTIONS:
      1. Look for patterns or progress compared to past entries.
      2. If they are stuck on a bug, offer a high-level architectural suggestion.
      3. Keep the tone professional yet supportive (like a senior dev peer).
      4. Keep the response under 200 words.
    `;

    const result = await model.generateContentStream([systemPrompt, entryContent]);
    return result.stream;
  } catch (err) {
    console.error("AI Service Error:", err);
    throw new Error("Failed to generate AI feedback");
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