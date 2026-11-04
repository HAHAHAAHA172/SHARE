import { useEffect, useState } from 'react';
import './Settings.css';
import { ArrowLeft, Bell, UserX, Star, LogOut, ChevronRight, User } from 'lucide-react';
import { readDeviceValue, writeDeviceValue } from '../../security/client/auth.js';
import { apiFetch } from '../../shared/api.js';

export default function Settings({ onNavigate, currentUser, onLogout }) {
  const [anonymous, setAnonymous] = useState(false);
  const [notices, setNotices] = useState(() => readDeviceValue('share-welcome-notices') !== 'false');
  const [message, setMessage] = useState('');
  const [profile, setProfile] = useState(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [draft, setDraft] = useState({ user_name: '', full_name: '', role: 'student', avatar_url: '', year_level: '', course_id: '' });
  const [courses, setCourses] = useState([]);

  useEffect(() => {
    if (!currentUser) return;
    apiFetch('/api/profile').then(response => response.json().then(result => {
      if (!response.ok) throw new Error(result.error || 'Could not load your profile.');
      setProfile(result.profile);
      setDraft({ user_name: result.profile.user_name || '', full_name: result.profile.full_name || '', role: result.profile.role || 'student', avatar_url: result.profile.avatar_url || '', year_level: result.profile.year_level || '', course_id: result.profile.course_id || '' });
    })).catch(error => setProfileError(error.message));
    apiFetch('/api/profile/courses').then(response => response.json()).then(result => { if (result.courses) setCourses(result.courses); }).catch(() => {});
  }, [currentUser]);

  const userName = profile?.full_name || profile?.user_name || currentUser?.name || 'Guest';
  const userEmail = anonymous ? 'Email hidden in this view' : (currentUser?.email || 'Sign in to access your account');

  const handleLogout = () => {
    if (onLogout) onLogout();
    else if (onNavigate) onNavigate('login');
  };

  const saveProfile = async event => {
    event.preventDefault(); setSaving(true); setProfileError('');
    try {
      const response = await apiFetch('/api/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not save your profile.');
      setProfile(result.profile); setEditing(false); setMessage('Profile updated successfully.');
    } catch (error) { setProfileError(error.message); } finally { setSaving(false); }
  };
  const uploadAvatar = async event => {
    const file = event.target.files?.[0]; if (!file) return;
    setUploadingAvatar(true); setProfileError('');
    try {
      const body = new FormData(); body.append('avatar', file);
      const response = await apiFetch('/api/profile/avatar', { method: 'POST', body });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Could not upload avatar.');
      setProfile(result.profile); setDraft(previous => ({ ...previous, avatar_url: result.profile.avatar_url || '' })); setMessage('Profile photo updated.');
    } catch (error) { setProfileError(error.message); } finally { setUploadingAvatar(false); event.target.value = ''; }
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
          <div className="settings-profile-card">
            <div className="settings-avatar">
              {profile?.avatar_url ? <img src={profile.avatar_url} alt="" /> : <User size={28} color="#9A89C6" strokeWidth={2} />}
            </div>
            <div className="settings-profile-info">
              <span className="settings-profile-name">{userName}</span>
              <span className="settings-profile-email">{userEmail}</span>
            </div>
            <button type="button" className="settings-edit-profile" onClick={() => setEditing(value => !value)}>{editing ? 'Cancel' : 'Edit'}</button>
          </div>
          {profileError && <p className="core-message" role="alert">{profileError}</p>}
          {editing && <form className="settings-profile-form" onSubmit={saveProfile}>
            <label>Username<input value={draft.user_name} onChange={event => setDraft({ ...draft, user_name: event.target.value })} required maxLength={40} /></label>
            <label>Full name<input value={draft.full_name} onChange={event => setDraft({ ...draft, full_name: event.target.value })} required maxLength={100} /></label>
            <label>Role<select value={draft.role} onChange={event => setDraft({ ...draft, role: event.target.value })}><option value="student">Student</option><option value="instructor">Instructor</option></select></label>
            <label>Year level<select value={draft.year_level} onChange={event => setDraft({ ...draft, year_level: event.target.value })} required><option value="">Select year level</option><option value="1st year">1st year</option><option value="2nd year">2nd year</option><option value="3rd year">3rd year</option><option value="4th year">4th year</option></select></label>
            <label>Course<select value={draft.course_id} onChange={event => setDraft({ ...draft, course_id: event.target.value })} required><option value="">Select course</option>{courses.map(course => <option key={course.course_id} value={course.course_id}>{course.course_name}</option>)}</select></label>
            <label>Profile photo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadAvatar} disabled={uploadingAvatar} /> <small>{uploadingAvatar ? 'Uploading…' : 'JPG, PNG, or WebP up to 5 MB'}</small></label>
            <button className="settings-save-profile" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save profile'}</button>
          </form>}

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
            {profile?.role === 'admin' && <button className="settings-row" onClick={() => onNavigate?.('admin')}>
              <div className="settings-row-left"><span>Post moderation</span></div><ChevronRight size={18} color="#888" strokeWidth={2} />
            </button>}
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

