import { useState } from 'react';
import './SignUp.css';
import botLogo from '../assets/share_logo1.png';
import { ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { signUp } from '../../security/client/auth.js';

export default function SignUp({ onNavigate, onSignUpSuccess }) {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignUp = async (e) => {
    e.preventDefault();
    if (loading) return;
    setErrorMessage('');
    setSuccessMessage('');
    if (!username.trim() || !email.trim() || !password || !confirmPassword) {
      setErrorMessage('Please fill in all fields.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }

    if (password.length < 10 || password.length > 128) { setErrorMessage('Use a password between 10 and 128 characters.'); return; }
    setLoading(true);
    try {
      const result = await signUp(username.trim(), email.trim(), password);
      setPassword('');
      setConfirmPassword('');
      if (result.session) onSignUpSuccess?.();
      else setSuccessMessage(result.message);
    } catch (error) { setErrorMessage(error.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="signup-screen-wrapper">
      <div className="signup-card-container">
        {/* Top Purple Ambient Brand Area */}
        <div className="signup-brand-header">
          <div className="signup-mascot-circle">
            <img src={botLogo} alt="S.H.A.R.E Mascot" className="signup-bot-logo" />
          </div>
          <h2 className="signup-brand-title">S.H.A.R.E</h2>
        </div>

        {/* Deep Slate-Blue Main Card */}
        <div className="signup-slate-card">
          {/* Back to Log In Button */}
          <button
            type="button"
            className="signup-back-row"
            onClick={() => onNavigate && onNavigate('login')}
          >
            <ArrowLeft size={18} color="#FFFFFF" />
            <span>Back to Log In</span>
          </button>

          <h1 className="signup-heading">Sign Up</h1>

          {errorMessage && (
            <div className="signup-error-box" role="alert">{errorMessage}</div>
          )}
          {successMessage && <p className="core-message" role="status">{successMessage}</p>}

          <form onSubmit={handleSignUp} className="signup-form">
            {/* Username Field */}
            <div className="signup-input-box">
              <label className="signup-input-label" htmlFor="su-username">Username</label>
              <input
                id="su-username"
                type="text"
                autoComplete="nickname"
                maxLength={80}
                placeholder="e.g. Mefonzie"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="signup-input-field"
                required
              />
            </div>

            {/* Email Field */}
            <div className="signup-input-box">
              <label className="signup-input-label" htmlFor="su-email">Email</label>
              <input
                id="su-email"
                type="email"
                autoComplete="email"
                maxLength={254}
                placeholder="name@university.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="signup-input-field"
                required
              />
            </div>

            {/* Password Field */}
            <div className="signup-input-box">
              <div className="signup-label-row">
                <label className="signup-input-label" htmlFor="su-password">Password</label>
                <button
                  type="button"
                  className="signup-pw-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide passwords' : 'Show passwords'}
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              <input
                id="su-password"
                autoComplete="new-password"
                minLength={10}
                maxLength={128}
                type={showPassword ? 'text' : 'password'}
                placeholder="Create a strong password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="signup-input-field"
                required
              />
            </div>

            {/* Confirm Password Field */}
            <div className="signup-input-box">
              <label className="signup-input-label" htmlFor="su-confirm-password">Confirm password</label>
              <input
                id="su-confirm-password"
                autoComplete="new-password"
                minLength={10}
                maxLength={128}
                type={showPassword ? 'text' : 'password'}
                placeholder="Repeat password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="signup-input-field"
                required
              />
            </div>

            {/* Sign Up Action Button */}
            <button type="submit" className="signup-submit-btn" disabled={loading}>
              {loading ? 'Creating account…' : 'Sign Up'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
