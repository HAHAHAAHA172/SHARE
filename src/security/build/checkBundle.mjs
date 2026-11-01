import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

const environment = { ...(fs.existsSync('.env') ? dotenv.parse(fs.readFileSync('.env')) : {}), ...process.env };
const secrets = Object.entries(environment).filter(([name, value]) =>
  !name.startsWith('VITE_') && /GEMINI|SECRET|SERVICE_ROLE|DATABASE_URL|PASSWORD|ACCESS_TOKEN/.test(name) && typeof value === 'string' && value.length >= 12);
const walk = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);
if (!fs.existsSync('dist/index.html')) throw new Error('Build the application before checking its bundle.');
const exposed = new Set();
for (const file of walk('dist').filter(file => /\.(js|css|html|map|json)$/.test(file))) {
  const content = fs.readFileSync(file, 'utf8');
  for (const [name, secret] of secrets) if (content.includes(secret)) exposed.add(name);
  if (/sb_secret_[A-Za-z0-9_-]+/.test(content)) exposed.add('secret-key pattern');
}
if (exposed.size) throw new Error(`Server credentials detected in the production bundle: ${[...exposed].join(', ')}. Values withheld.`);
console.log('PASS: no configured server credentials or Supabase secret-key patterns in production assets.');
