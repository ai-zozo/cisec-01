import React, { useEffect, useState, useCallback } from 'react';
import api from './api';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import FamilyView from './components/FamilyView';
import ControlModal from './components/ControlModal';
import SettingsMenu from './components/SettingsMenu';
import OverviewDashboard from './components/OverviewDashboard';
import ResultsView from './components/ResultsView';
import { NewSurveyDialog, LoadSurveyDialog, CreateVersionDialog, ChangePasswordDialog } from './components/Dialogs';

export default function App() {
  const [user, setUser] = useState(null);
  const [booted, setBooted] = useState(false);
  const [survey, setSurvey] = useState(null);
  const [view, setView] = useState('dashboard');
  const [controlId, setControlId] = useState(null);
  const [controlTab, setControlTab] = useState(0); // טאב פתיחה בחלון הבקרה
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dialog, setDialog] = useState(null);
  const [toast, setToast] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [query, setQuery] = useState(null); // {title, filter}
  const [searchText, setSearchText] = useState('');
  const [noSurveys, setNoSurveys] = useState(false);

  const flash = (m) => { setToast(m); setTimeout(() => setToast(''), 2500); };
  const canEdit = user && ['admin', 'users'].includes(user.role);
  const isMgmt = user && user.role === 'management';

  useEffect(() => {
    const onLogout = () => { setUser(null); setSurvey(null); };
    window.addEventListener('cisec-logout', onLogout);
    return () => window.removeEventListener('cisec-logout', onLogout);
  }, []);

  useEffect(() => {
    (async () => {
      if (localStorage.getItem('token')) {
        try { const { data } = await api.get('/auth/me'); setUser(data); if (data.mustChangePwd) setDialog('pwd'); }
        catch { localStorage.removeItem('token'); }
      }
      setBooted(true);
    })();
  }, []);

  // טעינת סקר. keepView=true שומר על התצוגה הנוכחית (לרענון שקט אחרי שמירה)
  const loadSurvey = useCallback(async (id, keepView = false) => {
    const { data } = await api.get(`/surveys/${id}`);
    setSurvey(data);
    if (!keepView) { setView('dashboard'); setControlId(null); setQuery(null); }
    localStorage.setItem('lastSurvey', id);
  }, []);

  // כניסה ישירה: לאחר התחברות נטען אוטומטית את הסקר האחרון/הראשון ללא מסך בחירה
  useEffect(() => {
    if (!user || survey) return;
    (async () => {
      try {
        const { data } = await api.get('/surveys');
        if (data.length) {
          const last = Number(localStorage.getItem('lastSurvey'));
          const target = data.find((s) => s.id === last) || data[0];
          await loadSurvey(target.id);
        } else { setNoSurveys(true); }
      } catch {}
    })();
  }, [user, survey, loadSurvey]);

  const logout = async () => { try { await api.post('/auth/logout'); } catch {} localStorage.removeItem('token'); setUser(null); setSurvey(null); setView('dashboard'); setNoSurveys(false); };

  // רענון נתונים אחרי עריכה — בלי לשנות תצוגה / לסגור חלון
  const dataChanged = async () => { setRefreshKey((k) => k + 1); if (survey) await loadSurvey(survey.id, true); };

  const exportExcel = async () => {
    if (!survey) return;
    const res = await api.get(`/surveys/${survey.id}/export`, { responseType: 'blob' });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a'); a.href = url; a.download = `cisec-${survey.name}.xlsx`; a.click();
    URL.revokeObjectURL(url); flash('הקובץ יוצא בהצלחה');
  };

  const makeVersion = async (description) => {
    if (!survey) return;
    const { data } = await api.post(`/surveys/${survey.id}/version`, { description });
    flash(`נוצרה ${data.name}`); await loadSurvey(data.id);
  };

  const runSearch = () => {
    const q = searchText.trim().toLowerCase();
    if (!q) { setQuery(null); return; }
    setControlId(null);
    setQuery({
      title: `תוצאות חיפוש: "${searchText}"`,
      filter: (c) => (c.name || '').toLowerCase().includes(q) || String(c.controlCode || c.id).toLowerCase().includes(q),
    });
    setView('results');
  };

  const openComplexity = (key) => {
    const HE = { easy: 'קל', medium: 'בינוני', complex: 'מורכב', none: 'לא דורג' };
    setControlId(null);
    setQuery({
      title: `בקרות רלוונטיות לפי מורכבות טיפול: ${HE[key] || key}`,
      filter: (c) => !c.notRelevant && (key === 'none' ? !c.complexity : c.complexity === key),
    });
    setView('results');
  };

  const openHeatCell = (prob, impact) => {
    setControlId(null);
    setQuery({
      title: `בקרות בסיכון נוכחי — הסתברות ${prob} × השפעה ${impact} (ציון ${prob * impact})`,
      filter: (c) => !c.notRelevant && c.curProbability === prob && c.curImpact === impact,
    });
    setView('results');
  };

  // ניווט גנרי מכל גרף/תצוגה לרשימת בקרות מסוננת; tab = טאב פתיחה בבקרה
  const openFilter = (title, filter, tab = 0) => {
    setControlId(null);
    setQuery({ title, filter, tab });
    setView('results');
  };

  // פתיחת חלון בקרה בטאב מסוים (ברירת מחדל: פרטי בקרה)
  const openControl = (id, tab = 0) => { setControlTab(tab); setControlId(id); };

  if (!booted) return <div className="login-wrap"><div className="muted">טוען…</div></div>;
  if (!user) return <Login onLogin={(u) => { setUser(u); if (u.mustChangePwd) setDialog('pwd'); }} />;

  // כניסה ישירה — בזמן טעינת הסקר מציגים מסך טעינה; אם אין סקרים, הודעה
  if (!survey) {
    return (
      <div className="login-wrap">
        <div className="login-card" style={{ textAlign: 'center' }}>
          <h1>Ci-Sec</h1>
          {noSurveys
            ? <>
                <p>אין סקרים זמינים עבורך.</p>
                {canEdit
                  ? <button className="btn btn-primary btn-block" onClick={() => setDialog('new')}>➕ צור סקר חדש</button>
                  : <p className="muted">פנה למנהל המערכת ליצירת סקר.</p>}
                <button className="btn btn-block" style={{ marginTop: 10 }} onClick={logout}>יציאה</button>
              </>
            : <p className="muted">נכנס למערכת…</p>}
        </div>
        {dialog === 'new' && <NewSurveyDialog user={user} onClose={() => setDialog(null)} onCreated={async (s) => { setDialog(null); setNoSurveys(false); await loadSurvey(s.id); flash('הסקר נוצר ואוכלס'); }} />}
        {dialog === 'pwd' && <ChangePasswordDialog force={user.mustChangePwd} onClose={() => setDialog(null)} onDone={() => { setDialog(null); setUser({ ...user, mustChangePwd: false }); flash('הסיסמה עודכנה'); }} />}
      </div>
    );
  }

  return (
    <div className="app">
      <header className="header">
        <div className="right flex">
          <button className="icon-btn" title="הגדרות" onClick={() => setSettingsOpen(true)}>⚙️</button>
          <button className="icon-btn" title="יציאה" onClick={logout}>⏻</button>
        </div>
        <div className="center">
          <div className="brand">Ci-Sec — תמונת מצב אבטחת מידע</div>
          <div className="sub">רשת: {survey.network?.name} · סקר: {survey.name} · גרסה {survey.version}</div>
        </div>
        <div className="left"><span className="muted">{user.fullName || user.username} ({user.role})</span></div>
      </header>

      <div className="body">
        <aside className="sidebar">
          {!isMgmt && (
            <div className="flex" style={{ marginBottom: 10 }}>
              <input placeholder="🔍 חיפוש בקרה / מזהה…" value={searchText}
                onChange={(e) => setSearchText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && runSearch()} />
              <button className="btn" onClick={runSearch}>חפש</button>
            </div>
          )}
          <button className={'nav-btn dash-btn' + (view === 'dashboard' ? ' active' : '')} onClick={() => { setView('dashboard'); setQuery(null); }}>
            📊 דשבורד
          </button>
          <button className={'nav-btn dash-btn' + (view === 'overview' ? ' active' : '')} style={{ marginTop: 6, background: 'linear-gradient(135deg,#0ea5e9,#38bdf8)' }} onClick={() => { setView('overview'); setQuery(null); }}>
            🗂️ מבט-על — כל הסקרים
          </button>
          {!isMgmt && <>
            <h3>משפחות בקרה</h3>
            {survey?.families?.map((f) => (
              <button key={f.id} className={'nav-btn' + (view === f.id ? ' active' : '')} onClick={() => { setView(f.id); setQuery(null); }}>
                <span>{f.name}</span><span className="badge">{f._count?.controls ?? 0}</span>
              </button>
            ))}
            {canEdit && (
              <button className="nav-btn" style={{ marginTop: 8, borderStyle: 'dashed' }} onClick={() => { setView('new-family'); setQuery(null); }}>
                ➕ צור משפחה / בקרה חדשה
              </button>
            )}
          </>}
        </aside>

        <main className="main">
          {view === 'overview' && (
            <OverviewDashboard onOpenSurvey={async (id) => { await loadSurvey(id); }} />
          )}
          {view === 'dashboard' && (
            <Dashboard surveyId={survey.id} refreshKey={refreshKey} user={user}
              onOpenControl={(id) => openControl(id)} onOpenFamily={(fid) => { setView(fid); setQuery(null); }}
              onHeatCell={openHeatCell} onComplexity={openComplexity} onFilter={openFilter} />
          )}
          {view === 'results' && query && (
            <ResultsView surveyId={survey.id} title={query.title} filter={query.filter}
              families={survey.families} onOpenControl={(id) => openControl(id, query.tab ?? 0)} key={refreshKey} />
          )}
          {!isMgmt && typeof view === 'number' && (
            <FamilyView surveyId={survey.id} familyId={view} key={view + '-' + refreshKey}
              onOpenControl={(id) => openControl(id)} />
          )}
          {!isMgmt && view === 'new-family' && (
            <NewFamilyControl survey={survey} onDone={async () => { await dataChanged(); flash('נוצר בהצלחה'); }} />
          )}
        </main>
      </div>

      <footer className="footer">
        <button className="btn btn-primary" onClick={() => dataChanged().then(() => flash('נשמר'))}>💾 שמור / רענן</button>
        {canEdit && <button className="btn" onClick={() => setDialog('new')}>➕ צור סקר חדש</button>}
        <button className="btn" onClick={() => setDialog('load')}>📂 טען סקר</button>
        {canEdit && <button className="btn" onClick={() => setDialog('version')}>🔁 צור גרסה</button>}
        <button className="btn" onClick={exportExcel}>⬇️ יצוא לאקסל</button>
      </footer>

      {controlId && (
        <ControlModal controlId={controlId} canEdit={canEdit} initialTab={controlTab}
          onClose={() => setControlId(null)} onSaved={dataChanged}
          onNavigate={(id) => setControlId(id)} />
      )}
      {settingsOpen && (
        <SettingsMenu user={user} onClose={() => setSettingsOpen(false)} flash={flash}
          onChangePassword={() => { setSettingsOpen(false); setDialog('pwd'); }} />
      )}
      {dialog === 'new' && <NewSurveyDialog user={user} onClose={() => setDialog(null)} onCreated={async (s) => { setDialog(null); await loadSurvey(s.id); flash('הסקר נוצר ואוכלס'); }} />}
      {dialog === 'load' && <LoadSurveyDialog currentUser={user} currentSurveyId={survey?.id} flash={flash}
        onClose={() => setDialog(null)} onPick={async (id) => { setDialog(null); await loadSurvey(id); }} />}
      {dialog === 'version' && survey && (
        <CreateVersionDialog sourceName={survey.name} sourceVersion={survey.version}
          onClose={() => setDialog(null)}
          onCreated={async (desc) => { setDialog(null); await makeVersion(desc); }} />
      )}
      {dialog === 'pwd' && <ChangePasswordDialog force={user.mustChangePwd} onClose={() => setDialog(null)} onDone={() => { setDialog(null); setUser({ ...user, mustChangePwd: false }); flash('הסיסמה עודכנה'); }} />}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function NewFamilyControl({ survey, onDone }) {
  const [famName, setFamName] = useState('');
  const [existingFam, setExistingFam] = useState('');
  const [c, setC] = useState({ name: '', controlCode: '', description: '', threatScenario: '', mitigation: '', domain: '', executor: '' });
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setBusy(true);
    try {
      let familyId = existingFam;
      if (!familyId) {
        if (!famName.trim()) { alert('הזן שם משפחה או בחר קיימת'); setBusy(false); return; }
        const { data } = await api.post(`/surveys/${survey.id}/families`, { name: famName, code: 'CUSTOM' });
        familyId = data.id;
      }
      await api.post(`/families/${familyId}/controls`, c);
      await onDone();
    } finally { setBusy(false); }
  };

  return (
    <div>
      <h2 className="page-title">צור משפחה / בקרה חדשה</h2>
      <p className="page-sub">הנתונים החדשים ייכללו אוטומטית בכל החישובים והדשבורד.</p>
      <div className="card">
        <h3>משפחה</h3>
        <div className="row2">
          <div className="field"><label>בחר משפחה קיימת</label>
            <select value={existingFam} onChange={(e) => setExistingFam(e.target.value)}>
              <option value="">— משפחה חדשה —</option>
              {survey.families.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
          {!existingFam && <div className="field"><label>שם משפחה חדשה</label>
            <input value={famName} onChange={(e) => setFamName(e.target.value)} /></div>}
        </div>
      </div>
      <div className="card">
        <h3>בקרה</h3>
        <div className="row2">
          <div className="field"><label>שם בקרה</label><input value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} /></div>
          <div className="field"><label>מזהה / קוד בקרה</label><input value={c.controlCode} onChange={(e) => setC({ ...c, controlCode: e.target.value })} /></div>
        </div>
        <div className="field"><label>תיאור הבקרה</label><textarea rows={2} value={c.description} onChange={(e) => setC({ ...c, description: e.target.value })} /></div>
        <div className="field"><label>תרחיש איום/סיכון</label><textarea rows={2} value={c.threatScenario} onChange={(e) => setC({ ...c, threatScenario: e.target.value })} /></div>
        <div className="field"><label>פעולות מיטיגציה</label><textarea rows={2} value={c.mitigation} onChange={(e) => setC({ ...c, mitigation: e.target.value })} /></div>
        <div className="row2">
          <div className="field"><label>תחום ברשת</label><input value={c.domain} onChange={(e) => setC({ ...c, domain: e.target.value })} /></div>
          <div className="field"><label>גורם מבצע</label><input value={c.executor} onChange={(e) => setC({ ...c, executor: e.target.value })} /></div>
        </div>
        <button className="btn btn-primary" disabled={busy} onClick={create}>{busy ? 'יוצר…' : 'צור'}</button>
      </div>
    </div>
  );
}
