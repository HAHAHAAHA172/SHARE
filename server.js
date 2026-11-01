import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI } from '@google/genai';
import { createApp } from './server/app.js';
import { readServerConfig, authClientFactory } from './src/security/server/config.js';

dotenv.config({ path: fileURLToPath(new URL('.env', import.meta.url)), quiet: true });
const config = readServerConfig();
const createAuthClient = authClientFactory(config);
const verifyAccessToken = async token => {
  const client = createAuthClient();
  if (!client) return null;
  const { data, error } = await client.auth.getUser(token);
  return error ? null : data.user;
};
const apiKey = process.env.GEMINI_API_KEY || process.env.GEMINI;
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;
const port = config.port;
const server = createApp({ ...config, ai, verifyAccessToken, createAuthClient }).listen(port, '0.0.0.0', () => {
  console.log(`S.H.A.R.E API ready on http://localhost:${port}`);
  if (!ai) console.log('Core resources are available. Set GEMINI_API_KEY in .env to enable P.E.D.R.O.');
});
server.requestTimeout = 60_000;
server.headersTimeout = 15_000;
server.keepAliveTimeout = 5_000;
