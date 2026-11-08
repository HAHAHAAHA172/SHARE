import { useEffect, useState, useRef } from 'react';
import { User, Send } from 'lucide-react';
import { apiFetch } from '../../shared/api.js';

export default function CommentsPanel({ postId, currentUser, onSignIn, onChange, focusInput = false, refreshVersion = 0 }) {
  const [comments, setComments] = useState([]);
  const [draft, setDraft] = useState('');
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const inputRef = useRef(null);
  const requestRef = useRef(null);
  useEffect(() => {
    const controller = new AbortController();
    requestRef.current = controller;
    async function load() {
      setLoading(true); setError(''); setComments([]); setHasMore(false); setPage(1);
      try {
        // A realtime refresh starts over so removals cannot leave stale rows.
        const response = await apiFetch(`/api/posts/${encodeURIComponent(postId)}/comments?page=1`, { signal: controller.signal });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Could not load comments.');
        if (!controller.signal.aborted) {
          setComments([...new Map(result.comments.map(comment => [comment.id, comment])).values()]);
          setHasMore(result.hasMore);
        }
      } catch (failure) { if (!controller.signal.aborted) setError(failure.message || 'Could not load comments.'); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    load();
    return () => requestRef.current?.abort();
  }, [postId, currentUser?.id, retry, refreshVersion]);
  useEffect(() => { if (focusInput) inputRef.current?.focus(); }, [focusInput]);

  async function loadMore() {
    if (loading || !hasMore) return;
    const controller = new AbortController();
    requestRef.current?.abort(); requestRef.current = controller;
    setLoading(true); setError('');
    try {
      const nextPage = page + 1;
      const response = await apiFetch(`/api/posts/${encodeURIComponent(postId)}/comments?page=${nextPage}`, { signal: controller.signal });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not load comments.');
      if (!controller.signal.aborted) {
        setComments(previous => [...new Map([...previous, ...result.comments].map(comment => [comment.id, comment])).values()]);
        setPage(nextPage); setHasMore(result.hasMore);
      }
    } catch (failure) { if (!controller.signal.aborted) setError(failure.message || 'Could not load comments.'); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }

  async function submit(event) {
    event.preventDefault();
    if (!currentUser) { onSignIn?.(); return; }
    if (pending || !draft.trim()) return;
    setPending(true); setError(''); setSuccess('');
    try {
      const response = await apiFetch(`/api/posts/${encodeURIComponent(postId)}/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: draft }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not publish your comment.');
      setComments(previous => [...new Map([...previous, result.comment].map(comment => [comment.id, comment])).values()]); setDraft(''); setSuccess('Comment published.'); onChange?.();
    } catch (failure) { setError(failure.message || 'Could not publish your comment. Your draft is still here.'); }
    finally { setPending(false); }
  }
  async function remove(comment) {
    if (deleting) return;
    setDeleting(comment.id); setError(''); setSuccess('');
    try {
      const response = await apiFetch(`/api/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(comment.id)}`, { method: 'DELETE' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not delete your comment.');
      setComments(previous => previous.filter(item => item.id !== comment.id)); setSuccess('Comment deleted.'); setRetry(value => value + 1); onChange?.();
    } catch (failure) { setError(failure.message || 'Could not delete your comment.'); }
    finally { setDeleting(null); }
  }
  return <section className="postdetail-comments-sheet" id="post-comments" aria-label="Comments">
    <div className="postdetail-handle-bar" />
    <h2 className="postdetail-comments-heading">Comments</h2>
    {error && <div role="alert" className="comment-status"><p>{error}</p><button type="button" className="comments-more" onClick={() => setRetry(value => value + 1)}>Retry loading</button></div>}
    {success && <p role="status" className="comment-status">{success}</p>}
    <div className="postdetail-comments-scroll">
      {!comments.length && !loading && !error && <div className="postdetail-empty-comments"><p>No comments yet.</p><span>Be the first student to start the discussion!</span></div>}
      {comments.map(comment => <div key={comment.id} className="postdetail-comment-thread"><div className="postdetail-comment-item parent">
        <div className="postdetail-comment-avatar"><User size={16} /></div>
        <div className="postdetail-comment-content"><span className="postdetail-comment-author">{comment.ownerId === currentUser?.id ? currentUser.name : comment.author}</span><p className="postdetail-comment-text">{comment.text}</p></div>
        {comment.ownerId === currentUser?.id && <button type="button" className="comment-delete" disabled={Boolean(deleting)} onClick={() => remove(comment)} aria-label="Delete your comment">{deleting === comment.id ? 'Deleting…' : 'Delete'}</button>}
      </div></div>)}
      {loading && <p role="status" className="comment-status">Loading comments…</p>}
      {hasMore && !loading && <button type="button" className="comments-more" onClick={loadMore}>Load more comments</button>}
    </div>
    {currentUser ? <form onSubmit={submit} className="postdetail-comment-form">
      <input ref={inputRef} type="text" aria-label="Write a comment" placeholder="Write a comment…" maxLength={2000} value={draft} onChange={event => setDraft(event.target.value)} className="postdetail-comment-input" disabled={pending} />
      <button type="submit" className="postdetail-send-comment-btn" disabled={pending || !draft.trim()} aria-label="Post comment"><Send size={16} /></button>
    </form> : <button type="button" className="comments-more" onClick={onSignIn}>Sign in to join the discussion</button>}
  </section>;
}
