import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { FiLock, FiMail, FiShield, FiTrendingUp } from 'react-icons/fi';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('overall@facpyros.in');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
      navigate('/');
    } catch (err: any) {
      if (!err.response || err.message === 'Network Error') {
        setError('Cannot connect to backend API server. Please verify backend is running & reachable.');
      } else {
        setError(err.response?.data?.error || 'Login failed. Please check your credentials.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleQuickSelect = (roleEmail: string) => {
    setEmail(roleEmail);
    setPassword('admin123');
    setError('');
  };

  return (
    <div className="login-page">
      <div className="login-card animate-slide-in">
        <img src="/pyros-logo.png" alt="FAC PYROS" className="login-card__logo" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
        <h1 className="login-card__title">FAC PYROS</h1>
        <p className="login-card__subtitle">Registration & Financial Analytics Dashboard</p>

        {/* Quick Role Selection Tabs */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '20px' }}>
          <button
            type="button"
            className={`btn btn--sm ${email.includes('overall') || email.includes('admin') ? 'btn--primary' : 'btn--ghost'}`}
            style={{ fontSize: '0.75rem', padding: '8px 4px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}
            onClick={() => handleQuickSelect('overall@facpyros.in')}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 'bold' }}>
              <FiShield /> Overall Login
            </span>
            <span style={{ fontSize: '0.65rem', opacity: 0.8 }}>Full Revenue & Expenses</span>
          </button>

          <button
            type="button"
            className={`btn btn--sm ${email.includes('analyst') ? 'btn--primary' : 'btn--ghost'}`}
            style={{ fontSize: '0.75rem', padding: '8px 4px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}
            onClick={() => handleQuickSelect('analyst@facpyros.in')}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 'bold' }}>
              <FiTrendingUp /> Analyst Login
            </span>
            <span style={{ fontSize: '0.65rem', opacity: 0.8 }}>Registrations Only</span>
          </button>
        </div>

        {error && (
          <div className="alert-item alert-item--danger" style={{ marginBottom: '24px', justifyContent: 'center' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-group__label">Email Address</label>
            <div style={{ position: 'relative' }}>
              <FiMail style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', left: '16px', color: '#808080' }} />
              <input
                type="email"
                className="form-group__input"
                style={{ paddingLeft: '48px' }}
                placeholder="overall@facpyros.in"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: '32px' }}>
            <label className="form-group__label">Password</label>
            <div style={{ position: 'relative' }}>
              <FiLock style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', left: '16px', color: '#808080' }} />
              <input
                type="password"
                className="form-group__input"
                style={{ paddingLeft: '48px' }}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </div>

          <button
            type="submit"
            className="btn btn--primary btn--lg"
            style={{ width: '100%', justifyContent: 'center' }}
            disabled={loading}
          >
            {loading ? 'Authenticating...' : 'Secure Login'}
          </button>
        </form>

        <p style={{ marginTop: '24px', fontSize: '0.78rem', color: '#707070', textAlign: 'center' }}>
          Overall login accesses Gross Revenue & Expenses. General analyst login accesses attendee metrics.
        </p>
      </div>
    </div>
  );
}
