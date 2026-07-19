import { useState } from 'react';
import { login } from '../api.js';

export default function Login({ onSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await login(username, password);
      onSuccess(data.user);
    } catch (err) {
      setError(err.message || 'Innlogging feilet.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-logo">X <em>Bilsenter AS</em></div>
        <div className="login-tagline">CRM · Fetsund</div>
        <p className="login-hint">Lokal utvikling: brukernavn <strong>admin</strong> · passord <strong>admin123</strong></p>

        {error && <div className="login-err">{error}</div>}

        <div className="gap">
          <div className="fl">Brukernavn</div>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />
        </div>
        <div className="gap">
          <div className="fl">Passord</div>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>
        <div className="modal-footer" style={{ border: 'none', paddingTop: 20, marginTop: 6 }}>
          <button className="btn btn-p" type="submit" disabled={loading} style={{ width: '100%', justifyContent: 'center' }}>
            {loading ? 'Logger inn…' : 'Logg inn'}
          </button>
        </div>
      </form>
    </div>
  );
}
