import { useState, useRef } from 'react';
import './CreatePost.css';
import botLogo from '../assets/share_logo1.png';
import { apiFetch } from '../../shared/api.js';
import { ArrowLeft, User, FilePlus, Image as ImageIcon, Video, MoreHorizontal, X, FileText } from 'lucide-react';
import { optimizeImageFile } from '../../shared/imageOptimization.js';

export default function CreatePost({ currentUser, onNavigate, onPostCreated }) {
  const [content, setContent] = useState('');
  const [subject, setSubject] = useState('DSA');
  const [showSubjectPicker, setShowSubjectPicker] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const fileInputRef = useRef(null);
  const mediaInputRef = useRef(null);

  const authorName = currentUser?.name || 'Student';

  const subjects = ['DSA', 'OOP', 'Discrete Math', 'OS', 'Syllabi', 'General'];

  const handlePost = async () => {
    if (isSubmitting) return;
    if (!content.trim() && attachments.length === 0) {
      setError('Write a post or attach a resource before posting.');
      return;
    }
    setError('');
    setIsSubmitting(true);
    if (attachments.some(attachment => attachment.size > 10 * 1024 * 1024)) {
      setError('Each attachment must be smaller than 10 MB.');
      setIsSubmitting(false);
      return;
    }
    const lines = content.trim().split('\n');
    const formData = new FormData();
    formData.append('title', lines[0] || attachments[0]?.name || 'Shared Academic Resource');
    formData.append('description', lines.slice(1).join('\n'));
    formData.append('subject', subject);
    attachments.forEach(attachment => formData.append('files', attachment));
    try {
      const response = await apiFetch('/api/posts', { method: 'POST', body: formData });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Could not publish this post. Please try again.');
      const savedPost = result.post || result;
      if (!savedPost.id) throw new Error('The server did not return a saved post. Please try again.');
      if (onPostCreated) onPostCreated(savedPost);
      else onNavigate?.('home');
    } catch (failure) {
      setError(failure.message || 'Could not reach the server. Your draft is still here.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="createpost-screen-wrapper">
      <div className="createpost-card-container">
        {/* Top Navigation Row */}
        <header className="createpost-header-bar">
          <button
            type="button"
            className="createpost-back-btn"
            onClick={() => onNavigate && onNavigate('home')}
            title="Back"
          >
            <ArrowLeft size={24} color="#FFFFFF" strokeWidth={2.2} />
          </button>

          {/* S.H.A.R.E Bot Mascot Icon in Center */}
          <div className="createpost-top-mascot-circle">
            <img src={botLogo} alt="S.H.A.R.E Mascot" className="createpost-mascot-img" />
          </div>

          <div style={{ width: 40 }} /> {/* Spacer for symmetry */}
        </header>

        {/* Center Post Creator Card (Matches Screenshot 3) */}
        <main className="createpost-content-area">
          <div className="createpost-main-box">
            {/* Author Row */}
            <div className="createpost-author-row">
              <div className="createpost-author-avatar">
                <User size={22} color="#111116" strokeWidth={2.4} />
              </div>
              <span className="createpost-author-name">{authorName}</span>
              <button type="button" className="createpost-subject-tag" aria-expanded={showSubjectPicker} onClick={() => setShowSubjectPicker(!showSubjectPicker)}>
                #{subject} ▾
              </button>
            </div>

            {/* Subject Picker Dropdown */}
            {showSubjectPicker && (
              <div className="createpost-subject-dropdown">
                {subjects.map(s => (
                  <button
                    key={s}
                    type="button"
                    className={`createpost-subject-opt ${subject === s ? 'active' : ''}`}
                    onClick={() => {
                      setSubject(s);
                      setShowSubjectPicker(false);
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {/* Post Textarea with underline */}
            <div className="createpost-input-container">
              <textarea
                aria-label="Post title and description"
                placeholder="Title on the first line, then your description"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="createpost-textarea"
                rows={4}
                maxLength={8201}
                autoFocus
              />
              <div className="createpost-input-underline"></div>
            </div>

            {/* Attached File Preview Badge if any */}
            {attachments.length > 0 && <div className="createpost-file-list" aria-label="Selected attachments">
              {attachments.map((attachment, index) => <div className="createpost-file-badge" key={`${attachment.name}:${attachment.lastModified}:${index}`}>
                <FileText size={16} color="#9A89C6" />
                <span className="createpost-file-badge-name">{attachment.name}</span>
                <button type="button" className="createpost-file-badge-remove" aria-label={`Remove ${attachment.name}`} onClick={() => setAttachments(items => items.filter((_, itemIndex) => itemIndex !== index))}><X size={14} /></button>
              </div>)}
            </div>}

            {/* Media & Attachment Icons Row */}
            <div className="createpost-actions-row">
              <button
                type="button"
                className="createpost-action-btn"
                onClick={() => fileInputRef.current?.click()}
                title="Attach Document / PDF"
              >
                <FilePlus size={22} color="#E0E0E6" strokeWidth={1.8} />
              </button>

              <button
                type="button"
                className="createpost-action-btn"
                onClick={() => mediaInputRef.current?.click()}
                title="Attach Picture / Photo"
              >
                <ImageIcon size={22} color="#E0E0E6" strokeWidth={1.8} />
              </button>

              <button
                type="button"
                className="createpost-action-btn"
                onClick={() => mediaInputRef.current?.click()}
                title="Attach Video"
              >
                <Video size={22} color="#E0E0E6" strokeWidth={1.8} />
              </button>

              <button
                type="button"
                className="createpost-action-btn"
                onClick={() => setShowSubjectPicker(!showSubjectPicker)}
                title="Subject Category & More"
              >
                <MoreHorizontal size={22} color="#E0E0E6" strokeWidth={1.8} />
              </button>

              {/* Hidden file inputs */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx,.pptx,.txt"
                multiple
                style={{ display: 'none' }}
                onChange={(e) => {
                  const selected = Array.from(e.target.files || []);
                  setAttachments(items => [...items, ...selected].slice(0, 4));
                  e.target.value = '';
                }}
              />
              <input
                ref={mediaInputRef}
                type="file"
                accept="image/*,video/*"
                multiple
                style={{ display: 'none' }}
                onChange={async (e) => {
                  const selected = Array.from(e.target.files || []);
                  e.target.value = '';
                  const optimized = await Promise.all(selected.map(file => file.type.startsWith('image/') ? optimizeImageFile(file) : file));
                  setAttachments(items => [...items, ...optimized].slice(0, 4));
                }}
              />
            </div>
          </div>
        </main>

        {/* Bottom Post Button (Matches Screenshot 3) */}
        <footer className="createpost-footer-bar">
          {error && <p className="core-message" role="alert">{error}</p>}
          <button
            type="button"
            className="createpost-submit-btn"
            onClick={handlePost}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Posting...' : 'Post'}
          </button>
        </footer>
      </div>
    </div>
  );
}
