import multer from 'multer';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { open, readFile, unlink } from 'node:fs/promises';
import { httpError } from './validation.js';

const types = {
  '.pdf': ['application/pdf'], '.txt': ['text/plain'],
  '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  '.pptx': ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  '.doc': ['application/msword'], '.jpg': ['image/jpeg'], '.jpeg': ['image/jpeg'],
  '.png': ['image/png'], '.webp': ['image/webp'], '.mp4': ['video/mp4'], '.webm': ['video/webm'],
};
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export function createUpload(directory, { kind = 'ai' } = {}) {
  return multer({
    storage: multer.diskStorage({
      destination: directory,
      filename: (_req, file, done) => done(null, `${randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
    }),
    limits: { fileSize: kind === 'avatar' ? 5 * 1024 * 1024 : MAX_UPLOAD_BYTES, files: kind === 'resource' ? 4 : 1, fields: 8, fieldSize: 80 * 1024, parts: kind === 'resource' ? 14 : 10 },
    fileFilter: (_req, file, done) => {
      const extension = path.extname(file.originalname).toLowerCase();
      const permitted = kind === 'avatar' ? ['.jpg', '.jpeg', '.png', '.webp'].includes(extension) : (kind !== 'ai' || !['.doc', '.pptx', '.mp4', '.webm'].includes(extension));
      if (!permitted || !types[extension]?.includes(file.mimetype)) return done(httpError(400, 'Unsupported attachment format.'));
      done(null, true);
    },
  });
}

export async function removeUpload(file) {
  if (file?.path) await unlink(file.path).catch(() => {});
}

export async function validateUploadedFile(file, { kind = 'ai' } = {}) {
  if (!file) return;
  const extension = path.extname(file.originalname).toLowerCase();
  const handle = await open(file.path, 'r');
  let head;
  try {
    const buffer = Buffer.alloc(8192);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    head = buffer.subarray(0, bytesRead);
  } finally { await handle.close(); }
  const archive = ['.docx', '.pptx'].includes(extension) ? await readFile(file.path) : head;
  const prefix = hex => head.subarray(0, hex.length / 2).equals(Buffer.from(hex, 'hex'));
  const valid = {
    '.pdf': () => head.subarray(0, 5).toString() === '%PDF-',
    '.jpg': () => prefix('ffd8ff'), '.jpeg': () => prefix('ffd8ff'),
    '.png': () => prefix('89504e470d0a1a0a'),
    '.webp': () => head.subarray(0, 4).toString() === 'RIFF' && head.subarray(8, 12).toString() === 'WEBP',
    '.docx': () => prefix('504b0304') && archive.includes(Buffer.from('word/')),
    '.pptx': () => prefix('504b0304') && archive.includes(Buffer.from('ppt/')),
    '.doc': () => prefix('d0cf11e0a1b11ae1'),
    '.mp4': () => head.subarray(4, 8).toString() === 'ftyp', '.webm': () => prefix('1a45dfa3'),
    '.txt': () => {
      if (head.includes(0)) return false;
      try { new TextDecoder('utf-8', { fatal: true }).decode(head, { stream: true }); return true; }
      catch { return false; }
    },
  };
  if (!file.size || !types[extension]?.includes(file.mimetype) || (kind === 'ai' && ['.doc', '.pptx', '.mp4', '.webm'].includes(extension)) || !valid[extension]?.()) {
    await removeUpload(file);
    throw httpError(400, 'The attachment contents do not match a supported file format.');
  }
}
