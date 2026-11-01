import { lazy, Suspense, useEffect, useState } from 'react';
import HomePage from './core/pages/homepage.jsx';
import LandingPage from './core/pages/LandingPage.jsx';
import Login from './core/pages/Login.jsx';
import SignUp from './core/pages/SignUp.jsx';
import CreatePost from './core/pages/CreatePost.jsx';
import ResourceDetailPage from './core/pages/ResourceDetailPage.jsx';
import Settings from './core/pages/Settings.jsx';
import Favorites from './core/pages/Favorites.jsx';
import { supabase, signOut, readDeviceValue, writeDeviceValue } from './security/client/auth.js';
import './core/core.css';
import './App.css';
import './security/client/production.css';

const Chatbot = lazy(() => import('./chatbot/Chatbot.jsx'));
const screens = new Set(['landing', 'home', 'login', 'signup', 'create-post', 'post-detail', 'pedro', 'settings', 'favorites']);
function readRoute() {
  if (window.location.pathname !== '/') return { screen: 'not-found', postId: null };
  if (!window.location.hash || window.location.hash === '#/' || window.location.hash === '#') return { screen: 'landing', postId: null };
  // Supabase consumes confirmation and recovery tokens before routing resumes.
  if (/^#(?:access_token=|error=)/.test(window.location.hash)) return { screen: 'login', postId: null };
  const [screen, encodedId, ...extra] = window.location.hash.replace(/^#\/?/, '').split('/');
  if (!screens.has(screen) || extra.length || (encodedId && screen !== 'post-detail')) {
    return { screen: 'not-found', postId: null };
  }
  let postId = null;
  if (screen === 'post-detail' && encodedId) {
    try { postId = decodeURIComponent(encodedId); }
    catch { return { screen: 'not-found', postId: null }; }
  }
  return { screen, postId };
}
function readFavorites(identity) {
  try {
    const saved = JSON.parse(readDeviceValue(`share-favorites:${identity}`, '[]'));
    return Array.isArray(saved) ? saved.filter(post => post && typeof post.id === 'string') : [];
  } catch { return []; }
}
function displayName(user) {
  const supplied = user?.user_metadata?.display_name;
  if (typeof supplied === 'string' && supplied.trim()) return supplied.replace(/\p{Cc}/gu, '').trim().slice(0, 80);
  return user?.email?.split('@')[0] || 'Student';
}

export default function App() {
  const [{ screen, postId }, setRoute] = useState(readRoute);
  const [auth, setAuth] = useState({ user: null, ready: !supabase, recovery: false });
  const currentUser = auth.user ? { id: auth.user.id, email: auth.user.email,
    name: displayName(auth.user) } : null;
  const identity = currentUser?.id || 'guest';
  const [notification, setNotification] = useState('');
  const [posts, setPosts] = useState([]);
  const [selectedPost, setSelectedPost] = useState(null);
  const [favorites, setFavorites] = useState(() => readFavorites('guest'));
  const [chatOpened, setChatOpened] = useState(() => readRoute().screen === 'pedro');
  const [studyPost, setStudyPost] = useState(null);

  useEffect(() => {
    // Old local demo profiles are never accepted as authentication.
    writeDeviceValue('share-profile', null);
    writeDeviceValue('share-profile', null, false);
    if (!supabase) return;
    let active = true;
    let revision = 0;
    let previousIdentity = 'guest';
    const applySession = (session, event) => {
      if (!active) return;
      const nextIdentity = session?.user?.id || 'guest';
      if (nextIdentity !== previousIdentity) {
        setFavorites(readFavorites(nextIdentity));
        setStudyPost(null);
        setSelectedPost(null);
        setChatOpened(nextIdentity !== 'guest' && readRoute().screen === 'pedro');
        previousIdentity = nextIdentity;
      }
      setAuth(previous => ({ user: session?.user || null, ready: true,
        recovery: event === 'PASSWORD_RECOVERY' || (event !== 'SIGNED_OUT' && previous.recovery) }));
      if (event === 'PASSWORD_RECOVERY') {
        setRoute({ screen: 'login', postId: null });
        window.location.hash = '/login';
      }
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') return;
      revision += 1;
      const eventRevision = revision;
      if (!session) { applySession(null, event); return; }
      // Auth also emits SIGNED_IN when loading storage. Verify outside its lock.
      setTimeout(() => {
        if (!active || revision !== eventRevision) return;
        supabase.auth.getUser(session.access_token).then(({ data, error }) => {
          if (revision === eventRevision) applySession(error || !data.user ? null : { ...session, user: data.user }, event);
        }).catch(() => { if (revision === eventRevision) applySession(null, event); });
      }, 0);
    });
    const initialRevision = revision;
    supabase.auth.getSession().then(async ({ data, error }) => {
      if (revision !== initialRevision || !active) return;
      if (error || !data.session) { applySession(null, 'RESTORE'); return; }
      // Verify restored browser data with Auth before rendering a private workspace.
      const verified = await supabase.auth.getUser();
      if (revision === initialRevision) applySession(verified.error || !verified.data.user ? null : { ...data.session, user: verified.data.user }, 'RESTORE');
    }).catch(() => { if (revision === initialRevision) applySession(null, 'RESTORE'); });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!notification) return;
    const timeout = setTimeout(() => setNotification(''), 6000);
    return () => clearTimeout(timeout);
  }, [notification]);

  useEffect(() => {
    const handleHistory = () => {
      const next = readRoute();
      setRoute(next);
      if (next.screen === 'pedro') setChatOpened(true);
    };
    window.addEventListener('hashchange', handleHistory);
    return () => window.removeEventListener('hashchange', handleHistory);
  }, []);

  useEffect(() => {
    document.title = screen === 'pedro' ? 'P.E.D.R.O | S.H.A.R.E' : 'S.H.A.R.E | Academic Resources';
  }, [screen]);

  const navigate = (next, data) => {
    if (!screens.has(next)) return;
    if (next === 'post-detail' && data) setSelectedPost(data);
    if (next === 'pedro') setChatOpened(true);
    const nextPostId = next === 'post-detail' ? data?.id || null : null;
    setRoute({ screen: next, postId: nextPostId });
    if (window.location.pathname !== '/') window.history.replaceState(null, '', '/');
    window.location.hash = `/${next}${nextPostId ? `/${encodeURIComponent(nextPostId)}` : ''}`;
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  const openPedro = post => {
    if (post && currentUser) setStudyPost({ ...post });
    navigate('pedro');
  };
  const login = message => {
    setAuth(previous => ({ ...previous, recovery: false }));
    setNotification(message || 'You are signed in.');
    navigate('home');
  };
  const logout = async () => {
    try {
      await signOut();
      setNotification('You are signed out.');
      navigate('login');
    } catch (error) { setNotification(error.message); }
  };
  const toggleFavorite = post => {
    setFavorites(previous => {
      const next = previous.some(item => item.id === post.id) ? previous.filter(item => item.id !== post.id) : [post, ...previous];
      writeDeviceValue(`share-favorites:${identity}`, JSON.stringify(next));
      return next;
    });
  };
  const selectPost = post => navigate('post-detail', post);

  let page;
  switch (screen) {
    case 'landing': page = <LandingPage onNavigate={navigate} />; break;
    case 'login': page = <Login onNavigate={navigate} onLoginSuccess={login} recoveryMode={auth.recovery} />; break;
    case 'signup': page = <SignUp onNavigate={navigate} onSignUpSuccess={login} />; break;
    case 'create-post': page = <CreatePost key={identity} currentUser={currentUser} onNavigate={navigate} onPostCreated={post => { setPosts(previous => [post, ...previous]); setNotification('Your resource was published.'); navigate('home'); }} />; break;
    case 'post-detail': page = <ResourceDetailPage key={postId || 'no-resource'} postId={postId}
      initialPost={selectedPost?.id === postId ? selectedPost : posts.find(post => post.id === postId) || favorites.find(post => post.id === postId) || null}
      currentUser={currentUser} onNavigate={navigate} onNavigateToPedro={openPedro}
      isFavorite={favorites.some(item => item.id === postId)} onToggleFavorite={toggleFavorite} />; break;
    case 'settings': page = <Settings key={identity} currentUser={currentUser} onNavigate={navigate} onLogout={logout} />; break;
    case 'favorites': page = <Favorites favorites={favorites} onNavigate={navigate} onSelectPost={selectPost} />; break;
    case 'pedro': page = null; break;
    case 'home': page = <HomePage currentUser={currentUser} posts={posts} setPosts={setPosts} onNavigate={navigate} onSelectPost={selectPost} onNavigateToPedro={openPedro} />; break;
    default: page = <main className="app-route-message"><h1>Page not found</h1><p>This page does not exist.</p><button onClick={() => navigate('home')}>Back to Home</button></main>;
  }

  const protectedScreen = screen === 'create-post' || screen === 'pedro';
  const showChat = screen === 'pedro' && !!currentUser && auth.ready;
  if (protectedScreen && !auth.ready) page = <main className="app-route-message" role="status">Checking your session…</main>;
  else if (protectedScreen && !currentUser) page = <main className="app-route-message"><h1>Sign in required</h1><p>Sign in to share resources and use P.E.D.R.O.</p><button onClick={() => navigate('login')}>Log In</button><button onClick={() => navigate('home')}>Back to Home</button></main>;

  return <>
    {notification && <p className="app-status" role="status">{notification}</p>}
    <div className="core-module" hidden={showChat}>{page}</div>
    {(chatOpened || showChat) && currentUser && <div hidden={!showChat}><Suspense fallback={<main className="app-route-message" role="status">Opening P.E.D.R.O…</main>}><Chatbot key={identity} currentUser={currentUser} onBack={() => navigate('home')} studyPost={studyPost} isActive={showChat} /></Suspense></div>}
  </>;
}
