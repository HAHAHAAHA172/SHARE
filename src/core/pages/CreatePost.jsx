import { useState, useRef } from 'react';
import './CreatePost.css';
import botLogo from '../assets/share_logo1.png';
import { apiFetch } from '../../shared/api.js';
import { ArrowLeft, User, FilePlus, Image as ImageIcon, Video, MoreHorizontal, X, FileText } from 'lucide-react';

export default function CreatePost({ currentUser, onNavigate, onPostCreated }) {
  const [content, setContent] = useState('');
  const [subject, setSubject] = useState('DSA');
  const [showSubjectPicker, setShowSubjectPicker] = useState(false);
  const [attachedFile, setAttachedFile] = useState(null);
  const [attachedMedia, setAttachedMedia] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const fileInputRef = useRef(null);
  const mediaInputRef = useRef(null);

  const authorName = currentUser?.name || 'Student';

  const subjects = ['DSA', 'OOP', 'Discrete Math', 'OS', 'Syllabi', 'General'];

  const handlePost = async () => {
    if (isSubmitting) return;
    if (!content.trim() && !attachedFile && !attachedMedia) {
      setError('Write a post or attach a resource before posting.');
      return;
    }
    setError('');
    setIsSubmitting(true);
    const attachment = attachedFile || attachedMedia;
    if (attachment?.size > 10 * 1024 * 1024) {
      setError('Choose an attachment smaller than 10 MB.');
      setIsSubmitting(false);
      return;
    }
    const lines = content.trim().split('\n');
    const formData = new FormData();
    formData.append('title', lines[0] || attachment?.name || 'Shared Academic Resource');
    formData.append('description', lines.slice(1).join('\n'));
    formData.append('subject', subject);
    if (attachment) formData.append('file', attachment);
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
            {(attachedFile || attachedMedia) && (
              <div className="createpost-file-badge">
                <FileText size={16} color="#9A89C6" />
                <span className="createpost-file-badge-name">
                  {attachedFile ? attachedFile.name : attachedMedia?.name}
                </span>
                <button
                  type="button"
                  className="createpost-file-badge-remove"
                  aria-label="Remove attachment"
                  onClick={() => {
                    setAttachedFile(null);
                    setAttachedMedia(null);
                  }}
                >
                  <X size={14} />
                </button>
              </div>
            )}

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
                accept=".pdf,.doc,.docx,.txt"
                style={{ display: 'none' }}
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    setAttachedFile(e.target.files[0]);
                    setAttachedMedia(null);
                    e.target.value = '';
                  }
                }}
              />
              <input
                ref={mediaInputRef}
                type="file"
                accept="image/*,video/*"
                style={{ display: 'none' }}
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    setAttachedMedia(e.target.files[0]);
                    setAttachedFile(null);
                    e.target.value = '';
                  }
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
