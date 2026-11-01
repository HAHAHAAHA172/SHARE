import { useState } from 'react';
import './Login.css';
import botLogo from '../assets/share_logo1.png';
import { Eye, EyeOff, ArrowLeft } from 'lucide-react';
import { signIn, recoverPassword, updatePassword } from '../../security/client/auth.js';

export default function Login({ onNavigate, onLoginSuccess, recoveryMode = false }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    if ((!recoveryMode && !email.trim()) || !password) {
      setErrorMessage('Please enter both email and password.');
      return;
    }

    setErrorMessage('');
    setSuccessMessage('');
    setLoading(true);
    try {
      if (recoveryMode) await updatePassword(password);
      else await signIn(email.trim(), password, rememberMe);
      setPassword('');
      onLoginSuccess?.(recoveryMode ? 'Your password was updated.' : undefined);
    } catch (error) { setErrorMessage(error.message); }
    finally { setLoading(false); }
  };

  const handleRecover = async () => {
    if (loading) return;
    setErrorMessage('');
    setSuccessMessage('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setErrorMessage('Enter your email above to request a reset link.'); return; }
    setLoading(true);
    try { const result = await recoverPassword(email.trim()); setSuccessMessage(result.message); }
    catch (error) { setErrorMessage(error.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="login-screen-wrapper">
      <div className="login-card-container">
        {/* Top Purple Gradient Header with Logo */}
        <div className="login-hero-header">
          {onNavigate && (
            <button
              type="button"
              className="login-top-back-btn"
              onClick={() => onNavigate('home')}
              title="Back to Home"
            >
              <ArrowLeft size={20} color="#FFFFFF" />
            </button>
          )}

          <div className="login-brand-group">
            <div className="login-logo-circle">
              <img src={botLogo} alt="S.H.A.R.E Mascot" className="login-bot-logo" />
            </div>
            <h2 className="login-brand-name">S.H.A.R.E</h2>
          </div>
        </div>

        {/* Dark Curved Body */}
        <div className="login-dark-body">
          <h1 className="login-title">{recoveryMode ? 'Reset Password' : 'Log In'}</h1>

          {errorMessage && (
            <div className="login-error-banner" role="alert">{errorMessage}</div>
          )}
          {successMessage && <p className="core-message" role="status">{successMessage}</p>}

          <form onSubmit={handleSubmit} className="login-form">
            {/* Email Field Card */}
            {!recoveryMode && <div className="login-input-card">
              <label className="login-input-label" htmlFor="login-email">Email</label>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                maxLength={254}
                placeholder="name@university.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="login-input-field"
                required
              />
            </div>}

            {/* Password Field Card */}
            <div className="login-input-card">
              <div className="login-password-header">
                <label className="login-input-label" htmlFor="login-password">{recoveryMode ? 'New password' : 'Password'}</label>
                <button
                  type="button"
                  className="login-toggle-pw"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete={recoveryMode ? 'new-password' : 'current-password'}
                minLength={recoveryMode ? 10 : 1}
                maxLength={128}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="login-input-field"
                required
              />
            </div>

            {/* Remember Me & Forgot Password Row */}
            {!recoveryMode && <div className="login-options-row">
              <label className="login-remember-toggle">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="login-checkbox"
                />
                <span>Remember me</span>
              </label>

              <span className="login-options-divider">|</span>

              <button
                type="button"
                className="login-forgot-btn"
                onClick={handleRecover}
                disabled={loading}
              >
                Forgot password?
              </button>
            </div>}

            {/* Log In Button */}
            <button type="submit" className="login-submit-btn" disabled={loading}>
              {loading ? 'Please wait…' : recoveryMode ? 'Update Password' : 'Log In'}
            </button>

            {/* Bottom Sign Up Link */}
            <div className="login-footer-row">
              <span>Don't have an account? </span>
              <button
                type="button"
                className="login-signup-link"
                onClick={() => onNavigate && onNavigate('signup')}
              >
                Sign Up
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
