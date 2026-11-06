import { useEffect, useState } from 'react';
import './PostDetail.css';
import { API_BASE_URL } from '../../shared/api.js';
import { ArrowLeft, Bookmark, User, FileText, Download } from 'lucide-react';
import PostActions from '../components/PostActions.jsx';
import CommentsPanel from '../components/CommentsPanel.jsx';
import { supabase } from '../../security/client/auth.js';
import { watchFeedUpdates } from '../feedUpdates.js';

export default function PostDetail({ post, currentUser, onNavigate, isFavorite = false, onToggleFavorite }) {
  const [commentVersion, setCommentVersion] = useState(0);
  const [focusComment, setFocusComment] = useState(0);
  const [liveVersion, setLiveVersion] = useState(0);
  useEffect(() => watchFeedUpdates({ client: supabase, refresh: () => setLiveVersion(value => value + 1) }), [currentUser?.id, post.id]);

  const displayTitle = post?.title || 'Post unavailable';
  const displayAuthor = post?.author || 'Student';
  const displayDesc = post?.description || '';

  const file = post?.file;
  const fileUrl = file?.url ? (/^https?:\/\//i.test(file.url) ? file.url : `${API_BASE_URL}${file.url.startsWith('/') ? '' : '/'}${file.url}`) : null;


  return (
    <div className="postdetail-screen-wrapper">
      <div className="postdetail-card-container">
        {/* Top Header Bar */}
        <header className="postdetail-header-bar">
          <button
            type="button"
            className="postdetail-back-btn"
            onClick={() => onNavigate && onNavigate('home')}
            title="Back to Feed"
          >
            <ArrowLeft size={24} color="#FFFFFF" strokeWidth={2.2} />
          </button>

          <button
            type="button"
            className={`postdetail-like-btn ${isFavorite ? 'liked' : ''}`}
            onClick={() => post && onToggleFavorite?.(post)}
            aria-pressed={isFavorite}
            title={isFavorite ? 'Remove from favorites' : 'Save to favorites'}
            aria-label={isFavorite ? 'Remove from favorites' : 'Save to favorites'}
          >
            <Bookmark
              size={24}
              color={isFavorite ? '#FF4D6D' : '#FFFFFF'}
              fill={isFavorite ? '#FF4D6D' : 'none'}
              strokeWidth={2}
            />
          </button>
        </header>

        {/* Scrollable Upper Post Body */}
        <div className="postdetail-scroll-area">
          {/* Author Profile Row */}
          <div className="postdetail-author-row">
            <div className="postdetail-author-avatar">
              <User size={30} color="#111116" strokeWidth={2.4} />
            </div>
            <h2 className="postdetail-author-name">{displayAuthor}</h2>
          </div>

          {/* Post Headline Topic */}
          <h1 className="postdetail-topic-headline">
            {displayTitle}
          </h1>

          {displayDesc && (
            <p className="postdetail-topic-subtext">{displayDesc}</p>
          )}

          <div className="postdetail-resources-list">
            {fileUrl ? (
              <a className="postdetail-resource-card" href={fileUrl} target="_blank" rel="noopener noreferrer" download={file.originalname || file.filename}>
                <div className="postdetail-res-icon-wrap"><FileText size={26} color="#FFFFFF" /></div>
                <div className="postdetail-res-text-wrap">
                  <h3 className="postdetail-res-title">{file.originalname || file.filename || 'Attached resource'}</h3>
                  <p className="postdetail-res-desc">{file.size ? `${Math.ceil(file.size / 1024)} KB · ` : ''}Open or download attachment</p>
                </div>
                <Download size={22} />
              </a>
            ) : <p className="core-muted">No attachment on this post.</p>}
          </div>

          <PostActions post={post} currentUser={currentUser} isFavorite={isFavorite} onToggleFavorite={onToggleFavorite} onComment={() => { setFocusComment(value => value + 1); document.getElementById('post-comments')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }} onSignIn={() => onNavigate?.('login')} refresh commentVersion={`${commentVersion}:${liveVersion}`} />
        </div>

        <CommentsPanel key={`${post.id}:${currentUser?.id || 'guest'}`} postId={post.id} currentUser={currentUser} refreshVersion={liveVersion} onSignIn={() => onNavigate?.('login')} focusInput={focusComment} onChange={() => setCommentVersion(value => value + 1)} />
      </div>
    </div>
  );
}
