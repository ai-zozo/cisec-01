import React, { useState } from 'react';
import api from '../api';

export default function Login({ onLogin }) {
  const [username, setU] = useState('');
  const [password, setP] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const { data } = await api.post('/auth/login', { username, password });
      localStorage.setItem('token', data.token);
      onLogin(data.user);
    } catch (e) {
      setErr(e.response?.data?.error || 'שגיאת התחברות');
    } finally { setBusy(false); }
  };

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit} style={{ textAlign: 'center' }}>
        <h1>Ci-Sec</h1>
        <p style={{ fontWeight: 600 }}>תמונת מצב — אבטחת המידע בארגון</p>
        <div className="field">
          <label>שם משתמש</label>
          <input value={username} onChange={(e) => setU(e.target.value)} autoFocus />
        </div>
        <div className="field">
          <label>סיסמה</label>
          <input type="password" value={password} onChange={(e) => setP(e.target.value)} />
        </div>
        {err && <div className="err">{err}</div>}
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'מתחבר…' : 'כניסה'}</button>
      </form>
    </div>
  );
}
