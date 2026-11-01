import { useEffect, useState } from 'react';
import { apiUrl } from '../../shared/api.js';
import PostDetail from './PostDetail.jsx';

// Cached feed/favorite records open immediately; direct links reload by ID.
export default function ResourceDetailPage({ postId, initialPost = null, onNavigate, ...detailProps }) {
  const [resource, setResource] = useState(() => ({ post: initialPost, status: initialPost ? 'ready' : 'loading', error: '' }));
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!postId || initialPost) return;
    const controller = new AbortController();
    async function loadResource() {
      try {
        const response = await fetch(apiUrl(`/api/posts/${encodeURIComponent(postId)}`), { signal: controller.signal });
        if (response.status === 404) {
          if (!controller.signal.aborted) setResource({ post: null, status: 'not-found', error: 'This resource may have been removed.' });
          return;
        }
        if (!response.ok) throw new Error('Could not load this resource. Please try again.');
        const data = await response.json();
        if (!data.post || data.post.id !== postId) throw new Error('The server did not return the requested resource.');
        if (!controller.signal.aborted) setResource({ post: data.post, status: 'ready', error: '' });
      } catch (error) {
        if (!controller.signal.aborted) setResource({ post: null, status: 'error', error: error.message || 'Could not reach the server.' });
      }
    }
    loadResource();
    return () => controller.abort();
  }, [postId, initialPost, retry]);

  if (!postId) return <main className="app-route-message">
    <h1>Choose a resource to get started</h1><p>Open a post from your feed or saved favorites.</p>
    <button onClick={() => onNavigate('home')}>Browse resources</button>
  </main>;

  if (resource.status === 'ready') return <PostDetail {...detailProps} post={resource.post} onNavigate={onNavigate} />;

  if (resource.status === 'loading') return <main className="app-route-message" role="status">Loading resource...</main>;

  return <main className="app-route-message">
    <h1>{resource.status === 'not-found' ? 'Resource not found' : 'Unable to load resource'}</h1>
    <p role="alert">{resource.error}</p>
    {resource.status === 'error' && <button onClick={() => {
      setResource({ post: null, status: 'loading', error: '' });
      setRetry(value => value + 1);
    }}>Retry</button>}
    <button onClick={() => onNavigate('home')}>Browse resources</button>
  </main>;
}
