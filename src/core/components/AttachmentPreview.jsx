import { Component, lazy, Suspense, useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import { apiFetch, apiUrl } from '../../shared/api.js';

const PdfPreview = lazy(() => import('./PdfPreview.jsx'));
const PptxPreview = lazy(() => import('./PptxPreview.jsx'));
const DocxPreview = lazy(() => import('./DocxPreview.jsx'));
const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const mediaUrlCache = new Map();
const videoUrlCache = new Map();
const MEDIA_URL_CACHE_LIMIT = 48;

const isPptxFile = file => file?.mimetype === PPTX_MIME || file?.originalname?.toLowerCase().endsWith('.pptx');
const isDocxFile = file => file?.mimetype === DOCX_MIME || file?.originalname?.toLowerCase().endsWith('.docx');

function rememberMediaUrl(src, value) {
  mediaUrlCache.delete(src);
  mediaUrlCache.set(src, value);
  while (mediaUrlCache.size > MEDIA_URL_CACHE_LIMIT) {
    const oldestKey = mediaUrlCache.keys().next().value;
    const oldestValue = mediaUrlCache.get(oldestKey);
    mediaUrlCache.delete(oldestKey);
    if (typeof oldestValue === 'string') URL.revokeObjectURL(oldestValue);
  }
}

function useAuthenticatedMedia(src, onError) {
  const [resolved, setResolved] = useState('');
  useEffect(() => {
    let active = true;
    const cached = mediaUrlCache.get(src);
    if (cached) rememberMediaUrl(src, cached);
    const request = cached || apiFetch(src, { timeoutMs: 120_000 })
      .then(response => {
        if (!response.ok) throw new Error('Preview unavailable');
        return response.blob();
      })
      .then(blob => {
        const url = URL.createObjectURL(blob);
        rememberMediaUrl(src, url);
        return url;
      })
      .catch(error => {
        mediaUrlCache.delete(src);
        throw error;
      });
    if (!cached) rememberMediaUrl(src, request);
    Promise.resolve(request)
      .then(url => { if (active) setResolved(url); })
      .catch(() => { if (active) onError?.(); });
    return () => { active = false; };
  }, [src, onError]);
  return resolved;
}

class PreviewErrorBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <DocumentFallback file={this.props.file} label="Preview unavailable" />;
    return this.props.children;
  }
}

export function InlineImage({ src, alt, onError }) {
  const resolved = useAuthenticatedMedia(src, onError);
  if (!resolved) return <span className="share-media-loading">Loading preview…</span>;
  return <img className="share-feed-media" src={resolved} alt={alt} loading="lazy" decoding="async" />;
}

function InlineVideo({ src, controls = false, autoPlay = false }) {
  const [failed, setFailed] = useState(false);
  const [resolved, setResolved] = useState('');
  useEffect(() => {
    let active = true;
    const cached = videoUrlCache.get(src);
    if (cached?.expiresAt > Date.now()) {
      Promise.resolve(cached.url).then(url => { if (active) setResolved(url); });
      return () => { active = false; };
    }
    const separator = src.includes('?') ? '&' : '?';
    apiFetch(`${src}${separator}media=1`, { timeoutMs: 20_000 })
      .then(response => {
        if (!response.ok) throw new Error('Video preview unavailable');
        return response.json();
      })
      .then(({ url }) => {
        if (!url) throw new Error('Video preview unavailable');
        videoUrlCache.set(src, { url, expiresAt: Date.now() + 240_000 });
        while (videoUrlCache.size > 16) videoUrlCache.delete(videoUrlCache.keys().next().value);
        if (active) setResolved(url);
      })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [src]);
  if (failed) return <DocumentFallback label="Video preview unavailable" />;
  if (!resolved) return <span className="share-media-loading">Loading video preview…</span>;
  return <video className="share-feed-media" src={resolved} controls={controls} autoPlay={autoPlay} muted={autoPlay || !controls} playsInline preload="metadata">Your browser cannot play this video.</video>;
}

function DocumentFallback({ file, label = 'Open attachment' }) {
  return <div className="share-document-preview"><FileText size={48} /><span>{label}</span>{file?.url && <a href={file.url} target="_blank" rel="noopener noreferrer" download={file.originalname}>{file.originalname || 'Open document'}</a>}</div>;
}

export function AttachmentCard({ file, onOpen }) {
  if (!file) return null;
  const resolvedFile = { ...file, url: apiUrl(file.url) };
  const type = file.mimetype || '';
  const open = event => { event.stopPropagation(); onOpen(resolvedFile); };
  if (type.startsWith('image/')) return <button type="button" className="share-feed-media-button" onClick={open}><InlineImage src={resolvedFile.url} alt={file.originalname || 'Post attachment'} /><span className="share-media-fallback">Preview unavailable — open the attachment</span></button>;
  if (type.startsWith('video/')) return <button type="button" className="share-feed-media-button" onClick={open}><InlineVideo src={resolvedFile.url} /></button>;
  if (type === 'application/pdf') return <button type="button" className="share-feed-file-preview share-pdf-card" onClick={open}><PreviewErrorBoundary file={resolvedFile}><Suspense fallback={<span className="share-media-loading">Loading PDF preview…</span>}><PdfPreview src={resolvedFile.url} /></Suspense></PreviewErrorBoundary><span>{file.originalname || 'Open PDF'}</span></button>;
  if (isPptxFile(file)) return <button type="button" className="share-feed-file-preview share-pptx-card" onClick={open}><PreviewErrorBoundary file={resolvedFile}><Suspense fallback={<span className="share-media-loading">Loading PowerPoint preview…</span>}><PptxPreview src={resolvedFile.url} filename={file.originalname} /></Suspense></PreviewErrorBoundary><span>{file.originalname || 'Open PowerPoint'}</span></button>;
  if (isDocxFile(file)) return <button type="button" className="share-feed-file-preview share-docx-card" onClick={open}><PreviewErrorBoundary file={resolvedFile}><Suspense fallback={<span className="share-media-loading">Loading Word preview...</span>}><DocxPreview src={resolvedFile.url} filename={file.originalname} /></Suspense></PreviewErrorBoundary></button>;
  return <button type="button" className="share-feed-file-preview" onClick={open}><FileText size={28} /><span>{file.originalname || 'Open attachment'}</span></button>;
}

export function AttachmentModalContent({ file }) {
  if (!file) return null;
  if (file.mimetype?.startsWith('image/')) return <InlineImage src={file.url} alt={file.originalname || 'Attachment'} />;
  if (file.mimetype?.startsWith('video/')) return <InlineVideo src={file.url} controls autoPlay />;
  if (file.mimetype === 'application/pdf') return <PreviewErrorBoundary file={file}><Suspense fallback={<span className="share-media-loading">Loading PDF preview…</span>}><PdfPreview key={file.url} src={file.url} large /></Suspense></PreviewErrorBoundary>;
  if (isPptxFile(file)) return <PreviewErrorBoundary file={file}><Suspense fallback={<span className="share-media-loading">Loading PowerPoint preview…</span>}><PptxPreview key={file.url} src={file.url} filename={file.originalname} large /></Suspense></PreviewErrorBoundary>;
  if (isDocxFile(file)) return <PreviewErrorBoundary file={file}><Suspense fallback={<span className="share-media-loading">Loading Word preview...</span>}><DocxPreview key={file.url} src={file.url} filename={file.originalname} large /></Suspense></PreviewErrorBoundary>;
  return <DocumentFallback file={file} />;
}
