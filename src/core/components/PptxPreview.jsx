import { useEffect, useState } from 'react';
import { Download, FileText } from 'lucide-react';
import {
  ReactPptxViewer,
  setWasmSource
} from '@extend-ai/react-pptx';
import wasmUrl from '@extend-ai/react-pptx/pptx_wasm_bg.wasm?url';
import '@extend-ai/react-pptx/styles.css';
import './PptxPreview.css';
import { apiFetch } from '../../shared/api.js';

setWasmSource(wasmUrl);

const presentationCache = new Map();
const PRESENTATION_CACHE_LIMIT = 12;

function rememberPresentation(src, value) {
  presentationCache.delete(src);
  presentationCache.set(src, value);
  while (presentationCache.size > PRESENTATION_CACHE_LIMIT) {
    presentationCache.delete(presentationCache.keys().next().value);
  }
}

function loadPresentation(src) {
  const cached = presentationCache.get(src);
  if (cached) {
    rememberPresentation(src, cached);
    return Promise.resolve(cached);
  }

  const request = apiFetch(src)
    .then((response) => {
      if (!response.ok) throw new Error('PowerPoint preview unavailable');
      return response.blob();
    })
    .then((blob) => {
      rememberPresentation(src, blob);
      return blob;
    })
    .catch((error) => {
      presentationCache.delete(src);
      throw error;
    });

  rememberPresentation(src, request);
  return request;
}

export default function PptxPreview({ src, filename = 'Presentation.pptx', large = false }) {
  const [result, setResult] = useState({ src: '', source: null, error: '' });

  useEffect(() => {
    let active = true;

    loadPresentation(src)
      .then((blob) => {
        if (active) setResult({ src, source: blob, error: '' });
      })
      .catch(() => {
        if (active) setResult({ src, source: null, error: 'PowerPoint preview unavailable' });
      });

    return () => {
      active = false;
    };
  }, [src]);

  const downloadPresentation = async () => {
    try {
      const blob = await loadPresentation(src);
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(downloadUrl);
    } catch {
      setResult({ src, source: null, error: 'The presentation could not be downloaded. Please try again.' });
    }
  };

  if (result.src === src && result.error) {
    return (
      <div className="share-pptx-fallback" role="status">
        <FileText size={large ? 48 : 34} />
        <span>{result.error}</span>
      </div>
    );
  }

  if (result.src !== src || !result.source) {
    return <div className="share-pptx-loading">Loading PowerPoint preview…</div>;
  }

  return (
    <div className={`share-pptx-preview ${large ? 'is-large' : 'is-card'}`}>
      <div className="share-pptx-viewer">
        <ReactPptxViewer
          source={result.source}
          mode="slide"
          initialSlide={0}
          defaultZoom="fit-page"
          height="100%"
          showToolbar={large}
          showThumbnails={large}
          showSlideLabels={large}
          virtualization={!large}
          renderLoading={() => <div className="share-pptx-loading">Preparing slides…</div>}
          renderError={() => <div className="share-pptx-fallback"><FileText size={large ? 48 : 34} /><span>PowerPoint preview unavailable</span></div>}
        />
      </div>
      {large && (
        <button type="button" className="share-pptx-download" onClick={downloadPresentation}>
          <Download size={18} />
          Download PPTX
        </button>
      )}
    </div>
  );
}
