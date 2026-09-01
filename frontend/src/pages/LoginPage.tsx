import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { FiLock, FiMail } from 'react-icons/fi';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
      setError(err.response?.data?.error || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card animate-slide-in">
        <img src="/pyros-logo.png" alt="FAC PYROS" className="login-card__logo" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
        <h1 className="login-card__title">FAC PYROS</h1>
        <p className="login-card__subtitle">Registration Analytics Dashboard</p>

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
                placeholder="admin@facpyros.in"
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

        <p style={{ marginTop: '32px', fontSize: '0.8rem', color: '#505050' }}>
          Authorized personnel only. All access is logged.
        </p>
      </div>
    </div>
  );
}
