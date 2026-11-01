import { useState } from 'react';
import './Settings.css';
import { ArrowLeft, Bell, UserX, Star, LogOut, ChevronRight, User } from 'lucide-react';
import { readDeviceValue, writeDeviceValue } from '../../security/client/auth.js';

export default function Settings({ onNavigate, currentUser, onLogout }) {
  const [anonymous, setAnonymous] = useState(false);
  const [notices, setNotices] = useState(() => readDeviceValue('share-welcome-notices') !== 'false');
  const [message, setMessage] = useState('');

  const userName = currentUser?.name || 'Guest';
  const userEmail = anonymous ? 'Email hidden in this view' : (currentUser?.email || 'Sign in to access your account');

  const handleLogout = () => {
    if (onLogout) onLogout();
    else if (onNavigate) onNavigate('login');
  };

  return (
    <div className="settings-screen">
      <div className="settings-container">

        {/* ── Header ── */}
        <header className="settings-header">
          <button
            className="settings-back-btn"
            onClick={() => onNavigate && onNavigate('home')}
            title="Go back"
            aria-label="Back"
          >
            <ArrowLeft size={22} color="#ffffff" strokeWidth={2.2} />
          </button>
          <h1 className="settings-title">Settings</h1>
          <div className="settings-header-spacer" />
        </header>

        {/* ── Body ── */}
        <div className="settings-body">
          {message && <p className="core-message" role="status">{message}</p>}

          {/* ── Profile Card ── */}
          <button
            className="settings-profile-card"
            onClick={() => onNavigate && onNavigate('home')}
          >
            <div className="settings-avatar">
              <User size={28} color="#9A89C6" strokeWidth={2} />
            </div>
            <div className="settings-profile-info">
              <span className="settings-profile-name">{userName}</span>
              <span className="settings-profile-email">{userEmail}</span>
            </div>
            <ChevronRight size={20} color="#888" strokeWidth={2} />
          </button>

          {/* ── Preferences Group ── */}
          <div className="settings-group">
            <button className="settings-row" aria-pressed={notices} onClick={() => { const next = !notices; setNotices(next); writeDeviceValue('share-welcome-notices', String(next)); setMessage(next ? 'Welcome notices enabled on this device.' : 'Welcome notices disabled on this device.'); }}>
              <div className="settings-row-left">
                <Bell size={20} color="#ffffff" strokeWidth={1.8} />
                <span>Welcome notices: {notices ? 'On' : 'Off'}</span>
              </div>
              <ChevronRight size={18} color="#888" strokeWidth={2} />
            </button>

          </div>

          {/* ── Account Group ── */}
          <div className="settings-group">
            {/* Anonymous toggle */}
            <div className="settings-row">
              <div className="settings-row-left">
                <UserX size={20} color="#ffffff" strokeWidth={1.8} />
                <span>Hide profile email</span>
              </div>
              <button
                className={`settings-toggle ${anonymous ? 'toggle-on' : 'toggle-off'}`}
                onClick={() => setAnonymous(!anonymous)}
                role="switch"
                aria-checked={anonymous}
                aria-label="Hide profile email in this view"
              >
                <span className="toggle-thumb" />
              </button>
            </div>

            <div className="settings-divider" />

            <button
              className="settings-row"
              onClick={() => onNavigate && onNavigate('favorites')}
            >
              <div className="settings-row-left">
                <Star size={20} color="#ffffff" strokeWidth={1.8} />
                <span>Favorites</span>
              </div>
              <ChevronRight size={18} color="#888" strokeWidth={2} />
            </button>
          </div>

          {/* ── Log Out ── */}
          <button className="settings-logout-btn" onClick={currentUser ? handleLogout : () => onNavigate?.('login')}>
            <LogOut size={20} color="#e05252" strokeWidth={2} />
            <span>{currentUser ? 'Log Out' : 'Log In'}</span>
          </button>

        </div>
      </div>
    </div>
  );
}

