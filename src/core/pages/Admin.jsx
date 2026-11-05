import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Check, RefreshCw, ShieldX, Trash2, X } from 'lucide-react';
import { apiFetch } from '../../shared/api.js';
import './Admin.css';

export default function Admin({ onNavigate }) {
  const [status, setStatus] = useState('all');
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [pendingAction, setPendingAction] = useState(null);

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

  const moderate = async (id, nextStatus, reason = '') => {
    setError(''); setMessage('');
    try {
      const response = await apiFetch(`/api/admin/posts/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: nextStatus, reason }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not update the post.');
      setMessage(nextStatus === 'published' ? 'Post approved.' : nextStatus === 'rejected' ? 'Post rejected.' : 'Post removed.');
      setPendingAction(null);
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
      {['all', 'pending', 'draft', 'published', 'rejected', 'removed'].map(value => <button type="button" key={value} className={status === value ? 'active' : ''} onClick={() => setStatus(value)}>{value[0].toUpperCase() + value.slice(1)}</button>)}
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
          {post.post_status !== 'published' && post.post_status !== 'rejected' && <button type="button" className="reject" onClick={() => setPendingAction({ id: post.id, status: 'rejected', title: post.title })}><ShieldX size={17} /> Reject</button>}
          {post.post_status !== 'removed' && <button type="button" className="danger" onClick={() => setPendingAction({ id: post.id, status: 'removed', title: post.title })}><Trash2 size={17} /> Remove</button>}
        </div>
      </article>)}
    </section>}
    {pendingAction && <div className="admin-dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setPendingAction(null); }}>
      <section className="admin-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-dialog-title">
        <button type="button" className="admin-dialog-close" aria-label="Close confirmation" onClick={() => setPendingAction(null)}><X size={18} /></button>
        <h2 id="admin-dialog-title">{pendingAction.status === 'removed' ? 'Remove this post?' : 'Reject this post?'}</h2>
        <p><strong>{pendingAction.title}</strong> will be marked as <em>{pendingAction.status}</em>. This action is recorded for auditing.</p>
        <label className="admin-dialog-label" htmlFor="admin-action-reason">Reason (optional)</label>
        <textarea id="admin-action-reason" rows="3" maxLength="500" placeholder={pendingAction.status === 'removed' ? 'Removed by administrator.' : 'Rejected by administrator.'} onChange={event => setPendingAction(action => ({ ...action, reason: event.target.value }))} />
        <div className="admin-dialog-actions">
          <button type="button" className="admin-cancel" onClick={() => setPendingAction(null)}>Cancel</button>
          <button type="button" className={pendingAction.status === 'removed' ? 'danger' : 'reject'} onClick={() => moderate(pendingAction.id, pendingAction.status, pendingAction.reason?.trim())}>{pendingAction.status === 'removed' ? 'Remove post' : 'Reject post'}</button>
        </div>
      </section>
    </div>}
  </main>;
}
