import React, { useEffect, useState } from 'react';
import api, { STATUS_HE, TASK_STATUS_HE, DECISION_HE, ETA_HE } from '../api';

const TABS = ['פרטי בקרה', 'הערכת סיכון', 'מיטיגציה', 'מורכבות טיפול', 'ניהול משימות', 'הערכת שעות עבודה', 'הערכה תקציבית'];
const lvlClass = (l) => 'pill lvl-' + (l || 'none');
// סולם 1-4 -> רמה
const levelOf = (s) => s == null ? null : s >= 12 ? 'קריטי' : s >= 8 ? 'גבוה' : s >= 4 ? 'בינוני' : 'נמוך';
const SCALE = { 1: '1 — נמוך', 2: '2 — בינוני', 3: '3 — גבוה', 4: '4 — קריטי' };

export default function ControlModal({ controlId, canEdit, onClose, onSaved, onNavigate, initialTab = 0 }) {
  const [c, setC] = useState(null);
  const [tab, setTab] = useState(initialTab);
  const [users, setUsers] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [siblings, setSiblings] = useState([]); // מזהי הבקרות באותה משפחה (לסדר prev/next)

  const load = async () => { const { data } = await api.get(`/controls/${controlId}`); setC(data); setDirty(false); };
  // רענון הבקרה + עדכון נתוני הרקע (דשבורד) — לאחר שינוי פעולות מיטיגציה
  const reloadAndNotify = async () => { await load(); if (onSaved) onSaved(); };
  useEffect(() => { load(); api.get('/users/basic').then((r) => setUsers(r.data)).catch(() => {}); }, [controlId]);
  // שליפת אחיות באותה משפחה (פעם אחת בכל פתיחת הבקרה — לאחר שטענו את הבקרה)
  useEffect(() => {
    if (!c?.surveyId || !c?.familyId) return;
    api.get(`/surveys/${c.surveyId}/controls`).then((r) => {
      setSiblings(r.data.filter((x) => x.familyId === c.familyId).map((x) => x.id));
    }).catch(() => {});
  }, [c?.surveyId, c?.familyId]);

  if (!c) return null;

  // ניווט בין בקרות באותה משפחה (מעגלי)
  const navigate = (dir) => {
    if (!siblings.length || !onNavigate) return;
    if (dirty && !confirm('יש שינויים שלא נשמרו. לעבור לבקרה אחרת בלי לשמור?')) return;
    const idx = siblings.indexOf(controlId);
    const nextIdx = idx < 0 ? 0 : (idx + dir + siblings.length) % siblings.length;
    onNavigate(siblings[nextIdx]);
  };
  const pos = siblings.indexOf(controlId);
  const set = (patch) => { setC({ ...c, ...patch }); setDirty(true); setSaved(false); };

  // שמירה — נשארים בחלון, ללא ניווט
  const save = async () => {
    const { data } = await api.put(`/controls/${controlId}`, c);
    setC({ ...c, ...data }); setDirty(false); setSaved(true);
    if (onSaved) onSaved(); // רענון נתוני רקע בלבד
    setTimeout(() => setSaved(false), 1500);
  };

  const score = (c.probability && c.impact) ? c.probability * c.impact : null;
  const resScore = (c.resProbability && c.resImpact) ? c.resProbability * c.resImpact : null;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{c.name} {c.notRelevant && <span className="tag-nr">לא רלוונטי</span>}
            {c.incomplete && <span className="tag-nr" title={'חסר: ' + (c.missingFields || []).join(', ')}>⚠ נתונים חסרים</span>}</h2>
          <div className="flex">
            {siblings.length > 1 && (
              <div className="flex" title="מעבר בין בקרות באותה משפחה" style={{ gap: 4 }}>
                <button className="icon-btn" onClick={() => navigate(-1)}>◀</button>
                <span className="muted" style={{ minWidth: 50, textAlign: 'center', fontSize: 12 }}>{pos + 1}/{siblings.length}</span>
                <button className="icon-btn" onClick={() => navigate(1)}>▶</button>
              </div>
            )}
            {canEdit && <button className="btn btn-primary" disabled={!dirty} onClick={save}>{saved ? '✓ נשמר' : dirty ? '💾 שמור' : 'אין שינויים'}</button>}
            <button className="icon-btn" onClick={onClose}>✕</button>
          </div>
        </div>
        <div className="tabs">
          {TABS.map((t, i) => <button key={i} className={'tab' + (tab === i ? ' active' : '')} onClick={() => setTab(i)}>{t}</button>)}
        </div>
        <div className="modal-body">
          {tab === 0 && <Details c={c} set={set} canEdit={canEdit} />}
          {tab === 1 && <RiskTab c={c} set={set} canEdit={canEdit} score={score} resScore={resScore} />}
          {tab === 2 && <MitigationTab c={c} set={set} canEdit={canEdit} reload={reloadAndNotify} />}
          {tab === 3 && <ComplexityTab c={c} set={set} canEdit={canEdit} />}
          {tab === 4 && <TasksTab control={c} users={users} canEdit={canEdit} reload={load} />}
          {tab === 5 && <WorkHoursTab c={c} set={set} canEdit={canEdit} />}
          {tab === 6 && <BudgetTab c={c} set={set} canEdit={canEdit} />}
        </div>
      </div>
    </div>
  );
}

const F = ({ label, children }) => <div className="field"><label>{label}</label>{children}</div>;
const ro = (canEdit) => (canEdit ? {} : { disabled: true });

function Details({ c, set, canEdit }) {
  return (
    <div>
      <div className="card" style={{ background: c.notRelevant ? 'var(--critical-bg)' : 'var(--low-bg)', marginBottom: 16 }}>
        <label className="flex" style={{ fontWeight: 600 }}>
          <input type="checkbox" checked={!!c.notRelevant} disabled={!canEdit} onChange={(e) => set({ notRelevant: e.target.checked })} />
          סמן בקרה כ"לא רלוונטית" — תוחרג מכל החישובים, מפת החום והגרפים
        </label>
      </div>
      <div className="row2">
        <F label="שם הבקרה"><input value={c.name || ''} {...ro(canEdit)} onChange={(e) => set({ name: e.target.value })} /></F>
        <F label="מזהה / קוד בקרה"><input value={c.controlCode || ''} {...ro(canEdit)} onChange={(e) => set({ controlCode: e.target.value })} /></F>
      </div>
      <F label="תיאור הבקרה"><textarea rows={3} value={c.description || ''} {...ro(canEdit)} onChange={(e) => set({ description: e.target.value })} /></F>
      <div className="row2">
        <F label="תחום ברשת"><input value={c.domain || ''} {...ro(canEdit)} onChange={(e) => set({ domain: e.target.value })} /></F>
        <F label="גורם מבצע בארגון"><input value={c.executor || ''} {...ro(canEdit)} onChange={(e) => set({ executor: e.target.value })} /></F>
      </div>
      <F label="מקור / מיפוי NIST"><input value={c.nistSource || ''} {...ro(canEdit)} onChange={(e) => set({ nistSource: e.target.value })} /></F>
      <F label="דגשים ביישום / פעילות מתקנת">
        <textarea className="readable" rows={10} value={c.notesImpl || ''} {...ro(canEdit)} onChange={(e) => set({ notesImpl: e.target.value })} />
      </F>
    </div>
  );
}

const Num = ({ value, onChange, canEdit }) => (
  <select value={value ?? ''} disabled={!canEdit} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
    <option value="">—</option>{[1, 2, 3, 4].map((n) => <option key={n} value={n}>{SCALE[n]}</option>)}
  </select>
);

function ScoreBox({ label, score }) {
  const lvl = levelOf(score);
  return <div className="kpi info" style={{ cursor: 'default' }}>
    <div className="num">{score ?? '—'}</div>
    <div className="lbl">{label} {lvl && <span className={lvlClass(lvl)}>{lvl}</span>}</div>
  </div>;
}

function RiskTab({ c, set, canEdit, score, resScore }) {
  const curScore = score == null ? null : c.status === 'completed' ? (resScore ?? score) : c.status === 'in_progress' ? (resScore != null ? Math.round((score + resScore) / 2) : score) : score;
  return (
    <div>
      <F label="תרחיש איום/סיכון"><textarea rows={3} value={c.threatScenario || ''} {...ro(canEdit)} placeholder="תיאור קצר של תרחיש האיום/הסיכון הנובע מאי-יישום הבקרה" onChange={(e) => set({ threatScenario: e.target.value })} /></F>
      <p className="muted">דירוג בסולם 1–4: 1-נמוך · 2-בינוני · 3-גבוה · 4-קריטי</p>
      <h3>סיכון מובנה</h3>
      <div className="row2">
        <F label="הסתברות"><Num value={c.probability} canEdit={canEdit} onChange={(v) => set({ probability: v })} /></F>
        <F label="השפעה"><Num value={c.impact} canEdit={canEdit} onChange={(v) => set({ impact: v })} /></F>
      </div>
      <h3>סיכון שיורי (לאחר מיטיגציה)</h3>
      <div className="row2">
        <F label="הסתברות שיורית"><Num value={c.resProbability} canEdit={canEdit} onChange={(v) => set({ resProbability: v })} /></F>
        <F label="השפעה שיורית"><Num value={c.resImpact} canEdit={canEdit} onChange={(v) => set({ resImpact: v })} /></F>
      </div>
      <div className="kpi-grid" style={{ margin: '8px 0 16px' }}>
        <ScoreBox label="ציון מובנה" score={score} />
        <ScoreBox label="ציון שיורי" score={resScore} />
        <ScoreBox label="ציון נוכחי (לפי סטטוס)" score={curScore} />
      </div>
      <div className="row2">
        <F label="סטטוס טיפול">
          <select value={c.status} disabled={!canEdit} onChange={(e) => set({ status: e.target.value })}>
            {Object.entries(STATUS_HE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </F>
        <F label="החלטת הנהלה לטיפול בסיכון">
          <select value={c.mgmtDecision || ''} disabled={!canEdit} onChange={(e) => set({ mgmtDecision: e.target.value || null })}>
            <option value="">—</option>
            {['reduce', 'transfer', 'accept'].map((k) => <option key={k} value={k}>{DECISION_HE[k]}</option>)}
          </select>
        </F>
      </div>
      <div className="row2">
        <F label="מבצע (R)"><input value={c.responsibleR || ''} {...ro(canEdit)} onChange={(e) => set({ responsibleR: e.target.value })} /></F>
        <F label="תאריך יעד"><input type="date" value={c.dueDate ? c.dueDate.slice(0, 10) : ''} disabled={!canEdit} onChange={(e) => set({ dueDate: e.target.value || null })} /></F>
      </div>
    </div>
  );
}

function MitigationTab({ c, set, canEdit, reload }) {
  const [newAct, setNewAct] = useState('');
  const acts = c.mitigationActions || [];
  const total = acts.length;
  const done = acts.filter((a) => a.done).length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  const add = async () => {
    if (!newAct.trim()) return;
    await api.post(`/controls/${c.id}/mitigation-actions`, { text: newAct.trim() });
    setNewAct(''); await reload();
  };
  const toggle = async (a) => { await api.put(`/mitigation-actions/${a.id}`, { done: !a.done }); await reload(); };
  const remove = async (a) => { await api.delete(`/mitigation-actions/${a.id}`); await reload(); };

  return (
    <div>
      <p className="muted">פרט את פעולות המיטיגציה. ככל שמסמנים פעולות כבוצעו — הסיכון הנוכחי יורד הדרגתית מהמובנה לעבר השיורי.</p>
      <F label="פעולות מיטיגציה (תיאור כללי)">
        <textarea rows={4} value={c.mitigation || ''} {...ro(canEdit)}
          placeholder={'תיאור כללי של גישת המיטיגציה'}
          onChange={(e) => set({ mitigation: e.target.value })} />
      </F>

      <div className="card" style={{ background: 'var(--panel-2)' }}>
        <div className="flex" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>צ'קליסט ביצוע פעולות</h3>
          <span className="muted">{done}/{total} בוצעו · {pct}%</span>
        </div>
        <div className="progress-track" style={{ marginBottom: 12 }}>
          <div className="progress-fill" style={{ width: pct + '%', background: pct >= 75 ? '#16a34a' : pct >= 40 ? '#f59e0b' : '#dc2626' }} />
        </div>
        {acts.map((a) => (
          <div key={a.id} className="flex" style={{ padding: '4px 0' }}>
            <input type="checkbox" checked={a.done} disabled={!canEdit} onChange={() => toggle(a)} />
            <span style={{ flex: 1, textDecoration: a.done ? 'line-through' : 'none', color: a.done ? 'var(--muted)' : 'inherit' }}>{a.text}</span>
            {canEdit && <button className="btn" onClick={() => remove(a)}>🗑</button>}
          </div>
        ))}
        {!total && <div className="muted">לא הוגדרו פעולות. הוסף פעולות כדי לשקף את ירידת הסיכון בביצוען.</div>}
        {canEdit && (
          <div className="flex" style={{ marginTop: 10 }}>
            <input placeholder="פעולת מיטיגציה חדשה…" value={newAct} onChange={(e) => setNewAct(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
            <button className="btn btn-primary" onClick={add}>➕ הוסף</button>
          </div>
        )}
      </div>

      <div className="kpi-grid" style={{ marginTop: 12 }}>
        <ScoreBox label="סיכון מובנה" score={c.inherentScore} />
        <ScoreBox label="סיכון נוכחי (לפי ביצוע)" score={c.currentScore} />
        <ScoreBox label="יעד שיורי" score={c.residualScore} />
      </div>
      <p className="muted">הסיכון הנוכחי מחושב אוטומטית: מובנה − אחוז הביצוע × (מובנה − שיורי). לקבלת ירידה מלאה יש להזין גם סיכון שיורי בטאב "הערכת סיכון".</p>
    </div>
  );
}

function TasksTab({ control, users, canEdit, reload }) {
  const [nt, setNt] = useState({ description: '', assigneeId: '', etaValue: '', etaUnit: 'days', status: 'open' });
  const [noteText, setNoteText] = useState({});

  const addTask = async () => {
    if (!nt.description.trim()) return;
    await api.post(`/controls/${control.id}/tasks`, nt);
    setNt({ description: '', assigneeId: '', etaValue: '', etaUnit: 'days', status: 'open' });
    await reload();
  };
  const updTask = async (id, patch) => { await api.put(`/tasks/${id}`, patch); await reload(); };
  const addNote = async (taskId) => {
    const text = noteText[taskId];
    if (!text || !text.trim()) return;
    await api.post(`/tasks/${taskId}/notes`, { text });
    setNoteText({ ...noteText, [taskId]: '' });
    await reload();
  };

  return (
    <div>
      {canEdit && (
        <div className="card" style={{ background: 'var(--panel-2)' }}>
          <h3>משימה חדשה</h3>
          <F label="תיאור המשימה"><input value={nt.description} onChange={(e) => setNt({ ...nt, description: e.target.value })} /></F>
          <div className="row2">
            <F label="אחראי משימה">
              <select value={nt.assigneeId} onChange={(e) => setNt({ ...nt, assigneeId: e.target.value })}>
                <option value="">— בחר —</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.fullName || u.username}</option>)}
              </select>
            </F>
            <F label="סטטוס">
              <select value={nt.status} onChange={(e) => setNt({ ...nt, status: e.target.value })}>
                {Object.entries(TASK_STATUS_HE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </F>
          </div>
          <div className="row2">
            <F label="הערכת זמן טיפול"><input type="number" min="0" value={nt.etaValue} onChange={(e) => setNt({ ...nt, etaValue: e.target.value })} /></F>
            <F label="יחידת זמן">
              <select value={nt.etaUnit} onChange={(e) => setNt({ ...nt, etaUnit: e.target.value })}>
                {Object.entries(ETA_HE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </F>
          </div>
          <button className="btn btn-primary" onClick={addTask}>➕ הוסף משימה</button>
        </div>
      )}

      {control.tasks.map((t) => (
        <div key={t.id} className="card">
          <div className="flex">
            <b>{t.description}</b>
            <div className="spacer" />
            <span className="muted">{t.assignee ? (t.assignee.fullName || t.assignee.username) : 'לא משויך'}</span>
            {t.etaValue && <span className="muted"> · {t.etaValue} {ETA_HE[t.etaUnit]}</span>}
            <select value={t.status} disabled={!canEdit} onChange={(e) => updTask(t.id, { status: e.target.value })}>
              {Object.entries(TASK_STATUS_HE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div style={{ marginTop: 10 }}>
            {t.notes.map((n) => (
              <div key={n.id} className="note-card">
                <div className="note-meta">{n.userName} · {new Date(n.createdAt).toLocaleString('he-IL')}</div>
                <div>{n.text}</div>
              </div>
            ))}
            {canEdit && (
              <div className="flex" style={{ marginTop: 6 }}>
                <input placeholder="הוסף מלל חופשי…" value={noteText[t.id] || ''} onChange={(e) => setNoteText({ ...noteText, [t.id]: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && addNote(t.id)} />
                <button className="btn" onClick={() => addNote(t.id)}>שמור</button>
              </div>
            )}
          </div>
        </div>
      ))}
      {!control.tasks.length && <div className="muted">אין משימות לבקרה זו עדיין.</div>}
    </div>
  );
}

function ComplexityTab({ c, set, canEdit }) {
  const OPTS = [
    { k: 'easy', label: 'קל', color: 'var(--low)', bg: 'var(--low-bg)', desc: 'טיפול פשוט, משאבים מועטים, ללא תלות מורכבת' },
    { k: 'medium', label: 'בינוני', color: '#a16207', bg: 'var(--medium-bg)', desc: 'דורש תכנון, מספר גורמים מעורבים' },
    { k: 'complex', label: 'מורכב', color: 'var(--critical)', bg: 'var(--critical-bg)', desc: 'פרויקט רחב, תלויות רבות, משאבים/זמן ניכרים' },
  ];
  return (
    <div>
      <p className="muted">דרג את מורכבות הטיפול הנדרש ליישום הבקרה.</p>
      <div className="grid-3" style={{ marginBottom: 16 }}>
        {OPTS.map((o) => (
          <div key={o.k} className="card" onClick={() => canEdit && set({ complexity: o.k })}
            style={{ cursor: canEdit ? 'pointer' : 'default', textAlign: 'center', borderTop: '4px solid ' + o.color,
              background: c.complexity === o.k ? o.bg : 'var(--panel)', outline: c.complexity === o.k ? '2px solid ' + o.color : 'none' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: o.color }}>{o.label}</div>
            <div className="muted" style={{ marginTop: 6 }}>{o.desc}</div>
          </div>
        ))}
      </div>
      <F label="פירוט מורכבות הטיפול">
        <textarea className="readable" rows={8} value={c.complexityNotes || ''} {...ro(canEdit)}
          placeholder="פרט את הגורמים המשפיעים על מורכבות הטיפול: תלויות, משאבים, זמן, מערכות מושפעות וכד'"
          onChange={(e) => set({ complexityNotes: e.target.value })} />
      </F>
    </div>
  );
}

function WorkHoursTab({ c, set, canEdit }) {
  return (
    <div>
      <p className="muted">הערכת היקף שעות העבודה הנדרש ליישום הבקרה. הסכום הכולל לכלל הסקר מוצג בדשבורד.</p>
      <div className="row2">
        <F label="הערכת שעות עבודה">
          <input type="number" min="0" step="0.5" value={c.workHours ?? ''} {...ro(canEdit)}
            onChange={(e) => set({ workHours: e.target.value })} placeholder="לדוגמה: 24" />
        </F>
      </div>
      <F label="תיאור / פירוט שעות העבודה">
        <textarea className="readable" rows={8} value={c.workHoursNotes || ''} {...ro(canEdit)}
          onChange={(e) => set({ workHoursNotes: e.target.value })}
          placeholder={'פירוט הפעולות שיידרשו לביצוע, חלוקה לשלבים, אילו בעלי תפקידים מעורבים, וכו׳.'} />
      </F>
    </div>
  );
}

function BudgetTab({ c, set, canEdit }) {
  return (
    <div>
      <p className="muted">הערכת עלות יישום/טיפול בבקרה. סכום ההערכות מוצג בדשבורד המנהלים לפי מטבע.</p>
      <div className="card" style={{ background: c.noCost ? 'var(--low-bg)' : 'var(--panel-2)', marginBottom: 14 }}>
        <label className="flex" style={{ fontWeight: 600 }}>
          <input type="checkbox" checked={!!c.noCost} disabled={!canEdit}
            onChange={(e) => set({ noCost: e.target.checked })} />
          ללא עלות — הבקרה אינה כרוכה בעלות ולא תיכלל בסיכומי התקציב
        </label>
      </div>
      <div className="row2">
        <F label="הערכת תקציב"><input type="number" min="0" value={c.budgetEstimate ?? ''} disabled={!canEdit || c.noCost} onChange={(e) => set({ budgetEstimate: e.target.value })} /></F>
        <F label="מטבע">
          <select value={c.budgetCurrency || 'ILS'} disabled={!canEdit || c.noCost} onChange={(e) => set({ budgetCurrency: e.target.value })}>
            <option value="ILS">₪ ILS</option><option value="USD">$ USD</option><option value="EUR">€ EUR</option>
          </select>
        </F>
      </div>
      <F label="פירוט / הערות תקציביות"><textarea rows={5} value={c.budgetNotes || ''} {...ro(canEdit)} onChange={(e) => set({ budgetNotes: e.target.value })} /></F>
    </div>
  );
}
