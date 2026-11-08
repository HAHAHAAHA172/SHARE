import { useEffect, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import { FileText } from 'lucide-react';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { apiFetch } from '../../shared/api.js';

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

export default function PdfPreview({ src, large = false }) {
  const [pages, setPages] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [failed, setFailed] = useState(false);
  const [resolved, setResolved] = useState('');
  useEffect(() => {
    let active = true;
    let objectUrl = '';
    apiFetch(src).then(response => {
      if (!response.ok) throw new Error('PDF download failed');
      return response.blob();
    }).then(blob => {
      objectUrl = URL.createObjectURL(blob);
      if (active) setResolved(objectUrl);
    }).catch(() => { if (active) setFailed(true); });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);
  if (failed) return <div className="share-document-preview"><FileText size={48} /><span>PDF preview unavailable</span><a href={src} target="_blank" rel="noopener noreferrer">Open PDF in a new tab</a></div>;
  if (!resolved) return <span className="share-media-loading">Loading PDF preview...</span>;
  return <div className={`share-pdf-viewer ${large ? 'is-large' : 'is-card'}`}>
    <div className="share-pdf-toolbar">
      {large && pages > 1 && <div className="share-pdf-pagination" role="group" aria-label="PDF pages">
        <button type="button" onClick={() => setCurrentPage(page => Math.max(1, page - 1))} disabled={currentPage <= 1}>Previous</button>
        <span>Page {currentPage} of {pages}</span>
        <button type="button" onClick={() => setCurrentPage(page => Math.min(pages, page + 1))} disabled={currentPage >= pages}>Next</button>
      </div>}
      <a href={resolved} download="document.pdf">Download PDF</a>
    </div>
    <Document file={resolved} loading={<span className="share-media-loading">Loading PDF preview...</span>} onLoadSuccess={({ numPages }) => setPages(numPages)} onLoadError={() => setFailed(true)}>
      <div className="share-pdf-page">
        <Page pageNumber={large ? currentPage : 1} width={large ? 760 : 420} renderTextLayer={false} renderAnnotationLayer={false} />
      </div>
    </Document>
  </div>;
}
