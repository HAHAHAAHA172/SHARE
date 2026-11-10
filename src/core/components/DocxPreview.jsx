import { useEffect, useState } from 'react';
import { Download, FileText } from 'lucide-react';
import mammoth from 'mammoth';
import { apiFetch } from '../../shared/api.js';

const cache = new Map();

function loadDocument(src) {
  if (cache.has(src)) return Promise.resolve(cache.get(src));
  const request = apiFetch(src, { timeoutMs: 120_000 }).then(response => {
    if (!response.ok) throw new Error('Word preview unavailable');
    return response.arrayBuffer();
  }).then(async arrayBuffer => {
    const result = await mammoth.extractRawText({ arrayBuffer });
    const document = { arrayBuffer, text: result.value.trim() };
    cache.set(src, document);
    if (cache.size > 12) cache.delete(cache.keys().next().value);
    return document;
  }).catch(error => { cache.delete(src); throw error; });
  cache.set(src, request);
  return request;
}

export default function DocxPreview({ src, filename = 'Document.docx', large = false }) {
  const [result, setResult] = useState({ document: null, error: '' });
  useEffect(() => {
    let active = true;
    loadDocument(src).then(document => { if (active) setResult({ document, error: '' }); })
      .catch(() => { if (active) setResult({ document: null, error: 'Word preview unavailable' }); });
    return () => { active = false; };
  }, [src]);

  const download = async () => {
    try {
      const document = await loadDocument(src);
      const url = URL.createObjectURL(new Blob([document.arrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
      const link = window.document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setResult({ document: null, error: 'The document could not be downloaded. Please try again.' });
    }
  };

  if (result.error) return <div className="share-docx-fallback" role="status"><FileText size={large ? 48 : 34} /><span>{result.error}</span></div>;
  if (!result.document) return <div className="share-docx-loading">Loading Word preview...</div>;
  return <div className={`share-docx-preview ${large ? 'is-large' : 'is-card'}`}>
    <div className="share-docx-page"><strong>{filename}</strong><p>{result.document.text || 'This document does not contain readable text.'}</p></div>
    {large && <button type="button" className="share-docx-download" onClick={download}><Download size={18} />Download DOCX</button>}
  </div>;
}
