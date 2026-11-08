import { Component, lazy, Suspense, useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import { apiFetch, apiUrl } from '../../shared/api.js';

const PdfPreview = lazy(() => import('./PdfPreview.jsx'));
const PptxPreview = lazy(() => import('./PptxPreview.jsx'));
const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const inlineImageCache = new Map();
const INLINE_IMAGE_CACHE_LIMIT = 48;

const isPptxFile = file => file?.mimetype === PPTX_MIME || file?.originalname?.toLowerCase().endsWith('.pptx');

function rememberInlineImage(src, value) {
  inlineImageCache.delete(src);
  inlineImageCache.set(src, value);
  while (inlineImageCache.size > INLINE_IMAGE_CACHE_LIMIT) {
    const oldestKey = inlineImageCache.keys().next().value;
    const oldestValue = inlineImageCache.get(oldestKey);
    inlineImageCache.delete(oldestKey);
    if (typeof oldestValue === 'string') URL.revokeObjectURL(oldestValue);
  }
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
  const [resolved, setResolved] = useState('');
  useEffect(() => {
    let active = true;
    const cached = inlineImageCache.get(src);
    if (cached) rememberInlineImage(src, cached);
    const request = cached || apiFetch(src).then(response => {
      if (!response.ok) throw new Error('Preview unavailable');
      return response.blob();
    }).then(blob => {
      const url = URL.createObjectURL(blob);
      rememberInlineImage(src, url);
      return url;
    });
    if (!cached) rememberInlineImage(src, request);
    Promise.resolve(request).then(url => { if (active) setResolved(url); }).catch(() => { if (active) onError?.(); });
    return () => { active = false; };
  }, [src, onError]);
  if (!resolved) return <span className="share-media-loading">Loading preview…</span>;
  return <img className="share-feed-media" src={resolved} alt={alt} loading="lazy" decoding="async" />;
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
  if (type.startsWith('video/')) return <button type="button" className="share-feed-media-button" onClick={open}><video className="share-feed-media" src={resolvedFile.url} preload="metadata" muted /></button>;
  if (type === 'application/pdf') return <button type="button" className="share-feed-file-preview share-pdf-card" onClick={open}><PreviewErrorBoundary file={resolvedFile}><Suspense fallback={<span className="share-media-loading">Loading PDF preview…</span>}><PdfPreview src={resolvedFile.url} /></Suspense></PreviewErrorBoundary><span>{file.originalname || 'Open PDF'}</span></button>;
  if (isPptxFile(file)) return <button type="button" className="share-feed-file-preview share-pptx-card" onClick={open}><PreviewErrorBoundary file={resolvedFile}><Suspense fallback={<span className="share-media-loading">Loading PowerPoint preview…</span>}><PptxPreview src={resolvedFile.url} filename={file.originalname} /></Suspense></PreviewErrorBoundary><span>{file.originalname || 'Open PowerPoint'}</span></button>;
  return <button type="button" className="share-feed-file-preview" onClick={open}><FileText size={28} /><span>{file.originalname || 'Open attachment'}</span></button>;
}

export function AttachmentModalContent({ file }) {
  if (!file) return null;
  if (file.mimetype?.startsWith('image/')) return <InlineImage src={file.url} alt={file.originalname || 'Attachment'} />;
  if (file.mimetype?.startsWith('video/')) return <video src={file.url} controls autoPlay />;
  if (file.mimetype === 'application/pdf') return <PreviewErrorBoundary file={file}><Suspense fallback={<span className="share-media-loading">Loading PDF preview…</span>}><PdfPreview key={file.url} src={file.url} large /></Suspense></PreviewErrorBoundary>;
  if (isPptxFile(file)) return <PreviewErrorBoundary file={file}><Suspense fallback={<span className="share-media-loading">Loading PowerPoint preview…</span>}><PptxPreview key={file.url} src={file.url} filename={file.originalname} large /></Suspense></PreviewErrorBoundary>;
  return <DocumentFallback file={file} />;
}
