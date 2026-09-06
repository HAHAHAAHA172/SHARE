import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI });
const upload = multer({ dest: 'uploads/' });

// --- MAIN CHAT ROUTE (Handles Text and File Uploads) ---
app.post('/api/chat', upload.single('file'), async (req, res) => {
  try {
    let uploadedFile = null;

    // 1. If a file was attached to the chat message, upload it to Gemini
    if (req.file) {
      uploadedFile = await ai.files.upload({
        file: req.file.path,
        config: { mimeType: req.file.mimetype }
      });
    }

    // 2. Safely parse body (FormData sends history as JSON string, fetch sends it as object)
    const message = req.body.message || '';
    let history = [];
    if (req.body.history) {
      history = typeof req.body.history === 'string' 
        ? JSON.parse(req.body.history) 
        : req.body.history;
    }

    const cleanedMessage = message.replace(/\s+/g, ' ').trim();
    const cleanedHistory = history.slice(-6).map(item => ({
      role: item.role === 'bot' ? 'model' : 'user',
      parts: [{ text: item.text ? item.text.replace(/\s+/g, ' ').trim() : '' }]
    }));

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

    // 3. Send message with or without the file to Gemini
    let chatPayload;
    if (uploadedFile) {
      chatPayload = [uploadedFile, cleanedMessage || "Please analyze this attached document."];
    } else {
      chatPayload = cleanedMessage;
    }

    const resultStream = await chat.sendMessageStream({ message: chatPayload });
    
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

// --- QUIZ ROUTE: GENERATE FROM TOPIC ---
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
      config: { responseMimeType: "application/json" }
    });

    res.json(JSON.parse(response.text));
  } catch (error) {
    console.error('Quiz generation error:', error);
    res.status(500).json({ error: 'Failed to generate quiz' });
  }
});

// --- QUIZ ROUTE: GENERATE FROM FILE ---
app.post('/api/quiz/generate-from-file', upload.single('document'), async (req, res) => {
  try {
    const items = parseInt(req.body.items);
    const parts = parseInt(req.body.parts);
    const partTypes = JSON.parse(req.body.partTypes);
    const instructions = req.body.instructions || 'General coverage';

    const uploadedFile = await ai.files.upload({
      file: req.file.path,
      mimeType: req.file.mimetype
    });

    let partsDescription = "";
    for (let i = 0; i < parts; i++) {
      partsDescription += `Part ${i + 1} must be strictly type: ${partTypes[i] || 'multiple choice'}.\n`;
    }

    const prompt = `Based on the attached document, generate an academic quiz.
    Specific instructions: ${instructions}
    The quiz must have ${parts} parts and a total of ${items} items distributed across them.\n${partsDescription}
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
      contents: [uploadedFile, prompt],
      config: { responseMimeType: "application/json" }
    });

    res.json(JSON.parse(response.text));
  } catch (error) {
    console.error('File Quiz generation error:', error);
    res.status(500).json({ error: 'Failed to generate quiz from file' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});