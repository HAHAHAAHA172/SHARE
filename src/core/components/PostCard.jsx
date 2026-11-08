import { User } from 'lucide-react';
import PostActions from './PostActions.jsx';
import { AttachmentCard } from './AttachmentPreview.jsx';

export default function PostCard({ post, currentUser, saved, onOpen, onPreview, onToggleSaved, onSignIn }) {
  return <article className="share-post-card">
    <button type="button" className="share-card-open" onClick={() => onOpen(post)}>
      <div className="share-card-content">
        <div className="share-feed-author-row">
          <div className="share-feed-avatar"><User size={18} /></div>
          <strong>{post.author || 'Student'}</strong>
          <span>{post.createdAt ? new Date(post.createdAt).toLocaleString() : 'Recently'}</span>
        </div>
        <h3 className="share-card-title">{post.title}</h3>
        <p className="share-card-desc">{post.description || 'Open this shared resource.'}</p>
      </div>
    </button>
    <AttachmentCard file={post.file} onOpen={onPreview} />
    <div className="share-card-meta">
      {post.subject && <span className="share-card-tag">{post.subject}</span>}
      <span className="share-card-author">by {post.author || 'Student'}</span>
    </div>
    <PostActions post={post} currentUser={currentUser} onComment={() => onOpen(post)} isFavorite={saved} onToggleFavorite={onToggleSaved} onSignIn={onSignIn} />
  </article>;
}
