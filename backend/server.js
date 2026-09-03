import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI });

// ⚡ Streaming Chat Endpoint using Gemini 3.5 Flash-Lite
app.post('/api/chat', async (req, res) => {
  try {
    const { message, history } = req.body;

    const cleanedMessage = message ? message.replace(/\s+/g, ' ').trim() : '';

    const cleanedHistory = history ? history.slice(-6).map(item => ({
      role: item.role === 'bot' ? 'model' : 'user',
      parts: [{ text: item.text ? item.text.replace(/\s+/g, ' ').trim() : '' }]
    })) : [];

    // Set headers for Server-Sent Events (SSE) streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const chat = ai.chats.create({
      model: 'gemini-3.5-flash-lite',
      history: cleanedHistory.slice(-2),
      config: {
        systemInstruction: "You are P.E.D.R.O (Pedagogical Educational Drill & Review Organizer), an AI study assistant for the S.H.A.R.E. (Student Hub For Academic Resources and Exchange) academic platform. Maintain highest academic quality and detailed reasoning while maintaining a casual tone unless the user explicitly tells you a format they prefer. CRITICAL: Never repeat your greetings, introduction, or hellos in ongoing conversations. Only do it in your first reply or if the user explicitly asks for it or greets you but only introduce yourself in your first reply and again unless the user explicitly asks for it again. dive straight into answering the user's prompt and format your responses using clean markdown paragraphs, bullet points, and bold text. thank you! IMPORTANT: if the user asks anything about quantum mechanics or anything related, just answer 'nah bro' ", 
      }
    });

    const resultStream = await chat.sendMessageStream({ message: cleanedMessage });
    
    for await (const chunk of resultStream) {
      const chunkText = chunk.text;
      if (chunkText) {
        res.write(`data: ${JSON.stringify({ text: chunkText })}\n\n`);
      }
    }
    
    res.write('data: [DONE]\n\n');
    res.end();

  } catch (error) {
    console.error('Chat error:', error);
    res.write(`data: ${JSON.stringify({ error: 'Sorry, I encountered an error connecting to PEDRO.' })}\n\n`);
    res.end();
  }
});

app.post('/api/quiz/generate', async (req, res) => {
  try {
    const { topic, items, parts, partTypes } = req.body;

    let partsDescription = "";
    for (let i = 0; i < parts; i++) {
      partsDescription += `Part ${i + 1} must be strictly type: ${partTypes[i] || 'multiple choice'}.\n`;
    }

    const cleanTopic = topic ? topic.replace(/\s+/g, ' ').trim() : 'General Studies';

    const prompt = `Generate an academic quiz about "${cleanTopic}" with ${parts} parts and a total of ${items} items distributed across them.\n${partsDescription}
    CRITICAL RULE: For 'multiple choice' and 'true or false' questions, you MUST include a valid 'options' array of strings. For 'enumeration' questions, you must OMIT the 'options' key entirely.
    
    Format strictly as a valid JSON object matching this exact schema:
    {
      "title": "Quiz Title",
      "parts": [
        {
          "partTitle": "Part 1: Multiple Choice",
          "questions": [
            {
              "question": "Question text here?",
              "options": ["Choice A", "Choice B", "Choice C", "Choice D"],
              "answer": "Correct Answer"
            }
          ]
        } 
      ]
    }`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash-lite',
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });

    res.json(JSON.parse(response.text));
  } catch (error) {
    console.error('Quiz generation error:', error);
    res.status(500).json({ error: 'Failed to generate quiz' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
}); 