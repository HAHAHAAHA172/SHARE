import { useEffect, useState } from 'react';
import { Heart, MessageCircle, Sparkles } from 'lucide-react';
import { apiFetch } from '../../shared/api.js';
import './PostActions.css';

export default function PostActions({ post, currentUser, onComment, onPedro, onSignIn, refresh = false, commentVersion = 0 }) {
  const [actions, setActions] = useState({ likes: Number(post.likes) || 0, liked: Boolean(post.liked), commentCount: Number(post.commentCount) || 0 });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!refresh) return;
    const controller = new AbortController();
    async function load() {
      try {
        const response = await apiFetch(`/api/posts/${encodeURIComponent(post.id)}/actions`, { signal: controller.signal });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Could not load post activity.');
        if (!controller.signal.aborted) { setActions(result); setError(''); }
      } catch (failure) { if (!controller.signal.aborted) setError(failure.message || 'Could not load post activity.'); }
    }
    load();
    return () => controller.abort();
  }, [post.id, currentUser?.id, refresh, commentVersion]);

  async function toggleLike() {
    if (!currentUser) { onSignIn?.(); return; }
    if (pending) return;
    const previous = actions;
    setPending(true); setError('');
    setActions({ ...actions, liked: !actions.liked, likes: Math.max(0, actions.likes + (actions.liked ? -1 : 1)) });
    try {
      const response = await apiFetch(`/api/posts/${encodeURIComponent(post.id)}/like`, { method: previous.liked ? 'DELETE' : 'POST' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not update your reaction.');
      setActions(result);
    } catch (failure) { setActions(previous); setError(failure.message || 'Could not update your reaction.'); }
    finally { setPending(false); }
  }

  return <div className="post-social" onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
    <div className="post-social-actions">
      <button type="button" aria-label={actions.liked ? 'Unlike post' : 'Like post'} aria-pressed={actions.liked} className={actions.liked ? 'post-heart is-liked' : 'post-heart'} disabled={pending} onClick={toggleLike}>
        <Heart size={19} fill={actions.liked ? 'currentColor' : 'none'} /><span className="post-count">{actions.likes}</span>
      </button>
      <button type="button" onClick={onComment}><MessageCircle size={18} /><span className="post-action-label">Comment</span><span className="post-count">{actions.commentCount}</span></button>
      <button type="button" onClick={() => onPedro?.(post)} aria-label="Ask P.E.D.R.O. about this post"><Sparkles size={18} /><span className="post-action-label">Ask P.E.D.R.O.</span></button>
    </div>
    {error && <p className="post-social-error" role="alert">{error}</p>}
  </div>;
}
