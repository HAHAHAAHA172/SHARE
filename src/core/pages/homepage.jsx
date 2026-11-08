import { useState, useEffect, useMemo, useRef, useCallback, useDeferredValue } from 'react';
import './homepage.css';
import botLogo from '../assets/share_logo1.png';
import { supabase } from '../../security/client/auth.js';
import NotificationPopover from '../components/NotificationPopover.jsx';
import PostCard from '../components/PostCard.jsx';
import { AttachmentModalContent } from '../components/AttachmentPreview.jsx';
import useNotifications from '../hooks/useNotifications.js';
import useFeed from '../hooks/useFeed.js';
import { watchFeedUpdates } from '../feedUpdates.js';
import { Search, Menu, Home, Sparkles, Bell, User, Plus, X, FileText, BookOpen, Settings, Star } from 'lucide-react';

export default function HomePage({
  onNavigateToPedro,
  onNavigate,
  onLogout,
  onSelectPost,
  currentUser,
  posts = [],
  setPosts,
  favorites = [],
  onToggleFavorite
}) {
  const localPosts = posts;
  const [retry, setRetry] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('All');
  const deferredSearchQuery = useDeferredValue(searchQuery.trim());

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
  const notificationsButtonRef = useRef(null);
  const compactNotificationsButtonRef = useRef(null);
  const feedEndRef = useRef(null);
  const toastTimerRef = useRef(null);

  // User Profile
  const userName = currentUser?.name || 'Student';
  const [toastMessage, setToastMessage] = useState('');
  const { notifications, loading: notificationsLoading, error: notificationsError, refresh: refreshNotifications } = useNotifications(currentUser);
  const { loading, loadingMore, error: loadError, total, hasMore, loadMore } = useFeed({
    currentUserId: currentUser?.id,
    query: deferredSearchQuery,
    subject: selectedSubject,
    refreshVersion: retry,
    setPosts
  });
  const closeNotifications = useCallback(() => setShowNotifications(false), []);

  const showToast = useCallback((msg) => {
    clearTimeout(toastTimerRef.current);
    setToastMessage(msg);
    toastTimerRef.current = setTimeout(() => setToastMessage(''), 3000);
  }, []);
  useEffect(() => () => clearTimeout(toastTimerRef.current), []);

  const handleFeedScroll = (event) => {
    const current = event.currentTarget.scrollTop;
    // Hysteresis prevents desktop wheel events from repeatedly reversing the animation.
    if (current <= 20 && headerCollapsed && Date.now() - collapsedAtRef.current > 500) setHeaderCollapsed(false);
    else if (current >= 72 && !headerCollapsed) { collapsedAtRef.current = Date.now(); setHeaderCollapsed(true); }
    lastScrollYRef.current = current;
  };

  useEffect(() => {
    return watchFeedUpdates({ client: supabase, refresh: () => setRetry(value => value + 1) });
  }, [currentUser?.id]);

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
    if (!currentUser || !showNotifications) return;
    void refreshNotifications();
  }, [currentUser, showNotifications, refreshNotifications]);

  // Filter posts by search query and category
  const filteredPosts = useMemo(() => localPosts.filter(post => {
    const matchesSubject = selectedSubject === 'All' ||
      (post.subject && post.subject.toLowerCase() === selectedSubject.toLowerCase());

    const query = searchQuery.toLowerCase().trim();
    const matchesSearch = !query ||
      (post.title && post.title.toLowerCase().includes(query)) ||
      (post.description && post.description.toLowerCase().includes(query)) ||
      (post.subject && post.subject.toLowerCase().includes(query)) ||
      (post.author && post.author.toLowerCase().includes(query));

    return matchesSubject && matchesSearch;
  }), [localPosts, searchQuery, selectedSubject]);
  const visiblePosts = filteredPosts;

  useEffect(() => {
    const target = feedEndRef.current;
    if (!target || !hasMore || loadingMore) return undefined;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) void loadMore();
    }, { root: postsScrollRef.current, rootMargin: '500px 0px' });
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, loadMore, loadingMore]);

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
      <div className={`share-frame-container frame-auto ${headerCollapsed ? 'header-is-collapsed' : ''} ${showNotifications && !headerCollapsed ? 'notifications-open' : ''}`}>

        {/* ================= TOP PURPLE HEADER ================= */}
        <header className={`share-purple-header ${headerCollapsed ? 'is-collapsed' : ''} ${showNotifications && !headerCollapsed ? 'notifications-open' : ''}`}>
          {/* Top Row: Notifications, Brand/Title (on desktop), and Profile */}
          <div className="share-top-row">
            <div className="share-notifications-anchor">
              <button
                ref={notificationsButtonRef}
                className="share-icon-btn"
                onClick={() => { if (localStorage.getItem('share-welcome-notices') === 'false') showToast('Welcome notices are turned off in Settings.'); else { setShowProfile(false); setShowNotifications(open => !open); } }}
                title="Notifications"
                aria-label="Notifications"
                aria-expanded={showNotifications}
                aria-controls={showNotifications && !headerCollapsed ? 'share-notifications-expanded' : undefined}
                aria-haspopup="dialog"
              >
                <Bell size={24} color="#FFFFFF" strokeWidth={2} />
              </button>
              {showNotifications && !headerCollapsed && (
                <NotificationPopover id="share-notifications-expanded" notifications={notifications} loading={notificationsLoading} error={notificationsError}
                  onRetry={() => refreshNotifications({ force: true })} onClose={closeNotifications} triggerRef={notificationsButtonRef} />
              )}
            </div>

            {/* Desktop Center Brand (hidden on phone, shown on tablet/laptop) */}
            <div className="share-header-desktop-title">
              <span>S.H.A.R.E. Academic Network</span>
            </div>

            <div className="share-top-right-group">
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
          <div className="share-compact-notifications-anchor">
            <button ref={compactNotificationsButtonRef} type="button" className="share-compact-control" aria-label="Notifications" aria-expanded={showNotifications && headerCollapsed} aria-controls={showNotifications && headerCollapsed ? 'share-notifications-compact' : undefined} tabIndex={headerCollapsed ? 0 : -1} onClick={() => { setShowProfile(false); setShowNotifications(open => !open); }}><Bell size={19} /></button>
            {showNotifications && headerCollapsed && <NotificationPopover compact id="share-notifications-compact" notifications={notifications} loading={notificationsLoading} error={notificationsError}
              onRetry={() => refreshNotifications({ force: true })} onClose={closeNotifications} triggerRef={compactNotificationsButtonRef} />}
          </div>
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
                {total} {total === 1 ? 'post' : 'posts'}
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
              <div className="share-skeleton-grid" aria-label="Loading posts" aria-busy="true">
                {[0, 1, 2, 3].map(index => (
                  <div className="share-skeleton-card" key={index}>
                    <div className="share-skeleton-line share-skeleton-author" />
                    <div className="share-skeleton-line share-skeleton-title" />
                    <div className="share-skeleton-line share-skeleton-description" />
                    <div className="share-skeleton-line share-skeleton-description short" />
                  </div>
                ))}
              </div>
            ) : loadError && !localPosts.length ? null : filteredPosts.length > 0 ? (
              /* Display user posts in responsive cards grid */
              <div className="share-posts-grid">
                {visiblePosts.map((item) => (
                  <PostCard
                    key={item.id}
                    post={item}
                    currentUser={currentUser}
                    saved={favorites.some((saved) => saved.id === item.id)}
                    onOpen={handlePostClick}
                    onPreview={setPreviewFile}
                    onToggleSaved={onToggleFavorite}
                    onSignIn={() => onNavigate?.('login')}
                  />
                ))}
                {hasMore && <div ref={feedEndRef} className="share-feed-sentinel" aria-hidden="true" />}
                {loadingMore && <div className="share-feed-loading-more" role="status">Loading more posts…</div>}
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
                  onNavigate?.('settings');
                }}
              >
                Edit Profile
              </button>
              <button
                type="button"
                className="share-profile-action-btn outline"
                onClick={() => {
                  setShowProfile(false);
                  onLogout?.();
                }}
              >
                Log out
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
                  <span>Saved</span>
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
              <AttachmentModalContent file={previewFile} />
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
