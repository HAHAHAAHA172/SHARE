import { useRef, useState, useEffect } from 'react';
import { ChevronUp } from 'lucide-react';
import './LandingPage.css';
import botLogo from '../assets/share_logo1.png';

export default function LandingPage({ onNavigate }) {
  const [progress, setProgress] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const startY = useRef(null);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const continueToLogin = () => {
    if (leaving) return;
    setLeaving(true);
    timer.current = setTimeout(() => onNavigate?.('login'), 400);
  };
  return (
    <main className={`landing-root ${leaving ? 'landing-exit' : ''}`}
      onPointerDown={event => { startY.current = event.clientY; event.currentTarget.setPointerCapture(event.pointerId); }}
      onPointerMove={event => { if (startY.current !== null) setProgress(Math.max(0, Math.min(1, (startY.current - event.clientY) / 120))); }}
      onPointerUp={event => { if (startY.current !== null && startY.current - event.clientY >= 120) continueToLogin(); else setProgress(0); startY.current = null; }}
      onPointerCancel={() => { startY.current = null; setProgress(0); }}>
      <div className="landing-bg" />
      <div className="landing-center" style={{ transform: `translateY(${-progress * 60}px)` }}>
        <div className="landing-logo-wrap"><img src={botLogo} alt="S.H.A.R.E mascot" className="landing-logo-img" draggable="false" /></div>
        <h1 className="landing-brand">SHARE</h1>
      </div>
      <div className="landing-hint hint-visible">
        <div className="landing-chevrons" aria-hidden="true"><ChevronUp className="lc lc1" /><ChevronUp className="lc lc2" /></div>
        <button type="button" className="landing-continue" onClick={continueToLogin} onPointerDown={event => event.stopPropagation()}>Continue to S.H.A.R.E</button>
        <p className="landing-hint-text">Or swipe up to continue</p>
      </div>
    </main>
  );
}
