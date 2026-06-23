import React, { useEffect, useState } from 'react';
import api from '../api';

const ROLE_HE = { admin: 'אדמין', users: 'משתמש (עריכה)', management: 'הנהלה (דשבורד)', guest: 'אורח (צפייה)' };

export default function SettingsMenu({ user, onClose, onChangePassword, flash }) {
  const isAdmin = user.role === 'admin';
  const [tab, setTab] = useState(isAdmin ? 'users' : 'account');

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ width: 'min(820px,95vw)' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><h2>⚙️ הגדרות מערכת</h2><button className="icon-btn" onClick={onClose}>✕</button></div>
        <div className="tabs">
          {isAdmin && <button className={'tab' + (tab === 'users' ? ' active' : '')} onClick={() => setTab('users')}>ניהול משתמשים</button>}
          {isAdmin && <button className={'tab' + (tab === 'network' ? ' active' : '')} onClick={() => setTab('network')}>פתיחת רשת חדשה</button>}
          {isAdmin && <button className={'tab' + (tab === 'backup' ? ' active' : '')} onClick={() => setTab('backup')}>גיבוי</button>}
          {isAdmin && <button className={'tab' + (tab === 'restore' ? ' active' : '')} onClick={() => setTab('restore')}>שחזור</button>}
          <button className={'tab' + (tab === 'account' ? ' active' : '')} onClick={() => setTab('account')}>החשבון שלי</button>
        </div>
        <div className="modal-body">
          {tab === 'users' && <UsersTab flash={flash} />}
          {tab === 'network' && <NetworkTab flash={flash} />}
          {tab === 'backup' && <BackupTab flash={flash} />}
          {tab === 'restore' && <RestoreTab flash={flash} />}
          {tab === 'account' && (
            <div>
              <p>משתמש: <b>{user.username}</b> · קבוצה: {ROLE_HE[user.role]}</p>
              <button className="btn btn-primary" onClick={onChangePassword}>שינוי סיסמה</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function UsersTab({ flash }) {
  const [users, setUsers] = useState([]);
  const [networks, setNetworks] = useState([]);
  const [f, setF] = useState({ username: '', password: '', role: 'users', fullName: '', networkId: '' });
  const [edit, setEdit] = useState(null); // עריכת משתמש קיים
  const load = () => api.get('/users').then((r) => setUsers(r.data));
  useEffect(() => { load(); api.get('/networks').then((r) => setNetworks(r.data)); }, []);

  const netLabel = (id) => id == null ? 'כל הרשתות' : (networks.find((n) => n.id === id)?.name || '—');
  const create = async () => {
    try { await api.post('/users', f); setF({ username: '', password: '', role: 'users', fullName: '', networkId: '' }); load(); flash('המשתמש נוצר — יידרש לשנות סיסמה בכניסה'); }
    catch (e) { alert(e.response?.data?.error || 'שגיאה'); }
  };
  const del = async (id) => { if (confirm('למחוק משתמש לצמיתות?')) { await api.delete(`/users/${id}`); load(); } };
  const toggleActive = async (u) => { await api.put(`/users/${u.id}`, { isActive: !u.isActive }); load(); flash(u.isActive ? 'המשתמש בוטל' : 'המשתמש הופעל'); };
  const resetPwd = async (u) => {
    const pwd = prompt(`איפוס סיסמה ל-"${u.username}".\nהזן סיסמה ראשונית חדשה (המשתמש יידרש לשנותה בכניסה):`);
    if (pwd && pwd.length >= 10) { await api.put(`/users/${u.id}`, { password: pwd }); flash('הסיסמה אופסה'); }
    else if (pwd) alert('סיסמה חייבת לפחות 10 תווים');
  };
  const saveEdit = async () => {
    try {
      await api.put(`/users/${edit.id}`, { role: edit.role, fullName: edit.fullName, networkId: edit.role === 'users' ? edit.networkId : null });
      setEdit(null); load(); flash('המשתמש עודכן');
    } catch (e) { alert(e.response?.data?.error || 'שגיאה'); }
  };

  return (
    <div>
      <div className="card" style={{ background: 'var(--panel-2)' }}>
        <h3>יצירת משתמש</h3>
        <div className="row2">
          <div className="field"><label>שם משתמש</label><input value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} /></div>
          <div className="field"><label>סיסמה ראשונית (לפחות 10 תווים)</label><input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></div>
        </div>
        <div className="row2">
          <div className="field"><label>שם מלא</label><input value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} /></div>
          <div className="field"><label>קבוצה (חובה)</label>
            <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
              {Object.entries(ROLE_HE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>
        {f.role === 'users' && (
          <div className="field"><label>רשת מורשית</label>
            <select value={f.networkId} onChange={(e) => setF({ ...f, networkId: e.target.value })}>
              <option value="all">כל הרשתות</option>
              {networks.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
            </select>
          </div>
        )}
        <p className="muted">המשתמש נוצר עם סיסמה ראשונית ויידרש לשנותה בכניסה הראשונה.</p>
        <button className="btn btn-primary" onClick={create} disabled={!f.username || !f.password}>צור משתמש</button>
      </div>

      {edit && (
        <div className="card" style={{ borderTop: '3px solid var(--brand)' }}>
          <h3>עריכת משתמש: {edit.username}</h3>
          <div className="row2">
            <div className="field"><label>שם מלא</label><input value={edit.fullName || ''} onChange={(e) => setEdit({ ...edit, fullName: e.target.value })} /></div>
            <div className="field"><label>קבוצה</label>
              <select value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value })}>
                {Object.entries(ROLE_HE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
          {edit.role === 'users' && (
            <div className="field"><label>רשת מורשית</label>
              <select value={edit.networkId ?? 'all'} onChange={(e) => setEdit({ ...edit, networkId: e.target.value === 'all' ? null : Number(e.target.value) })}>
                <option value="all">כל הרשתות</option>
                {networks.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
              </select>
            </div>
          )}
          <div className="flex"><button className="btn btn-primary" onClick={saveEdit}>שמור</button><button className="btn" onClick={() => setEdit(null)}>ביטול</button></div>
        </div>
      )}

      <table className="tbl">
        <thead><tr><th>משתמש</th><th>שם מלא</th><th>קבוצה</th><th>רשת</th><th>חיבור אחרון</th><th>סטטוס</th><th>פעולות</th></tr></thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} style={{ opacity: u.isActive ? 1 : 0.5 }}>
              <td>{u.username}</td><td>{u.fullName || '—'}</td><td>{ROLE_HE[u.role]}</td>
              <td>{netLabel(u.networkId)}</td>
              <td>{u.lastLogin ? new Date(u.lastLogin).toLocaleString('he-IL') : 'טרם התחבר'}</td>
              <td>{u.isActive ? <span className="pill lvl-נמוך">פעיל</span> : <span className="pill lvl-קריטי">מבוטל</span>}</td>
              <td className="flex" style={{ flexWrap: 'wrap' }}>
                <button className="btn" title="עריכה" onClick={() => setEdit({ ...u })}>✏️</button>
                <button className="btn" title="איפוס סיסמה" onClick={() => resetPwd(u)}>🔑</button>
                {u.username !== 'admin' && <button className="btn" title={u.isActive ? 'בטל' : 'הפעל'} onClick={() => toggleActive(u)}>{u.isActive ? '🚫' : '✓'}</button>}
                {u.username !== 'admin' && <button className="btn" title="מחק" onClick={() => del(u.id)}>🗑</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NetworkTab({ flash }) {
  const [name, setName] = useState('');
  const [networks, setNetworks] = useState([]);
  // לאחר פתיחת רשת — יצירת סקר ראשון לרשת
  const [newSurvey, setNewSurvey] = useState(null); // {networkId, name, scope}
  const load = () => api.get('/networks').then((r) => setNetworks(r.data));
  useEffect(() => { load(); }, []);

  const create = async () => {
    try {
      const { data } = await api.post('/networks', { name }); setName(''); load(); flash('הרשת נוצרה');
      setNewSurvey({ networkId: data.id, networkName: data.name, name: '', scope: 'expanded' });
    } catch (e) { alert(e.response?.data?.error || 'שגיאה'); }
  };
  const createSurvey = async () => {
    try {
      await api.post('/surveys', { networkId: newSurvey.networkId, name: newSurvey.name, scope: newSurvey.scope });
      flash('הסקר נוצר ואוכלס'); setNewSurvey(null);
    } catch (e) { alert(e.response?.data?.error || 'שגיאה'); }
  };
  const del = async (n) => {
    if (confirm(`למחוק את הרשת "${n.name}"?\n\nשים לב: כל הסקרים, הבקרות, המשימות והגרסאות המשויכים לרשת זו יימחקו לצמיתות ולא ניתן לשחזר.`)) {
      try { await api.delete(`/networks/${n.id}`); load(); flash('הרשת נמחקה'); }
      catch (e) { alert(e.response?.data?.error || 'שגיאה'); }
    }
  };

  return (
    <div>
      <div className="card" style={{ background: 'var(--panel-2)' }}>
        <h3>פתיחת רשת חדשה</h3>
        <div className="field"><label>שם רשת חדשה</label><input value={name} onChange={(e) => setName(e.target.value)} /></div>
        <button className="btn btn-primary" onClick={create} disabled={!name}>פתח רשת</button>
      </div>

      {newSurvey && (
        <div className="card" style={{ borderTop: '3px solid var(--brand)' }}>
          <h3>צור סקר ראשון לרשת "{newSurvey.networkName}"</h3>
          <div className="field"><label>שם הסקר</label><input value={newSurvey.name} onChange={(e) => setNewSurvey({ ...newSurvey, name: e.target.value })} /></div>
          <div className="field"><label>סוג הסקר</label>
            <select value={newSurvey.scope} onChange={(e) => setNewSurvey({ ...newSurvey, scope: e.target.value })}>
              <option value="reduced">מצומצם — רשימת בקרות עיקריות (72 בקרות)</option>
              <option value="expanded">מורחב — כל בקרות תורת ההגנה 2.0</option>
            </select>
          </div>
          <div className="flex">
            <button className="btn btn-primary" onClick={createSurvey} disabled={!newSurvey.name}>צור סקר</button>
            <button className="btn" onClick={() => setNewSurvey(null)}>דלג</button>
          </div>
        </div>
      )}

      <table className="tbl" style={{ marginTop: 16 }}>
        <thead><tr><th>רשת</th><th></th></tr></thead>
        <tbody>{networks.map((n) => (
          <tr key={n.id}><td>{n.name}</td><td><button className="btn" onClick={() => del(n)}>🗑 מחק</button></td></tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function BackupTab({ flash }) {
  const [snaps, setSnaps] = useState([]);
  const load = () => api.get('/snapshots').then((r) => setSnaps(r.data));
  useEffect(() => { load(); }, []);
  const create = async () => { await api.post('/snapshots'); load(); flash('נוצר גיבוי'); };
  const download = async (s) => {
    const res = await api.get(`/snapshots/${s.id}/download`, { responseType: 'blob' });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a'); a.href = url; a.download = s.fileName; a.click(); URL.revokeObjectURL(url);
  };
  const restore = async (s) => { if (confirm('לשחזר מצב מערכת מגיבוי זה? המידע הנוכחי יוחלף.')) { await api.post(`/snapshots/${s.id}/restore`); flash('המערכת שוחזרה'); } };
  return (
    <div>
      <p className="muted">גיבוי snapshot כולל תאריך ושעה. ניתן להוריד עותק למחשב ולשחזר בעתיד.</p>
      <button className="btn btn-primary" onClick={create}>📸 צור גיבוי ידני עכשיו</button>
      <p className="muted" style={{ marginTop: 8 }}>גיבוי מתוזמן רץ אוטומטית בשרת (ברירת מחדל 02:00 בלילה).</p>
      <table className="tbl" style={{ marginTop: 12 }}>
        <thead><tr><th>תווית</th><th>סוג</th><th>תאריך</th><th></th></tr></thead>
        <tbody>
          {snaps.map((s) => (
            <tr key={s.id}>
              <td>{s.label}</td><td>{s.type === 'scheduled' ? 'מתוזמן' : 'ידני'}</td>
              <td>{new Date(s.createdAt).toLocaleString('he-IL')}</td>
              <td className="flex"><button className="btn" onClick={() => download(s)}>⬇️ הורד</button><button className="btn" onClick={() => restore(s)}>♻️ שחזר</button></td>
            </tr>
          ))}
          {!snaps.length && <tr><td colSpan={4} className="muted">אין גיבויים</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function RestoreTab({ flash }) {
  const [busy, setBusy] = useState(false);
  const onFile = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    setBusy(true);
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      await api.post('/restore', payload);
      flash('המערכת שוחזרה מהקובץ');
    } catch (err) { alert('שחזור נכשל: ' + (err.response?.data?.error || err.message)); }
    finally { setBusy(false); }
  };
  return (
    <div>
      <p className="muted">שחזור מערכת מקובץ גיבוי מקומי (JSON שהורד מהמערכת). פעולה זו מחליפה את כל המידע הקיים.</p>
      <input type="file" accept="application/json" onChange={onFile} disabled={busy} />
      {busy && <p className="muted">משחזר…</p>}
      <p className="muted" style={{ marginTop: 8 }}>לשחזור מ-snapshot קיים בשרת — השתמש בלשונית "גיבוי".</p>
    </div>
  );
}
