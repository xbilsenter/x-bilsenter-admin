import { useState, useEffect, useCallback } from 'react';
import { login, getPublicStatus } from '../api.js';

const STATUS_POLL_MS = 15000;

function formatStatusTid(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('nb-NO', {
    timeZone: 'Europe/Oslo',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function LoginBackendStatus() {
  const [status, setStatus] = useState(null);
  const [feil, setFeil] = useState('');

  const oppdater = useCallback(async function () {
    try {
      const res = await getPublicStatus();
      setStatus(res.status || null);
      setFeil('');
    } catch (err) {
      setFeil(err.message || 'Backend utilgjengelig');
      setStatus(null);
    }
  }, []);

  useEffect(function () {
    oppdater();
    const id = setInterval(oppdater, STATUS_POLL_MS);
    return function () { clearInterval(id); };
  }, [oppdater]);

  const overall = status?.overall || (feil ? 'feil' : 'ukjent');
  const dotClass = overall === 'ok' ? 'live' : overall === 'feil' ? 'nede' : 'vedlikehold';
  const backendLabel = overall === 'ok' ? 'Backend operativ' : overall === 'feil' ? 'Backend feil' : 'Sjekker backend…';
  const dbLabel = status?.database === 'ok' ? 'Database OK' : status?.database === 'feil' ? 'Database feil' : 'Database —';
  const nettMeta = {
    live: 'Nettside live',
    vedlikehold: 'Nettside vedlikehold',
    nede: 'Nettside nede'
  };
  const nettLabel = status?.nettside ? (nettMeta[status.nettside.status] || 'Nettside —') : null;

  return (
    <div className="login-status" aria-live="polite">
      <span className={`drift-dot drift-dot--${dotClass} is-pulse`} />
      <span>{backendLabel}</span>
      <span className="login-status__sep">·</span>
      <span>{dbLabel}</span>
      {status?.responseMs != null && (
        <>
          <span className="login-status__sep">·</span>
          <span>{status.responseMs} ms</span>
        </>
      )}
      {nettLabel && (
        <>
          <span className="login-status__sep">·</span>
          <span>{nettLabel}</span>
        </>
      )}
      {status?.checkedAt && (
        <>
          <span className="login-status__sep">·</span>
          <span>Oppdatert {formatStatusTid(status.checkedAt)}</span>
        </>
      )}
      {feil && !status && (
        <>
          <span className="login-status__sep">·</span>
          <span className="login-status__err">{feil}</span>
        </>
      )}
    </div>
  );
}

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
        <div className="login-tagline">Internt driftssystem</div>

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
      <LoginBackendStatus />
    </div>
  );
}
