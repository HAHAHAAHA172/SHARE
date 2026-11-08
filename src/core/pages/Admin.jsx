import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, RefreshCw, ShieldCheck, ShieldX, Trash2, UserMinus, UserPlus, Users, X } from 'lucide-react';
import { apiFetch } from '../../shared/api.js';
import './Admin.css';

export default function Admin({ onNavigate }) {
  const [status, setStatus] = useState('all');
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [pendingAction, setPendingAction] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [section, setSection] = useState('posts');
  const [accounts, setAccounts] = useState([]);
  const [pendingAdmin, setPendingAdmin] = useState(null);
  const [promoting, setPromoting] = useState(false);
  const [removingAdmin, setRemovingAdmin] = useState(null);
  const postsRequestRef = useRef(null);
  const accountsRequestRef = useRef(null);

  const load = useCallback(async () => {
    postsRequestRef.current?.abort();
    const controller = new AbortController();
    postsRequestRef.current = controller;
    setLoading(true); setError('');
    try {
      const response = await apiFetch(`/api/admin/posts?status=${encodeURIComponent(status)}`, { signal: controller.signal });
      const result = await response.json();
      if (controller.signal.aborted) return;
      if (response.status === 401 || response.status === 403) { setNotFound(true); return; }
      if (!response.ok) throw new Error(result.error || 'Could not load moderation data.');
      setPosts(result.posts || []);
    } catch (cause) { if (!controller.signal.aborted) setError(cause.message); }
    finally {
      if (postsRequestRef.current === controller) {
        postsRequestRef.current = null;
        setLoading(false);
      }
    }
  }, [status]);
  useEffect(() => { const timer = setTimeout(load, 0); return () => clearTimeout(timer); }, [load]);

  const loadAccounts = useCallback(async () => {
    accountsRequestRef.current?.abort();
    const controller = new AbortController();
    accountsRequestRef.current = controller;
    setLoading(true); setError('');
    try {
      const response = await apiFetch('/api/admin/users', { signal: controller.signal });
      const result = await response.json();
      if (controller.signal.aborted) return;
      if (response.status === 401 || response.status === 403) { setNotFound(true); return; }
      if (!response.ok) throw new Error(result.error || 'Could not load accounts.');
      setAccounts(result.accounts || []);
    } catch (cause) { if (!controller.signal.aborted) setError(cause.message); }
    finally {
      if (accountsRequestRef.current === controller) {
        accountsRequestRef.current = null;
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => () => {
    const postsRequest = postsRequestRef.current;
    const accountsRequest = accountsRequestRef.current;
    postsRequestRef.current = null;
    accountsRequestRef.current = null;
    postsRequest?.abort();
    accountsRequest?.abort();
  }, []);

  useEffect(() => {
    if (section !== 'users') return undefined;
    const timer = setTimeout(loadAccounts, 0);
    return () => clearTimeout(timer);
  }, [section, loadAccounts]);

  const promote = async () => {
    if (!pendingAdmin) return;
    setPromoting(true); setError(''); setMessage('');
    try {
      const response = await apiFetch(`/api/admin/users/${pendingAdmin.id}/admin`, { method: 'POST' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not add this administrator.');
      setMessage(`${pendingAdmin.name} is now an administrator.`);
      setPendingAdmin(null);
      await loadAccounts();
    } catch (cause) { setError(cause.message); }
    finally { setPromoting(false); }
  };

  const demote = async () => {
    if (!removingAdmin) return;
    setPromoting(true); setError(''); setMessage('');
    try {
      const response = await apiFetch(`/api/admin/users/${removingAdmin.id}/admin`, { method: 'DELETE' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Could not remove administrator access.');
      setMessage(`${removingAdmin.name} is now a standard user.`);
      setRemovingAdmin(null);
      await loadAccounts();
    } catch (cause) { setError(cause.message); }
    finally { setPromoting(false); }
  };

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

  if (notFound) return <main className="app-route-message"><h1>Page not found</h1><p>This page does not exist.</p><button type="button" onClick={() => onNavigate?.('home')}>Back to Home</button></main>;

  return <main className="admin-screen">
    <header className="admin-header">
      <button type="button" className="admin-back" onClick={() => onNavigate?.('home')} aria-label="Back to home"><ArrowLeft size={20} /></button>
      <div><p className="admin-eyebrow">S.H.A.R.E.</p><h1>{section === 'posts' ? 'Post moderation' : 'Manage administrators'}</h1></div>
      <button type="button" className="admin-refresh" onClick={section === 'posts' ? load : loadAccounts} disabled={loading}><RefreshCw size={18} /> Refresh</button>
    </header>
    <nav className="admin-section-nav" aria-label="Administration sections">
      <button type="button" className={section === 'posts' ? 'active' : ''} onClick={() => { setSection('posts'); setMessage(''); setError(''); }}><ShieldCheck size={18} /> Posts</button>
      <button type="button" className={section === 'users' ? 'active' : ''} onClick={() => { setSection('users'); setMessage(''); setError(''); }}><Users size={18} /> Administrators</button>
    </nav>
    {section === 'posts' && <section className="admin-toolbar" aria-label="Moderation filters">
      {['all', 'pending', 'draft', 'published', 'rejected', 'removed'].map(value => <button type="button" key={value} className={status === value ? 'active' : ''} onClick={() => setStatus(value)}>{value[0].toUpperCase() + value.slice(1)}</button>)}
    </section>}
    {message && <p className="admin-message success" role="status">{message}</p>}
    {error && <p className="admin-message error" role="alert">{error}</p>}
    {section === 'posts' && (loading ? <p className="admin-empty" role="status">Loading posts…</p> : posts.length === 0 ? <p className="admin-empty">No posts match this filter.</p> : <section className="admin-list">
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
    </section>)}
    {section === 'users' && (loading ? <p className="admin-empty" role="status">Loading accounts…</p> : accounts.length === 0 ? <p className="admin-empty">No accounts are available.</p> : <section className="admin-account-list" aria-label="User accounts">
      {accounts.map(account => <article className="admin-account" key={account.id}>
        <div className="admin-account-avatar" aria-hidden="true">{account.name.trim().charAt(0).toUpperCase()}</div>
        <div className="admin-account-details"><h2>{account.name}</h2><p>{account.email || 'No email address available'}</p></div>
        {account.role === 'admin' ? <button type="button" className="admin-demote" onClick={() => setRemovingAdmin(account)}><UserMinus size={17} /> Remove admin</button> : <button type="button" className="admin-promote" disabled={!account.canPromote} onClick={() => setPendingAdmin(account)} title={account.canPromote ? 'Add as administrator' : 'This account needs a profile first'}><UserPlus size={17} /> Add admin</button>}
      </article>)}
    </section>)}
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
    {pendingAdmin && <div className="admin-dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !promoting) setPendingAdmin(null); }}>
      <section className="admin-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-promote-title">
        <button type="button" className="admin-dialog-close" aria-label="Close confirmation" disabled={promoting} onClick={() => setPendingAdmin(null)}><X size={18} /></button>
        <h2 id="admin-promote-title">Add administrator?</h2>
        <p><strong>{pendingAdmin.name}</strong> ({pendingAdmin.email}) will be able to review posts and manage other administrators.</p>
        <div className="admin-dialog-actions">
          <button type="button" className="admin-cancel" disabled={promoting} onClick={() => setPendingAdmin(null)}>Cancel</button>
          <button type="button" className="admin-confirm-promote" disabled={promoting} onClick={promote}>{promoting ? 'Adding…' : 'Add administrator'}</button>
        </div>
      </section>
    </div>}
    {removingAdmin && <div className="admin-dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !promoting) setRemovingAdmin(null); }}>
      <section className="admin-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-demote-title">
        <button type="button" className="admin-dialog-close" aria-label="Close confirmation" disabled={promoting} onClick={() => setRemovingAdmin(null)}><X size={18} /></button>
        <h2 id="admin-demote-title">Remove administrator access?</h2>
        <p><strong>{removingAdmin.name}</strong> ({removingAdmin.email}) will return to a standard student account and lose moderation access.</p>
        <div className="admin-dialog-actions">
          <button type="button" className="admin-cancel" disabled={promoting} onClick={() => setRemovingAdmin(null)}>Cancel</button>
          <button type="button" className="danger" disabled={promoting} onClick={demote}>{promoting ? 'Removing…' : 'Remove administrator'}</button>
        </div>
      </section>
    </div>}
  </main>;
}
