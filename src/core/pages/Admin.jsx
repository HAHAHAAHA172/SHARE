import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Check, RefreshCw, Trash2 } from 'lucide-react';
import { apiFetch } from '../../shared/api.js';
import './Admin.css';

export default function Admin({ onNavigate }) {
  const [status, setStatus] = useState('all');
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const response = await apiFetch(`/api/admin/posts?status=${encodeURIComponent(status)}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not load moderation data.');
      setPosts(result.posts || []);
    } catch (cause) { setError(cause.message); }
    finally { setLoading(false); }
  }, [status]);
  useEffect(() => { const timer = setTimeout(load, 0); return () => clearTimeout(timer); }, [load]);

  const moderate = async (id, nextStatus) => {
    const reason = nextStatus === 'removed' ? window.prompt('Reason for removing this post:', 'Removed by administrator.') : 'Approved by administrator.';
    if (nextStatus === 'removed' && reason === null) return;
    setError(''); setMessage('');
    try {
      const response = await apiFetch(`/api/admin/posts/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: nextStatus, reason }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not update the post.');
      setMessage(nextStatus === 'published' ? 'Post approved.' : 'Post removed.');
      await load();
    } catch (cause) { setError(cause.message); }
  };

  return <main className="admin-screen">
    <header className="admin-header">
      <button type="button" className="admin-back" onClick={() => onNavigate?.('home')} aria-label="Back to home"><ArrowLeft size={20} /></button>
      <div><p className="admin-eyebrow">S.H.A.R.E.</p><h1>Post moderation</h1></div>
      <button type="button" className="admin-refresh" onClick={load} disabled={loading}><RefreshCw size={18} /> Refresh</button>
    </header>
    <section className="admin-toolbar" aria-label="Moderation filters">
      {['all', 'pending', 'draft', 'published', 'removed'].map(value => <button type="button" key={value} className={status === value ? 'active' : ''} onClick={() => setStatus(value)}>{value[0].toUpperCase() + value.slice(1)}</button>)}
    </section>
    {message && <p className="admin-message success" role="status">{message}</p>}
    {error && <p className="admin-message error" role="alert">{error}</p>}
    {loading ? <p className="admin-empty" role="status">Loading posts…</p> : posts.length === 0 ? <p className="admin-empty">No posts match this filter.</p> : <section className="admin-list">
      {posts.map(post => <article className="admin-post" key={post.id}>
        <div className="admin-post-meta"><span>{post.author || 'Student'}</span><time>{new Date(post.created_at).toLocaleString()}</time><span className={`admin-status ${post.post_status}`}>{post.post_status}</span></div>
        <h2>{post.title}</h2><p>{post.content || 'No description provided.'}</p>
        {post.materials?.length > 0 && <small>Attachment: {post.materials[0].file_name}</small>}
        <div className="admin-actions">
          {post.post_status !== 'published' && <button type="button" onClick={() => moderate(post.id, 'published')}><Check size={17} /> Approve</button>}
          {post.post_status !== 'removed' && <button type="button" className="danger" onClick={() => moderate(post.id, 'removed')}><Trash2 size={17} /> Remove</button>}
        </div>
      </article>)}
    </section>}
  </main>;
}
