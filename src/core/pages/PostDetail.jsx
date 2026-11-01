import { useState } from 'react';
import './PostDetail.css';
import { API_BASE_URL } from '../../shared/api.js';
import { ArrowLeft, Heart, User, FileText, Send, Sparkles, Download } from 'lucide-react';

export default function PostDetail({ post, currentUser, onNavigate, onNavigateToPedro, isFavorite = false, onToggleFavorite }) {
  const initialComments = post?.comments || [];
  const [comments, setComments] = useState(initialComments);
  const [commentInput, setCommentInput] = useState('');

  const currentAuthor = currentUser?.name || 'Student';

  // Add comment
  const handleAddComment = (e) => {
    e.preventDefault();
    if (!commentInput.trim()) return;

    const newComment = {
      id: Date.now(),
      author: currentAuthor,
      text: commentInput.trim(),
      liked: false,
      replies: []
    };

    setComments(prev => [...prev, newComment]);
    setCommentInput('');
  };

  // Toggle comment like
  const handleToggleCommentLike = (commentId, isReply = false, parentId = null) => {
    setComments(prev => prev.map(c => {
      if (!isReply && c.id === commentId) {
        return { ...c, liked: !c.liked };
      }
      if (isReply && c.id === parentId) {
        return {
          ...c,
          replies: c.replies.map(r => r.id === commentId ? { ...r, liked: !r.liked } : r)
        };
      }
      return c;
    }));
  };

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
            <Heart
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

          {/* Study with PEDRO AI Quick Action */}
          {onNavigateToPedro && (
            <button
              type="button"
              className="postdetail-study-ai-btn"
              onClick={() => onNavigateToPedro(post || { title: displayTitle, description: displayDesc })}
            >
              <Sparkles size={18} color="#FFD166" />
              <span>Generate Quiz & Study with PEDRO AI</span>
            </button>
          )}
        </div>

        {/* ================= COMMENTS SECTION / BOTTOM SHEET ================= */}
        <section className="postdetail-comments-sheet">
          {/* Top Sheet Pull Handle Bar */}
          <div className="postdetail-handle-bar"></div>

          <h2 className="postdetail-comments-heading">Comments</h2>
          <p className="core-muted core-session-note">Discussion stays in this view for this visit.</p>

          {/* Comments List */}
          <div className="postdetail-comments-scroll">
            {comments.length === 0 ? (
              <div className="postdetail-empty-comments">
                <p>No comments yet.</p>
                <span>Be the first student to start the discussion!</span>
              </div>
            ) : (
              comments.map((comment) => (
                <div key={comment.id} className="postdetail-comment-thread">
                  {/* Parent Comment */}
                  <div className="postdetail-comment-item parent">
                    <div className="postdetail-comment-avatar">
                      <User size={16} color="#111116" strokeWidth={2.4} />
                    </div>

                    <div className="postdetail-comment-content">
                      <span className="postdetail-comment-author">{comment.author}</span>
                      <p className="postdetail-comment-text">{comment.text}</p>
                    </div>

                    <button
                      type="button"
                      aria-label="Like comment"
                      className={`postdetail-comment-like-btn ${comment.liked ? 'liked' : ''}`}
                      onClick={() => handleToggleCommentLike(comment.id)}
                    >
                      <Heart
                        size={17}
                        color={comment.liked ? '#FF4D6D' : '#C7C6D2'}
                        fill={comment.liked ? '#FF4D6D' : 'none'}
                      />
                    </button>
                  </div>

                  {/* Thread Line and Child Replies */}
                  {comment.replies && comment.replies.map((reply) => (
                    <div key={reply.id} className="postdetail-reply-wrap">
                      <div className="postdetail-thread-line"></div>

                      <div className="postdetail-comment-item child">
                        <div className="postdetail-comment-avatar small">
                          <User size={13} color="#111116" strokeWidth={2.4} />
                        </div>

                        <div className="postdetail-comment-content">
                          <span className="postdetail-comment-author">{reply.author}</span>
                          <p className="postdetail-comment-text">{reply.text}</p>
                        </div>

                        <button
                          type="button"
                          aria-label="Like reply"
                          className={`postdetail-comment-like-btn ${reply.liked ? 'liked' : ''}`}
                          onClick={() => handleToggleCommentLike(reply.id, true, comment.id)}
                        >
                          <Heart
                            size={16}
                            color={reply.liked ? '#FF4D6D' : '#C7C6D2'}
                            fill={reply.liked ? '#FF4D6D' : 'none'}
                          />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>

          {/* Add Comment Input Bar */}
          <form onSubmit={handleAddComment} className="postdetail-comment-form">
            <input
              type="text"
              aria-label="Write a comment"
              placeholder="Write a comment..."
              value={commentInput}
              onChange={(e) => setCommentInput(e.target.value)}
              className="postdetail-comment-input"
            />
            <button
              type="submit"
              className="postdetail-send-comment-btn"
              disabled={!commentInput.trim()}
              title="Post comment"
            >
              <Send size={16} color="#FFFFFF" />
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
