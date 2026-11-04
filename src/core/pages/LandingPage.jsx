import { useRef, useState, useEffect } from 'react';
import { ArrowRight, BookOpen, MessageCircle, Share2 } from 'lucide-react';
import './LandingPage.css';
import botLogo from '../assets/share_logo_transparent.png';

export default function LandingPage({ onNavigate, currentUser }) {
  const [, setProgress] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const startY = useRef(null);
  const taglineRef = useRef(null);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    const root = taglineRef.current;
    if (!root || typeof IntersectionObserver === 'undefined') return undefined;
    const words = root.querySelectorAll('[data-tagline-word]');
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.5 });
    words.forEach(word => observer.observe(word));
    return () => observer.disconnect();
  }, []);
  const continueToHome = () => {
    if (leaving) return;
    setLeaving(true);
    timer.current = setTimeout(() => onNavigate?.(currentUser ? 'home' : 'login'), 400);
  };
  const continueToSignup = () => {
    if (leaving) return;
    setLeaving(true);
    timer.current = setTimeout(() => onNavigate?.(currentUser ? 'home' : 'signup'), 400);
  };
  return (
    <main className={`landing-root ${leaving ? 'landing-exit' : ''}`}
      onPointerDown={event => { startY.current = event.clientY; event.currentTarget.setPointerCapture(event.pointerId); }}
      onPointerMove={event => { if (startY.current !== null) setProgress(Math.max(0, Math.min(1, (startY.current - event.clientY) / 120))); }}
      onPointerUp={event => { if (startY.current !== null && startY.current - event.clientY >= 120) continueToHome(); else setProgress(0); startY.current = null; }}
      onPointerCancel={() => { startY.current = null; setProgress(0); }}>
      <nav className="landing-nav"><span className="landing-nav-brand">S.H.A.R.E.</span><div className="landing-nav-actions"><button type="button" onClick={continueToHome}>{currentUser ? 'Go to home' : 'Log in'} <ArrowRight size={16} /></button>{!currentUser && <button type="button" className="landing-nav-signup" onClick={continueToSignup}>Sign up</button>}</div></nav>
      <section className="landing-hero">
        <div className="landing-hero-copy"><p className="landing-eyebrow">Your academic network</p><h1>Find the resources you need.<br />Share what helps.</h1><p className="landing-subtitle">S.H.A.R.E. gives students and instructors one simple place to discover notes, share learning materials, and get help when they are stuck.</p><div className="landing-hero-actions"><button type="button" className="landing-continue" onClick={continueToSignup} onPointerDown={event => event.stopPropagation()}>{currentUser ? 'Go to home' : 'Sign up'} <ArrowRight size={18} /></button>{!currentUser && <button type="button" className="landing-secondary" onClick={continueToHome} onPointerDown={event => event.stopPropagation()}>Log in</button>}</div><p className="landing-proof">Stop guessing who has the notes. Search, share, and study together.</p></div>
        <div className="landing-hero-art"><div className="landing-logo-wrap"><img src={botLogo} alt="S.H.A.R.E mascot" className="landing-logo-img" draggable="false" /></div></div>
      </section>
      <section className="landing-benefits"><p className="landing-eyebrow">Built for the way students learn</p><div className="landing-benefit-grid"><article><BookOpen size={24} /><h2>Keep resources together</h2><p>Organize notes, files, and study material in one calm place.</p></article><article><MessageCircle size={24} /><h2>Ask when you are stuck</h2><p>Bring P.E.D.R.O. into the conversation with useful context.</p></article><article><Share2 size={24} /><h2>Learn with your people</h2><p>Share discoveries and make progress visible to your community.</p></article></div></section>
      <section className="landing-showcase"><div><p className="landing-eyebrow">See S.H.A.R.E. in motion</p><h2>Everything you need for the next study session.</h2><p>Browse shared resources, open a post, and bring the right context into your conversation with P.E.D.R.O.</p></div><div className="landing-product-card"><div className="landing-product-top"><span>S.H.A.R.E.</span><span>Search resources</span><span>⌕</span></div><div className="landing-product-body"><aside><strong>Subjects</strong><span>All resources</span><span>Data structures</span><span>Operating systems</span></aside><div className="landing-product-feed"><article><small>Prince · DSA</small><h3>Review notes for linked lists</h3><p>Shared study material and a question for the group.</p><div className="landing-product-actions"><span>♡ 12</span><span>Comment 4</span><span>Ask P.E.D.R.O.</span></div></article><article><small>HEHE · General</small><h3>Laboratory guide</h3><p>Open the document and continue where you left off.</p></article></div></div></div></section>
      <section className="landing-tagline"><p ref={taglineRef}>{['Good', 'study', 'habits', 'grow', 'faster'].map((word, index) => <span key={word} data-tagline-word style={{ transitionDelay: `${index * 70}ms` }}>{word} </span>)}<br />{['when', 'learning', 'is', 'shared.'].map((word, index) => <span key={word} data-tagline-word style={{ transitionDelay: `${(index + 5) * 70}ms` }}>{word} </span>)}</p></section>
      <section className="landing-steps"><p className="landing-eyebrow">How it works</p><div><span>01</span><h2>Find your focus</h2><p>Search by subject, topic, or the resource you need next.</p></div><div><span>02</span><h2>Share what helps</h2><p>Post notes, images, and documents for your classmates.</p></div><div><span>03</span><h2>Keep moving</h2><p>Save conversations, revisit ideas, and study with momentum.</p></div></section>
      <section className="landing-faq"><p className="landing-eyebrow">FAQ</p><details><summary onPointerDown={event => event.stopPropagation()}>Who is S.H.A.R.E. for?</summary><p>Students and instructors who want a simpler way to find and share academic resources.</p></details><details><summary onPointerDown={event => event.stopPropagation()}>What can I share?</summary><p>You can share notes, documents, images, and other study materials supported by the platform.</p></details><details><summary onPointerDown={event => event.stopPropagation()}>What does P.E.D.R.O. do?</summary><p>P.E.D.R.O. helps you study by answering questions with context from your conversations and shared posts.</p></details></section>
      <section className="landing-final"><h2>Ready to make your next study session count?</h2><button type="button" className="landing-continue" onClick={continueToHome}>{currentUser ? 'Go to home' : 'Enter S.H.A.R.E'} <ArrowRight size={18} /></button></section>
    </main>
  );
}
