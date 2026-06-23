import React, { useEffect, useState } from 'react';
import api from '../api';

function Shell({ title, onClose, children, wide }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ width: wide ? 'min(760px,95vw)' : 'min(460px,95vw)' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><h2>{title}</h2><button className="icon-btn" onClick={onClose}>✕</button></div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function NewSurveyDialog({ onClose, onCreated, fixedNetworkId }) {
  const [networks, setNetworks] = useState([]);
  const [networkId, setNetworkId] = useState(fixedNetworkId || '');
  const [name, setName] = useState('');
  const [scope, setScope] = useState('expanded');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get('/networks').then((r) => { setNetworks(r.data); if (!fixedNetworkId && r.data[0]) setNetworkId(r.data[0].id); }); }, []);

  const create = async () => {
    setErr(''); setBusy(true);
    try { const { data } = await api.post('/surveys', { networkId, name, scope }); onCreated(data); }
    catch (e) { setErr(e.response?.data?.error || 'שגיאה'); } finally { setBusy(false); }
  };
  return (
    <Shell title="צור סקר חדש" onClose={onClose}>
      <div className="field"><label>רשת</label>
        <select value={networkId} disabled={!!fixedNetworkId} onChange={(e) => setNetworkId(e.target.value)}>
          {networks.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
        </select>
      </div>
      <div className="field"><label>שם הסקר</label><input value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div className="field"><label>סוג הסקר</label>
        <select value={scope} onChange={(e) => setScope(e.target.value)}>
          <option value="reduced">מצומצם — רשימת בקרות עיקריות (72 בקרות)</option>
          <option value="expanded">מורחב — כל בקרות תורת ההגנה 2.0</option>
        </select>
      </div>
      {err && <div className="err">{err}</div>}
      <p className="muted">הסקר יאוכלס אוטומטית במשפחות ובבקרות בהתאם לסוג שנבחר.</p>
      <button className="btn btn-primary btn-block" disabled={busy || !name || !networkId} onClick={create}>{busy ? 'יוצר ומאכלס…' : 'צור'}</button>
    </Shell>
  );
}

export function LoadSurveyDialog({ onClose, onPick, currentUser, currentSurveyId, flash }) {
  const [surveys, setSurveys] = useState([]);
  const load = () => api.get('/surveys').then((r) => setSurveys(r.data));
  useEffect(() => { load(); }, []);
  const isAdmin = currentUser?.role === 'admin';
  const canDelete = (s) => isAdmin || (s.createdBy && s.createdBy === currentUser?.username);
  const del = async (s) => {
    if (!confirm(`האם למחוק את הסקר "${s.name}" (גרסה ${s.version}) לצמיתות?\nפעולה זו תמחק את כל הבקרות, המשימות, המיטיגציה והנתונים שתחת הסקר ואינה ניתנת לביטול.`)) return;
    try {
      await api.delete(`/surveys/${s.id}`);
      if (flash) flash('הסקר נמחק');
      await load();
    } catch (e) {
      alert(e.response?.data?.error || 'שגיאה במחיקה');
    }
  };
  return (
    <Shell title="טען סקר" onClose={onClose} wide>
      <table className="tbl">
        <thead><tr><th>רשת</th><th>שם</th><th>גרסה</th><th>תיאור</th><th>נוצר ע״י</th><th>בקרות</th><th></th></tr></thead>
        <tbody>
          {surveys.map((s) => (
            <tr key={s.id} style={s.id === currentSurveyId ? { background: 'var(--brand-soft)' } : undefined}>
              <td>{s.network?.name}</td>
              <td>{s.name}</td>
              <td>{s.version}</td>
              <td style={{ maxWidth: 220, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={s.description || ''}>{s.description || '—'}</td>
              <td>{s.createdBy || '—'}</td>
              <td>{s._count?.controls}</td>
              <td className="flex" style={{ gap: 6 }}>
                <button className="btn btn-primary" onClick={() => onPick(s.id)}>טען</button>
                {canDelete(s) && <button className="btn" title="מחיקת גרסה" onClick={() => del(s)} style={{ color: 'var(--critical)' }}>🗑</button>}
              </td>
            </tr>
          ))}
          {!surveys.length && <tr><td colSpan={7} className="muted">אין סקרים</td></tr>}
        </tbody>
      </table>
      <p className="muted" style={{ marginTop: 8 }}>אדמין רשאי למחוק כל גרסה. משתמש אחר רשאי למחוק רק גרסה שיצר.</p>
    </Shell>
  );
}

// דיאלוג ליצירת גרסה — עם שדה תיאור גרסה
export function CreateVersionDialog({ onClose, onCreated, sourceName, sourceVersion }) {
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async () => {
    setErr(''); setBusy(true);
    try { await onCreated(description.trim() || null); }
    catch (e) { setErr(e?.response?.data?.error || 'שגיאה'); }
    finally { setBusy(false); }
  };
  return (
    <Shell title="צור גרסה חדשה" onClose={onClose}>
      <p className="muted">תיווצר גרסה עוקבת של "{sourceName}" (גרסה {sourceVersion}). כל הבקרות, המשימות וההערות יועתקו אליה.</p>
      <div className="field">
        <label>תיאור גרסה (אופציונלי)</label>
        <textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="לדוגמה: שיקוף עדכוני מדיניות לרבעון Q3 / לאחר ביקורת רגולטור / ..." />
      </div>
      {err && <div className="err">{err}</div>}
      <button className="btn btn-primary btn-block" disabled={busy} onClick={submit}>{busy ? 'יוצר…' : 'צור גרסה'}</button>
    </Shell>
  );
}

export function ChangePasswordDialog({ onClose, onDone, force }) {
  const [cur, setCur] = useState('');
  const [nw, setNw] = useState('');
  const [err, setErr] = useState('');
  const submit = async () => {
    setErr('');
    try { await api.post('/auth/change-password', { currentPassword: cur, newPassword: nw }); onDone(); }
    catch (e) { setErr(e.response?.data?.error || 'שגיאה'); }
  };
  return (
    <Shell title="שינוי סיסמה" onClose={force ? () => {} : onClose}>
      {force && <p className="err">חובה להחליף את סיסמת ברירת המחדל לפני המשך העבודה.</p>}
      <div className="field"><label>סיסמה נוכחית</label><input type="password" value={cur} onChange={(e) => setCur(e.target.value)} /></div>
      <div className="field"><label>סיסמה חדשה (לפחות 10 תווים)</label><input type="password" value={nw} onChange={(e) => setNw(e.target.value)} /></div>
      {err && <div className="err">{err}</div>}
      <button className="btn btn-primary btn-block" onClick={submit}>עדכן סיסמה</button>
    </Shell>
  );
}
