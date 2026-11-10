import { useEffect, useRef, useState } from 'react';
import { Download, FileText } from 'lucide-react';
import { renderAsync } from 'docx-preview';
import { apiFetch } from '../../shared/api.js';

const cache = new Map();

function loadDocument(src) {
  if (cache.has(src)) return Promise.resolve(cache.get(src));
  const request = apiFetch(src, { timeoutMs: 120_000 })
    .then(response => {
      if (!response.ok) throw new Error('Word preview unavailable');
      return response.arrayBuffer();
    })
    .then(arrayBuffer => {
      cache.set(src, arrayBuffer);
      if (cache.size > 12) cache.delete(cache.keys().next().value);
      return arrayBuffer;
    })
    .catch(error => { cache.delete(src); throw error; });
  cache.set(src, request);
  return request;
}

export default function DocxPreview({ src, filename = 'Document.docx', large = false }) {
  const containerRef = useRef(null);
  const [result, setResult] = useState({ arrayBuffer: null, error: '' });
  const [pages, setPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    let active = true;
    loadDocument(src)
      .then(arrayBuffer => { if (active) setResult({ arrayBuffer, error: '' }); })
      .catch(() => { if (active) setResult({ arrayBuffer: null, error: 'Word preview unavailable' }); });
    return () => { active = false; };
  }, [src]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !result.arrayBuffer) return undefined;
    let active = true;
    container.replaceChildren();
    renderAsync(result.arrayBuffer.slice(0), container, undefined, {
      className: 'docx',
      inWrapper: true,
      breakPages: true,
      ignoreWidth: false,
      ignoreHeight: false,
      renderHeaders: true,
      renderFooters: true,
      ignoreLastRenderedPageBreak: false,
      useBase64URL: true,
    }).then(() => {
      if (!active) return;
      const wrapper = container.querySelector('.docx-wrapper');
      const renderedPages = wrapper ? [...wrapper.querySelectorAll(':scope > .docx')] : [];
      if (large) {
        setPages(renderedPages.length);
        setCurrentPage(1);
        return;
      }
      const page = renderedPages[0];
      if (!wrapper || !page) return;
      const availableWidth = Math.max(container.clientWidth - 16, 1);
      const availableHeight = Math.max(container.clientHeight - 16, 1);
      const scale = Math.min(availableWidth / page.offsetWidth, availableHeight / page.offsetHeight);
      if (!Number.isFinite(scale) || scale <= 0) return;
      page.style.transform = `scale(${scale})`;
      page.style.transformOrigin = 'top left';
      page.style.marginLeft = `${Math.max((availableWidth - (page.offsetWidth * scale)) / 2, 0)}px`;
    }).catch(() => {
      if (active) setResult(current => ({ ...current, error: 'Word preview unavailable' }));
    });
    return () => { active = false; container.replaceChildren(); };
  }, [large, result.arrayBuffer]);

  useEffect(() => {
    if (!large || !containerRef.current || !pages) return;
    const renderedPages = containerRef.current.querySelectorAll('.docx-wrapper > .docx');
    renderedPages.forEach((page, index) => {
      page.style.display = index === currentPage - 1 ? '' : 'none';
    });
  }, [currentPage, large, pages]);

  const download = async () => {
    try {
      const arrayBuffer = await loadDocument(src);
      const url = URL.createObjectURL(new Blob([arrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
      const link = window.document.createElement('a');
      link.href = url;
      link.download = filename;
      window.document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      setResult({ arrayBuffer: null, error: 'The document could not be downloaded. Please try again.' });
    }
  };

  if (result.error) return <div className="share-docx-fallback" role="status"><FileText size={large ? 48 : 34} /><span>{result.error}</span></div>;
  if (!result.arrayBuffer) return <div className="share-docx-loading">Loading Word preview...</div>;
  return <div className={`share-docx-preview ${large ? 'is-large' : 'is-card'}`}>
    {large && <div className="share-docx-toolbar">
      {pages > 1 && <div className="share-docx-pagination" role="group" aria-label="Word document pages">
        <button type="button" onClick={() => setCurrentPage(page => Math.max(1, page - 1))} disabled={currentPage <= 1}>Previous</button>
        <span>Page {currentPage} of {pages}</span>
        <button type="button" onClick={() => setCurrentPage(page => Math.min(pages, page + 1))} disabled={currentPage >= pages}>Next</button>
      </div>}
    </div>}
    <div ref={containerRef} className="share-docx-render" aria-label={`Preview of ${filename}`} />
    {large && <button type="button" className="share-docx-download" onClick={download}><Download size={18} />Download DOCX</button>}
  </div>;
}
