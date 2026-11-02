import { useState, useEffect, useRef } from 'react';
import './homepage.css';
import botLogo from '../assets/share_logo1.png';
import { apiFetch, apiUrl } from '../../shared/api.js';
import { supabase } from '../../security/client/auth.js';
import PostActions from '../components/PostActions.jsx';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import { Search, Menu, Home, Sparkles, Bell, User, Plus, X, FileText, BookOpen, CheckCircle, Clock, Settings, Star } from 'lucide-react';

// Custom exact PDF document icon matching the screenshot
function PdfIcon({ size = 30 }) {
  return (
    <svg
      width={size}
      height={Math.round(size * 1.15)}
      viewBox="0 0 34 38"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block', flexShrink: 0 }}
    >
      <path d="M3 5C3 2.79086 4.79086 1 7 1H21.5L31 10.5V33C31 35.2091 29.2091 37 27 37H7C4.79086 37 3 35.2091 3 33V5Z" fill="#141416" />
      <path d="M21 1V10.5H30.5L21 1Z" fill="#2E2E33" />
      <path
        d="M12 24.5C10.5 25.1 8.8 25.7 7.6 25.8C6.9 25.9 6.2 25.4 6.1 24.7C6.0 23.9 6.5 23.2 7.2 22.9C8.8 22.3 10.9 21.4 12.5 19.9C13.5 17.1 14.1 14.1 14.5 12.4C14.7 11.5 15.5 10.9 16.4 11.0C17.2 11.1 17.8 11.8 17.7 12.7C17.4 14.9 16.7 17.8 15.3 20.2C17.5 21.2 20.5 21.9 23.2 22.1C24.1 22.2 24.7 22.9 24.6 23.8C24.5 24.6 23.7 25.2 22.9 25.1C20.3 24.8 17.3 24.0 14.9 22.8C13.5 23.8 12.5 24.3 12 24.5Z"
        stroke="#FFFFFF"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const inlineImageCache = new Map();
pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

function PdfPreview({ src, large = false }) {
  const [pages, setPages] = useState(null);
  const [failed, setFailed] = useState(false);
  if (failed) return <div className="share-document-preview"><FileText size={48} /><span>PDF preview unavailable</span><a href={src} target="_blank" rel="noopener noreferrer">Open PDF in a new tab</a></div>;
  return <Document file={src} loading={<span className="share-media-loading">Loading PDF preview…</span>} onLoadSuccess={({ numPages }) => setPages(numPages)} onLoadError={() => setFailed(true)}>
    <Page pageNumber={1} width={large ? 760 : 420} renderTextLayer={false} renderAnnotationLayer={false} />
    {large && pages > 1 && <p className="share-pdf-page-count">Page 1 of {pages}</p>}
  </Document>;
}

function InlineImage({ src, alt, onError }) {
  const [resolved, setResolved] = useState('');
  useEffect(() => {
    let active = true;
    const cached = inlineImageCache.get(src);
    const request = cached || apiFetch(src).then(response => {
      if (!response.ok) throw new Error('Preview unavailable');
      return response.blob();
    }).then(blob => {
      const url = URL.createObjectURL(blob);
      inlineImageCache.set(src, url);
      return url;
    });
    if (!cached) inlineImageCache.set(src, request);
    Promise.resolve(request).then(url => {
      if (!active) return;
      setResolved(url);
    }).catch(() => { if (active) onError?.(); });
    return () => { active = false; };
  }, [src, onError]);
  if (!resolved) return <span className="share-media-loading">Loading preview…</span>;
  return <img className="share-feed-media" src={resolved} alt={alt} />;
}

export default function HomePage({
  onNavigateToPedro,
  onNavigate,
  onSelectPost,
  currentUser,
  posts = [],
  setPosts
}) {
  const localPosts = posts;
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [retry, setRetry] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('All');

  // Modals and Drawers
  const [showDrawer, setShowDrawer] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showViewAllModal, setShowViewAllModal] = useState(false);
  const [previewFile, setPreviewFile] = useState(null);
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  const lastScrollYRef = useRef(0);
  const collapsedAtRef = useRef(0);
  const postsScrollRef = useRef(null);
  const notificationsAnchorRef = useRef(null);
  const notificationsButtonRef = useRef(null);
  const notificationsPanelRef = useRef(null);

  // User Profile
  const userName = currentUser?.name || 'Student';
  const [toastMessage, setToastMessage] = useState('');

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  const handleFeedScroll = (event) => {
    const current = event.currentTarget.scrollTop;
    // Hysteresis prevents desktop wheel events from repeatedly reversing the animation.
    if (current <= 20 && headerCollapsed && Date.now() - collapsedAtRef.current > 500) setHeaderCollapsed(false);
    else if (current >= 72 && !headerCollapsed) { collapsedAtRef.current = Date.now(); setHeaderCollapsed(true); }
    lastScrollYRef.current = current;
  };

  // Fetch posts on mount
  useEffect(() => {
    const controller = new AbortController();
    const fetchPosts = async () => {
      try {
        setLoading(true);
        setLoadError('');
        const res = await apiFetch('/api/posts', { signal: controller.signal });
        if (!res.ok) throw new Error('Could not load posts. Please try again.');
        if (res.ok) {
          const data = await res.json();
          const fetched = data.posts || [];
          if (!controller.signal.aborted && setPosts) setPosts(fetched);
        }
      } catch (err) {
        if (!controller.signal.aborted) setLoadError(err.message || 'Could not reach the server. Please try again.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    fetchPosts();
    return () => controller.abort();
  }, [retry, setPosts]);

  useEffect(() => {
    if (!supabase) return undefined;
    const channel = supabase.channel('share-feed-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, () => setRetry(value => value + 1))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'likes' }, () => setRetry(value => value + 1))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, () => setRetry(value => value + 1))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    if (!showDrawer && !showViewAllModal && !showProfile) return;
    const previousFocus = document.activeElement;
    const dialog = document.querySelector('.share-drawer-panel, .share-modal-sheet, .share-popup-card');
    const controls = () => [...(dialog?.querySelectorAll('button, input, [tabindex="0"]') || [])];
    controls()[0]?.focus();
    const onKeyDown = event => {
      if (event.key === 'Escape') {
        setShowDrawer(false);
        setShowViewAllModal(false);
        setShowNotifications(false);
        setShowProfile(false);
      }
      if (event.key === 'Tab' && (showDrawer || showViewAllModal)) {
        const elements = controls();
        const first = elements[0], last = elements[elements.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('keydown', onKeyDown); previousFocus?.focus(); };
  }, [showDrawer, showViewAllModal, showProfile]);

  useEffect(() => {
    if (!showNotifications) return;
    const panel = notificationsPanelRef.current;
    const trigger = notificationsButtonRef.current;
    panel?.querySelector('button')?.focus();
    const onPointerDown = event => {
      if (!notificationsAnchorRef.current?.contains(event.target)) setShowNotifications(false);
    };
    const onKeyDown = event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setShowNotifications(false);
        trigger?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      if (panel?.contains(document.activeElement)) trigger?.focus();
    };
  }, [showNotifications]);

  // Filter posts by search query and category
  const filteredPosts = localPosts.filter(post => {
    const matchesSubject = selectedSubject === 'All' ||
      (post.subject && post.subject.toLowerCase() === selectedSubject.toLowerCase());

    const query = searchQuery.toLowerCase().trim();
    const matchesSearch = !query ||
      (post.title && post.title.toLowerCase().includes(query)) ||
      (post.description && post.description.toLowerCase().includes(query)) ||
      (post.subject && post.subject.toLowerCase().includes(query)) ||
      (post.author && post.author.toLowerCase().includes(query));

    return matchesSubject && matchesSearch;
  });

  const subjects = ['All', 'DSA', 'OOP', 'Discrete Math', 'OS', 'Syllabi', 'General'];

  const handlePostClick = (item) => {
    if (onSelectPost) {
      onSelectPost(item);
    } else if (onNavigate) {
      onNavigate('post-detail', item);
    }
  };

  const handleCreateClick = () => {
    if (onNavigate) {
      onNavigate('create-post');
    }
  };

  return (
    <div className="share-app-viewport">
      <div className={`share-frame-container frame-auto ${headerCollapsed ? 'header-is-collapsed' : ''}`}>

        {/* ================= TOP PURPLE HEADER ================= */}
        <header className={`share-purple-header ${headerCollapsed ? 'is-collapsed' : ''}`}>
          {/* Top Row: Notifications, Brand/Title (on desktop), and Profile */}
          <div className="share-top-row">
            <div className="share-notifications-anchor" ref={notificationsAnchorRef}>
              <button
                ref={notificationsButtonRef}
                className="share-icon-btn"
                onClick={() => { if (localStorage.getItem('share-welcome-notices') === 'false') showToast('Welcome notices are turned off in Settings.'); else { setShowProfile(false); setShowNotifications(open => !open); } }}
                title="Notifications"
                aria-label="Notifications"
                aria-expanded={showNotifications}
                aria-controls={showNotifications ? 'share-notifications-panel' : undefined}
                aria-haspopup="dialog"
              >
                <Bell size={24} color="#FFFFFF" strokeWidth={2} />
              </button>
              {showNotifications && (
                <div className="share-notifications-popover" id="share-notifications-panel" ref={notificationsPanelRef} role="dialog" aria-labelledby="share-notifications-title">
                  <div className="share-popup-header">
                    <h4 id="share-notifications-title">Notifications</h4>
                    <button aria-label="Close notifications" onClick={() => { setShowNotifications(false); notificationsButtonRef.current?.focus(); }}><X size={16} /></button>
                  </div>
                  <div className="share-popup-item">
                    <CheckCircle size={18} color="#48bb78" />
                    <div>
                      <strong>Welcome to S.H.A.R.E!</strong>
                      <p>The academic resource sharing network for students.</p>
                    </div>
                  </div>
                  <div className="share-popup-item">
                    <Clock size={18} color="#9A89C6" />
                    <div>
                      <strong>Your academic community</strong>
                      <p>New shared resources appear in your feed.</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Desktop Center Brand (hidden on phone, shown on tablet/laptop) */}
            <div className="share-header-desktop-title">
              <span>S.H.A.R.E. Academic Network</span>
            </div>

            <div className="share-top-right-group">
              <button
                className="share-login-quick-btn"
                onClick={() => onNavigate && onNavigate('login')}
                title="Log In or Switch Account"
              >
                Log In
              </button>

              <button
                className="share-icon-btn share-avatar-btn"
                onClick={() => { setShowNotifications(false); setShowProfile(!showProfile); }}
                title="Profile"
                aria-label="Profile"
              >
                <div className="share-avatar-circle">
                  <User size={18} color="#9A89C6" strokeWidth={2.5} />
                </div>
              </button>
            </div>
          </div>

          {/* S.H.A.R.E Mascot and Brand Title (Centered) */}
          <div className="share-brand-center">
            <div className="share-mascot-img-wrap">
              <img
                src={botLogo}
                alt="S.H.A.R.E Mascot"
                className="share-mascot-img"
              />
            </div>
            <h1 className="share-brand-title">S.H.A.R.E</h1>
          </div>

          {/* Search Bar (Scaled for phone, tablet, and laptop) */}
          <div className="share-search-bar">
            <Search className="share-search-icon" size={19} color="#1A1A1A" />
            <input
              type="text"
              aria-label="Search posts"
              placeholder="Search notes, subjects, or topics..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="share-search-input"
            />
            {searchQuery && (
              <button
                className="share-clear-search-btn"
                onClick={() => setSearchQuery('')}
                title="Clear search"
              >
                <X size={16} />
              </button>
            )}
          </div>

        </header>

        <div className={`share-compact-header ${headerCollapsed ? 'is-visible' : ''}`} aria-hidden={!headerCollapsed}>
          <button type="button" className="share-compact-control" aria-label="Notifications" tabIndex={headerCollapsed ? 0 : -1} onClick={() => setShowNotifications(open => !open)}><Bell size={19} /></button>
          <label className="share-compact-search"><Search size={16} /><input aria-label="Search posts" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search" tabIndex={headerCollapsed ? 0 : -1} /></label>
          <button type="button" className="share-compact-control" aria-label="Profile" tabIndex={headerCollapsed ? 0 : -1} onClick={() => setShowProfile(open => !open)}><User size={19} /></button>
        </div>

        {/* ================= MIDDLE MAIN BODY (POSTS & FEED) ================= */}
        <main className="share-posts-body">
          {/* Posts Headline Row with View All & New Post */}
          <div className="share-posts-header-row">
            <div className="share-headline-wrap">
              <h2 className="share-posts-headline">POSTS</h2>
              <span className="share-posts-count-badge">
                {filteredPosts.length} {filteredPosts.length === 1 ? 'post' : 'posts'}
              </span>
            </div>

            <div className="share-posts-header-actions">
              <button
                className="share-view-all-btn"
                onClick={() => setShowViewAllModal(true)}
              >
                View all &gt;
              </button>
            </div>
          </div>

          {/* Subject Pills Filter (Horizontally scrollable) */}
          <div className="share-subject-chips">
            {subjects.map(subj => (
              <button
                key={subj}
                className={`share-chip ${selectedSubject === subj ? 'active' : ''}`}
                onClick={() => setSelectedSubject(subj)}
              >
                {subj}
              </button>
            ))}
          </div>

          {/* Posts Scroll Feed or Empty State */}
          <div className="share-posts-scroll-list" ref={postsScrollRef} onScroll={handleFeedScroll}>
            {loadError && <div className="core-message" role="alert"><p>{loadError}</p><button type="button" onClick={() => setRetry(value => value + 1)}>Retry</button></div>}
            {loading ? (
              <div className="share-loading-state">
                <div className="share-spinner"></div>
                <p>Loading posts...</p>
              </div>
            ) : loadError && !localPosts.length ? null : filteredPosts.length > 0 ? (
              /* Display user posts in responsive cards grid */
              <div className="share-posts-grid">
                {filteredPosts.map((item) => (
                  <article key={item.id} className="share-post-card">
                    <div className="share-card-open" role="button" tabIndex={0} onClick={() => handlePostClick(item)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); handlePostClick(item); } }}>
                    <div className="share-card-content">
                      <div className="share-feed-author-row">
                        <div className="share-feed-avatar"><User size={18} /></div>
                        <strong>{item.author || 'Student'}</strong>
                        <span>{item.createdAt ? new Date(item.createdAt).toLocaleString() : 'Recently'}</span>
                      </div>
                      <h3 className="share-card-title">{item.title}</h3>
                      <p className="share-card-desc">{item.description || 'Open this shared resource.'}</p>
                      {item.file && (() => {
                        const fileUrl = apiUrl(item.file.url);
                        const type = item.file.mimetype || '';
                        if (type.startsWith('image/')) return <button type="button" className="share-feed-media-button" onClick={(event) => { event.stopPropagation(); setPreviewFile({ ...item.file, url: fileUrl }); }}><InlineImage src={fileUrl} alt={item.file.originalname || 'Post attachment'} onError={() => {}} /><span className="share-media-fallback">Preview unavailable — open the attachment</span></button>;
                        if (type.startsWith('video/')) return <button type="button" className="share-feed-media-button" onClick={(event) => { event.stopPropagation(); setPreviewFile({ ...item.file, url: fileUrl }); }}><video className="share-feed-media" src={fileUrl} preload="metadata" muted /></button>;
                        if (type === 'application/pdf') return <button type="button" className="share-feed-file-preview share-pdf-card" onClick={(event) => { event.stopPropagation(); setPreviewFile({ ...item.file, url: fileUrl }); }}><PdfPreview src={fileUrl} /><span>{item.file.originalname || 'Open PDF'}</span></button>;
                        return <button type="button" className="share-feed-file-preview" onClick={(event) => { event.stopPropagation(); setPreviewFile({ ...item.file, url: fileUrl }); }}><PdfIcon size={28} /><span>{item.file.originalname || 'Open attachment'}</span></button>;
                      })()}
                      <div className="share-card-meta">
                        {item.subject && <span className="share-card-tag">{item.subject}</span>}
                        <span className="share-card-author">by {item.author || 'Student'}</span>
                      </div>
                    </div>

                    </div>
                    <PostActions key={`${item.id}:${currentUser?.id || 'guest'}`} post={item} currentUser={currentUser} onComment={() => handlePostClick(item)} onPedro={onNavigateToPedro} onSignIn={() => onNavigate?.('login')} />
                  </article>
                ))}
              </div>
            ) : (
              /* Empty State (Exact requirement: users haven't posted yet) */
              <div className="share-empty-container">
                <div className="share-empty-badge">
                  <FileText size={38} color="#9A89C6" strokeWidth={1.8} />
                </div>
                <h3 className="share-empty-title">
                  {searchQuery || selectedSubject !== 'All'
                    ? 'No matching posts found'
                    : 'No posts yet'}
                </h3>
                <p className="share-empty-subtitle">
                  {searchQuery || selectedSubject !== 'All'
                    ? 'Try adjusting your search terms or switch subject category.'
                    : 'Be the first student to share lecture notes, syllabi, or study guides!'}
                </p>
                <button
                  className="share-create-first-btn"
                  onClick={handleCreateClick}
                >
                  <Plus size={18} />
                  <span>Share Notes / Post</span>
                </button>
              </div>
            )}
          </div>

        </main>

        {/* ================= BOTTOM NAVIGATION BAR ================= */}
        <nav className="share-bottom-nav">
          {/* Menu Button (Left) */}
          <button
            className="share-nav-item"
            onClick={() => setShowDrawer(true)}
            title="Menu & Subjects"
            aria-label="Menu"
          >
            <Menu size={26} color="#111116" strokeWidth={2.2} />
          </button>

          {/* Home Button (Center - Active) */}
          <button
            className="share-nav-item active-nav"
            onClick={() => {
              setSelectedSubject('All');
              setSearchQuery('');
            }}
            title="Home Feed"
            aria-label="Home"
          >
            <Home size={26} color="#111116" fill="#111116" strokeWidth={1} />
          </button>

          {/* Sparkles / PEDRO AI Button (Right) */}
          <button
            className="share-nav-item"
            onClick={() => {
              if (onNavigateToPedro) {
                onNavigateToPedro();
              } else if (onNavigate) {
                onNavigate('pedro');
              }
            }}
            title="PEDRO AI Assistant"
            aria-label="PEDRO AI"
          >
            <Sparkles size={26} color="#111116" strokeWidth={2.2} />
          </button>
        </nav>

        {/* ================= VIEW ALL / CATEGORIES MODAL ================= */}
        {showViewAllModal && (
          <div className="share-modal-backdrop" onClick={() => setShowViewAllModal(false)}>
            <div className="share-modal-sheet" role="dialog" aria-modal="true" aria-label="Subjects and categories" onClick={(e) => e.stopPropagation()}>
              <div className="share-modal-header">
                <h3>All Subjects & Categories</h3>
                <button className="share-close-btn" aria-label="Close" onClick={() => setShowViewAllModal(false)}>
                  <X size={20} />
                </button>
              </div>
              <div className="share-categories-grid">
                {subjects.map(s => (
                  <button
                    key={s}
                    className={`share-cat-card ${selectedSubject === s ? 'selected' : ''}`}
                    onClick={() => {
                      setSelectedSubject(s);
                      setShowViewAllModal(false);
                    }}
                  >
                    <BookOpen size={20} />
                    <span>{s}</span>
                    <span className="share-cat-count">
                      {s === 'All' ? localPosts.length : localPosts.filter(p => p.subject?.toLowerCase() === s.toLowerCase()).length}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ================= PROFILE POPUP ================= */}
        {showProfile && (
          <div className="share-popup-card">
            <div className="share-popup-header">
              <h4>Student Profile</h4>
              <button aria-label="Close profile" onClick={() => setShowProfile(false)}><X size={16} /></button>
            </div>
            <div className="share-profile-info">
              <div className="share-profile-avatar">
                <User size={30} color="#9A89C6" />
              </div>
              <div className="share-profile-details">
                <strong>{userName}</strong>
                <span>Student Hub Member</span>
              </div>
            </div>
            <div className="share-profile-actions">
              <button
                type="button"
                className="share-profile-action-btn"
                onClick={() => {
                  setShowProfile(false);
                  if (onNavigate) onNavigate('login');
                }}
              >
                Switch Account / Log In
              </button>
              <button
                type="button"
                className="share-profile-action-btn outline"
                onClick={() => {
                  setShowProfile(false);
                  if (onNavigate) onNavigate('signup');
                }}
              >
                Create New Account
              </button>
            </div>
          </div>
        )}

        {/* ================= SIDE DRAWER ================= */}
        {showDrawer && (
          <div className="share-drawer-backdrop" onClick={() => setShowDrawer(false)}>
            <div className="share-drawer-panel" role="dialog" aria-modal="true" aria-label="Main menu" onClick={(e) => e.stopPropagation()}>
              <div className="share-drawer-header">
                <div className="share-drawer-brand">
                  <img src={botLogo} alt="Logo" className="share-drawer-logo" />
                  <span>S.H.A.R.E.</span>
                </div>
                <button onClick={() => setShowDrawer(false)} className="share-close-btn" aria-label="Close">
                  <X size={20} />
                </button>
              </div>

              <div className="share-drawer-menu">
                <button
                  className="share-drawer-item active"
                  onClick={() => {
                    setSelectedSubject('All');
                    setShowDrawer(false);
                  }}
                >
                  <Home size={19} />
                  <span>Home Feed</span>
                </button>

                <button
                  className="share-drawer-item"
                  onClick={() => {
                    setShowDrawer(false);
                    handleCreateClick();
                  }}
                >
                  <Plus size={19} />
                  <span>Create / Share Post</span>
                </button>

                <button
                  className="share-drawer-item"
                  onClick={() => {
                    setShowDrawer(false);
                    if (onNavigateToPedro) onNavigateToPedro();
                    else if (onNavigate) onNavigate('pedro');
                  }}
                >
                  <Sparkles size={19} />
                  <span>P.E.D.R.O. AI Assistant</span>
                </button>

                <div className="share-drawer-divider"></div>

                <button
                  className="share-drawer-item"
                  onClick={() => {
                    setShowDrawer(false);
                    if (onNavigate) onNavigate('login');
                  }}
                >
                  <User size={19} />
                  <span>Log In Screen</span>
                </button>

                <button
                  className="share-drawer-item"
                  onClick={() => {
                    setShowDrawer(false);
                    if (onNavigate) onNavigate('signup');
                  }}
                >
                  <Plus size={19} />
                  <span>Sign Up Screen</span>
                </button>

                <button
                  className="share-drawer-item"
                  onClick={() => {
                    setShowDrawer(false);
                    if (onNavigate) onNavigate('settings');
                  }}
                >
                  <Settings size={19} />
                  <span>Settings</span>
                </button>

                <button
                  className="share-drawer-item"
                  onClick={() => {
                    setShowDrawer(false);
                    if (onNavigate) onNavigate('favorites');
                  }}
                >
                  <Star size={19} />
                  <span>Favorites</span>
                </button>

                <div className="share-drawer-divider"></div>

                <div className="share-drawer-section-title">Filter by Subject</div>
                {subjects.slice(1).map(s => (
                  <button
                    key={s}
                    className="share-drawer-sub-item"
                    onClick={() => {
                      setSelectedSubject(s);
                      setShowDrawer(false);
                    }}
                  >
                    <span>{s}</span>
                    <span className="share-drawer-count">
                      {localPosts.filter(p => p.subject?.toLowerCase() === s.toLowerCase()).length}
                    </span>
                  </button>
                ))}
              </div>

              <div className="share-drawer-footer">
                <p>Student Hub for Academic Resources & Exchange</p>
                <small>Version 2.0 (Multi-Screen Responsive)</small>
              </div>
            </div>
          </div>
        )}

        {previewFile && (
          <div className="share-file-preview-backdrop" role="dialog" aria-modal="true" aria-label="Attachment preview" onClick={() => setPreviewFile(null)}>
            <div className="share-file-preview-modal" onClick={(event) => event.stopPropagation()}>
              <button type="button" className="share-close-btn" aria-label="Close preview" onClick={() => setPreviewFile(null)}><X size={20} /></button>
              {previewFile.mimetype?.startsWith('image/') ? <img src={previewFile.url} alt={previewFile.originalname || 'Attachment'} /> : previewFile.mimetype?.startsWith('video/') ? <video src={previewFile.url} controls autoPlay /> : previewFile.mimetype === 'application/pdf' ? <PdfPreview src={previewFile.url} large /> : <div className="share-document-preview"><FileText size={48} /><h3>{previewFile.originalname || 'Document'}</h3><a href={previewFile.url} target="_blank" rel="noopener noreferrer" download={previewFile.originalname}>Open document in a new tab</a></div>}
            </div>
          </div>
        )}

        {/* Toast Notification */}
        {toastMessage && (
          <div className="share-toast-notification" role="status">
            {toastMessage}
          </div>
        )}

      </div>
    </div>
  );
}
