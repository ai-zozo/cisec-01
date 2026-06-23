import React, { useEffect, useState } from 'react';
import api, { LEVEL_COLORS, DECISION_HE, TASK_STATUS_HE, STATUS_HE } from '../api';
import {
  PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid,
  LineChart, Line,
} from 'recharts';

const heatColor = (p, i) => {
  const s = p * i;
  if (s >= 12) return '#dc2626';
  if (s >= 8) return '#f97316';
  if (s >= 4) return '#eab308';
  return '#16a34a';
};
const CUR_SYMBOL = { ILS: '₪', USD: '$', EUR: '€' };
const AVG_HELP = 'ציון הסיכון הממוצע = ממוצע ציוני הסיכון הנוכחי של כל הבקרות הרלוונטיות.\nציון בקרה = הסתברות × השפעה (סולם 1-4 לכל ציר, טווח 1-16), כאשר הציון הנוכחי נגזר מהסטטוס: לא התחיל=מובנה, בתהליך=ממוצע מובנה/שיורי, הושלם=שיורי.\nרמות: 1-3 נמוך · 4-7 בינוני · 8-11 גבוה · 12-16 קריטי.\nבקרות המסומנות "לא רלוונטי" אינן נכללות.';
const HEAT_HELP = 'מפת חום הסיכון הנוכחי: כל תא סופר את מספר הבקרות לפי מיקומן הנוכחי (הסתברות × השפעה, סולם 1-4).\nהמיקום מושפע מהתקדמות המיטיגציה — ככל שמבצעים פעולות מיטיגציה, הבקרה "נעה" מהסיכון המובנה לעבר הסיכון השיורי.\nצבע התא לפי דחיפות: ירוק נמוך · צהוב בינוני · כתום גבוה · אדום קריטי.\nלחיצה על תא מציגה את הבקרות שבו.';
const BUDGET = 6; // אינדקס טאב "הערכה תקציבית" בחלון הבקרה (אחרי "הערכת שעות עבודה")
const WORK_HOURS = 5; // אינדקס טאב "הערכת שעות עבודה"

// התקדמות משוקללת: הושלם=100%, בתהליך=50%, לא התחיל=0%
const weightedPct = (completed, inProgress, total) =>
  total ? Math.round((completed * 100 + inProgress * 50) / total) : 0;
const progressColor = (pct) => pct >= 75 ? '#16a34a' : pct >= 40 ? '#f59e0b' : '#dc2626';

function ProgressBar({ pct, large }) {
  return (
    <div className={'progress-track' + (large ? ' progress-lg' : '')}>
      <div className="progress-fill" style={{ width: pct + '%', background: progressColor(pct) }}>
        {large && <span className="progress-num">{pct}%</span>}
      </div>
    </div>
  );
}

export default function Dashboard({ surveyId, refreshKey, user, onOpenControl, onOpenFamily, onHeatCell, onComplexity, onFilter }) {
  const [d, setD] = useState(null);
  const [history, setHistory] = useState([]);
  useEffect(() => { (async () => {
    const { data } = await api.get(`/surveys/${surveyId}/dashboard`);
    setD(data);
    api.get(`/surveys/${surveyId}/kpi-history`).then((r) => {
      // נורמליזציה לתאריך מקוצר לתצוגה בציר
      setHistory(r.data.map((row) => ({
        ts: new Date(row.recordedAt).getTime(),
        label: fmtDate(row.recordedAt),
        avgCurrent: Number(row.avgCurrent) || 0,
        riskReductionPct: Number(row.riskReductionPct) || 0,
      })));
    }).catch(() => {});
  })(); }, [surveyId, refreshKey]);

  if (!d) return <div className="muted">טוען נתונים…</div>;
  const k = d.kpi;
  const F = (title, filter, tab) => onFilter && onFilter(title, filter, tab);

  const levelData = (obj) => Object.entries(obj).filter(([_, v]) => v > 0).map(([name, value]) => ({ name, value }));
  const decisionData = Object.entries(d.decisions).filter(([_, v]) => v > 0)
    .map(([key, value]) => ({ name: DECISION_HE[key] || key, value, key }));
  const statusData = Object.entries(d.status).map(([key, value]) => ({ name: STATUS_HE[key] || key, value, key }));
  const famData = d.byFamily.map((f) => ({ name: f.name, ממוצע: f.avgScore, id: f.id }));

  return (
    <div>
      <h2 className="page-title">דשבורד</h2>
      <p className="page-sub">סקר נוכחי: {d.survey?.name} · גרסה {d.survey?.version} · רשת {d.survey?.network?.name}</p>

      {/* התקדמות טיפול כוללת — עולה ככל שבקרות מתקדמות לבתהליך/הושלם */}
      {(() => {
        const total = k.relevantControls;
        const pct = weightedPct(k.completed, k.inProgress, total);
        return (
          <div className="card" style={{ cursor: 'pointer' }}
            title="התקדמות משוקללת: הושלם=100%, בתהליך=50%, לא התחיל=0% (מתוך הבקרות הרלוונטיות)"
            onClick={() => F('בקרות בטיפול / פתוחות', (c) => !c.notRelevant && c.status !== 'completed')}>
            <div className="flex" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
              <h3 style={{ margin: 0 }}>התקדמות טיפול כוללת בבקרות</h3>
              <span className="muted">{k.completed} הושלמו · {k.inProgress} בתהליך · {k.notStarted} לא התחילו · מתוך {total}</span>
            </div>
            <ProgressBar pct={pct} large />
          </div>
        );
      })()}

      {/* KPI cards — כל כרטיס לחיץ ומנווט לרשימת הבקרות הרלוונטית */}
      <div className="kpi-grid">
        <Kpi cls="info" num={k.relevantControls} lbl="בקרות רלוונטיות" onClick={() => F('בקרות רלוונטיות', (c) => !c.notRelevant)} />
        <Kpi cls="info" num={k.notRelevantControls} lbl="בקרות לא רלוונטיות" onClick={() => F('בקרות לא רלוונטיות', (c) => c.notRelevant)} />
        <Kpi cls="crit" num={k.criticalCurrent} lbl="חשיפה קריטית נוכחית" onClick={() => F('חשיפה קריטית נוכחית', (c) => !c.notRelevant && c.currentLevel === 'קריטי')} />
        <Kpi cls="high" num={k.highCurrent} lbl="חשיפה גבוהה נוכחית" onClick={() => F('חשיפה גבוהה נוכחית', (c) => !c.notRelevant && c.currentLevel === 'גבוה')} />
        <Kpi cls="info" num={k.avgCurrent} lbl="ציון סיכון ממוצע ⓘ" title={AVG_HELP} onClick={() => F('בקרות רלוונטיות (ציון ממוצע)', (c) => !c.notRelevant)} />
        <Kpi cls="ok" num={(k.riskReductionPct ?? 0) + '%'} lbl="הפחתת סיכון שהושגה ⓘ"
          title={'כמה ירד הסיכון מהמובנה (ראשוני) לנוכחי, באחוזים — ככל שמבצעים פעולות מיטיגציה הסיכון יורד והאחוז עולה.'}
          onClick={() => F('בקרות שהחלה בהן הפחתת סיכון', (c) => !c.notRelevant && c.inherentScore != null && c.currentScore < c.inherentScore)} />
        <Kpi cls="ok" num={k.completed} lbl="הושלמו" onClick={() => F('בקרות שהושלמו', (c) => !c.notRelevant && c.status === 'completed')} />
        <Kpi cls="high" num={k.open} lbl="פתוחות (בטיפול)" onClick={() => F('בקרות פתוחות', (c) => !c.notRelevant && c.status !== 'completed')} />
        <Kpi cls="crit" num={k.incomplete} lbl="בקרות עם נתונים חסרים" onClick={() => F('בקרות עם נתונים חסרים', (c) => c.incomplete)} />
        <Kpi cls="info" num={k.totalControls} lbl="סך הבקרות" onClick={() => F('כל הבקרות', () => true)} />
      </div>

      <div className="grid-2">
        {/* מפת חום 4x4 — סיכון נוכחי (מושפע מהתקדמות המיטיגציה) */}
        <div className="card">
          <h3 title={HEAT_HELP}>מפת חום סיכון נוכחי 4×4 (הסתברות × השפעה) ⓘ — לחיצה מציגה בקרות</h3>
          <div className="heatmap heatmap-4 heatmap-sm">
            {d.heatmap.map((row, ri) => {
              const prob = 4 - ri;
              return (
                <React.Fragment key={ri}>
                  <div className="heat-axis">{prob}</div>
                  {row.map((count, ci) => {
                    const imp = ci + 1;
                    return (
                      <div key={ci} className="heat-cell"
                        style={{ background: count ? heatColor(prob, imp) : '#eef1f5', color: count ? '#fff' : '#c4ccd6' }}
                        title={`הסתברות ${prob} × השפעה ${imp} = ${prob * imp} · ${count} בקרות`}
                        onClick={() => count && onHeatCell && onHeatCell(prob, imp)}>
                        {count || ''}
                      </div>
                    );
                  })}
                </React.Fragment>
              );
            })}
            <div className="heat-axis"></div>
            {[1, 2, 3, 4].map((i) => <div key={i} className="heat-axis">{i}</div>)}
          </div>
          <div className="muted" style={{ marginTop: 8 }}>ציר אנכי: הסתברות · ציר אופקי: השפעה · סולם 1-4 · מיקום לפי הסיכון הנוכחי</div>
        </div>

        {/* תרשים ציר זמן: ציון סיכון ממוצע + % הפחתת סיכון לאורך הזמן (חותמות זמן בכל שינוי) */}
        <div className="card">
          <h3 title="ציון הסיכון הממוצע ו-% הפחתת הסיכון שהושגה — נמדדים בכל שינוי בבקרה או בפעולות מיטיגציה. חותמת זמן בכל נקודה.">
            ציר זמן — ציון סיכון ממוצע ו-% הפחתת סיכון ⓘ
          </h3>
          {history.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={history} margin={{ top: 8, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 9 }} angle={-15} textAnchor="end" height={50} interval="preserveStartEnd" />
                <YAxis yAxisId="L" domain={[0, 16]} tick={{ fontSize: 10 }} label={{ value: 'ציון', angle: -90, position: 'insideLeft', style: { fontSize: 10 } }} />
                <YAxis yAxisId="R" orientation="right" domain={[0, 100]} tick={{ fontSize: 10 }} label={{ value: '%', angle: 90, position: 'insideRight', style: { fontSize: 10 } }} />
                <Tooltip /><Legend />
                <Line yAxisId="L" type="monotone" dataKey="avgCurrent" name="ציון סיכון ממוצע" stroke="#dc2626" strokeWidth={2} dot={{ r: 3 }} />
                <Line yAxisId="R" type="monotone" dataKey="riskReductionPct" name="% הפחתת סיכון" stroke="#16a34a" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="muted" style={{ padding: '20px 0', textAlign: 'center' }}>
              אין עדיין מספיק נתונים — נקודה תוצג בכל שינוי בבקרה או בפעולות מיטיגציה.
            </div>
          )}
          <div className="muted">{history.length} מדידות · עם חותמת זמן.</div>
        </div>

      </div>

      <div className="grid-3">
        {/* רמות סיכון מובנה/שיורי/נוכחי — לחיצה על עמודה מציגה בקרות באותה רמה נוכחית */}
        <div className="card">
          <h3>כמות סיכונים לפי רמה (לחיצה מציגה בקרות)</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={['קריטי', 'גבוה', 'בינוני', 'נמוך'].map((lvl) => ({
              name: lvl, מובנה: d.levels.inherent[lvl] || 0, שיורי: d.levels.residual[lvl] || 0, נוכחי: d.levels.current[lvl] || 0,
            }))} onClick={(e) => { const lvl = e?.activeLabel; if (lvl) F(`בקרות ברמת סיכון נוכחי: ${lvl}`, (c) => !c.notRelevant && c.currentLevel === lvl); }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} />
              <Tooltip /><Legend />
              <Bar dataKey="מובנה" fill="#94a3b8" cursor="pointer" /><Bar dataKey="שיורי" fill="#60a5fa" cursor="pointer" /><Bar dataKey="נוכחי" fill="#2563eb" cursor="pointer" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* החלטות הנהלה — פאי לחיץ */}
        <div className="card">
          <h3>התפלגות החלטות הנהלה</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={decisionData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={85} label cursor="pointer"
                onClick={(e) => { const key = e?.key || e?.payload?.key; if (key) F(`בקרות לפי החלטת הנהלה: ${DECISION_HE[key] || key}`, (c) => !c.notRelevant && (key === 'none' ? !c.mgmtDecision : c.mgmtDecision === key)); }}>
                {decisionData.map((e, i) => <Cell key={i} fill={['#2563eb', '#16a34a', '#eab308', '#f97316', '#94a3b8'][i % 5]} />)}
              </Pie>
              <Tooltip /><Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* סטטוס טיפול — פאי לחיץ */}
        <div className="card">
          <h3>סטטוס טיפול בבקרות</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={85} label cursor="pointer"
                onClick={(e) => { const key = e?.key || e?.payload?.key; if (key) F(`בקרות בסטטוס: ${STATUS_HE[key] || key}`, (c) => !c.notRelevant && c.status === key); }}>
                <Cell fill="#94a3b8" /><Cell fill="#eab308" /><Cell fill="#16a34a" />
              </Pie>
              <Tooltip /><Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* חשיפה נוכחית לפי רמה — פאי לחיץ + ציון ממוצע לפי משפחה */}
      <div className="grid-2">
        <div className="card">
          <h3>חשיפה נוכחית בפועל (לפי רמה) — לחיצה מציגה בקרות</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={levelData(d.levels.current)} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label cursor="pointer"
                onClick={(e) => { const lvl = e?.name || e?.payload?.name; if (lvl) F(`בקרות ברמת סיכון נוכחי: ${lvl}`, (c) => !c.notRelevant && (c.currentLevel || 'לא הוערך') === lvl); }}>
                {levelData(d.levels.current).map((e, i) => <Cell key={i} fill={LEVEL_COLORS[e.name] || '#94a3b8'} />)}
              </Pie>
              <Tooltip /><Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h3>ציון סיכון ממוצע לפי משפחת בקרה (לחיצה לפתיחת משפחה)</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={famData} layout="vertical" margin={{ right: 20, left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" domain={[0, 16]} /><YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10 }} />
              <Tooltip />
              <Bar dataKey="ממוצע" cursor="pointer" onClick={(e) => e && onOpenFamily && onOpenFamily(e.id)}>
                {famData.map((f, i) => <Cell key={i} fill={f.ממוצע >= 12 ? '#dc2626' : f.ממוצע >= 8 ? '#f97316' : f.ממוצע >= 4 ? '#eab308' : '#16a34a'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* השוואת סיכון מובנה מול שיורי לפי משפחה */}
      <div className="card">
        <h3>השוואת סיכון מובנה מול שיורי — לפי משפחה (לחיצה לפתיחת משפחה)</h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={d.byFamily.map((f) => ({ name: f.name, id: f.id, מובנה: f.avgInherent, שיורי: f.avgResidual }))}
            onClick={(e) => { const p = e?.activePayload?.[0]?.payload; if (p && onOpenFamily) onOpenFamily(p.id); }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" tick={{ fontSize: 9 }} interval={0} angle={-15} textAnchor="end" height={60} />
            <YAxis domain={[0, 16]} /><Tooltip /><Legend />
            <Bar dataKey="מובנה" fill="#dc2626" cursor="pointer" /><Bar dataKey="שיורי" fill="#16a34a" cursor="pointer" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ירידת הסיכון: מובנה (ראשוני) מול נוכחי לפי משפחה */}
      <div className="card">
        <h3>ירידת הסיכון — מובנה (ראשוני) מול נוכחי לפי משפחה (לחיצה לפתיחת משפחה)</h3>
        <p className="muted" style={{ marginTop: -6 }}>הפער בין העמודות משקף את ההפחתה שהושגה עם ביצוע פעולות המיטיגציה.</p>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={d.byFamily.map((f) => ({ name: f.name, id: f.id, מובנה: f.avgInherent, נוכחי: f.avgScore }))}
            onClick={(e) => { const p = e?.activePayload?.[0]?.payload; if (p && onOpenFamily) onOpenFamily(p.id); }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" tick={{ fontSize: 9 }} interval={0} angle={-15} textAnchor="end" height={60} />
            <YAxis domain={[0, 16]} /><Tooltip /><Legend />
            <Bar dataKey="מובנה" fill="#94a3b8" cursor="pointer" />
            <Bar dataKey="נוכחי" fill="#2563eb" cursor="pointer" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* התפלגות מורכבות הטיפול + התפלגות יישום לפי משפחה */}
      <div className="grid-2">
        <div className="card">
          <h3>התפלגות מורכבות הטיפול (לחיצה מציגה את הבקרות)</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={[
                { name: 'קל', value: d.complexity.easy, key: 'easy' },
                { name: 'בינוני', value: d.complexity.medium, key: 'medium' },
                { name: 'מורכב', value: d.complexity.complex, key: 'complex' },
                { name: 'לא דורג', value: d.complexity.none, key: 'none' },
              ].filter((e) => e.value > 0)} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label
                cursor="pointer" onClick={(e) => { const key = e?.key || e?.payload?.key; if (key && onComplexity) onComplexity(key); }}>
                {[
                  { key: 'easy', color: '#16a34a' }, { key: 'medium', color: '#eab308' },
                  { key: 'complex', color: '#dc2626' }, { key: 'none', color: '#94a3b8' },
                ].filter((e) => d.complexity[e.key] > 0).map((e, i) => <Cell key={i} fill={e.color} />)}
              </Pie>
              <Tooltip /><Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h3>התפלגות יישום הבקרות לפי משפחה (לחיצה לפתיחת משפחה)</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={d.statusByFamily.map((f) => ({ name: f.name, id: f.id, 'לא התחיל': f.not_started, 'בתהליך': f.in_progress, 'הושלם': f.completed }))}
              layout="vertical" margin={{ right: 10, left: 20 }}
              onClick={(e) => { const p = e?.activePayload?.[0]?.payload; if (p && onOpenFamily) onOpenFamily(p.id); }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" allowDecimals={false} /><YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10 }} />
              <Tooltip /><Legend />
              <Bar dataKey="לא התחיל" stackId="a" fill="#94a3b8" cursor="pointer" />
              <Bar dataKey="בתהליך" stackId="a" fill="#eab308" cursor="pointer" />
              <Bar dataKey="הושלם" stackId="a" fill="#16a34a" cursor="pointer" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* התקדמות טיפול לפי משפחה — פס לכל משפחה (לחיצה לפתיחת משפחה) */}
      <div className="card">
        <h3>התקדמות טיפול לפי משפחה (לחיצה לפתיחת משפחה)</h3>
        {d.statusByFamily.map((f) => {
          const total = f.not_started + f.in_progress + f.completed;
          const pct = weightedPct(f.completed, f.in_progress, total);
          return (
            <div key={f.id} className="fam-progress-row" onClick={() => onOpenFamily && onOpenFamily(f.id)}>
              <div className="nm" title={f.name}>{f.name}</div>
              <ProgressBar pct={pct} />
              <div className="ct">{f.completed}/{total} ({pct}%)</div>
            </div>
          );
        })}
        {!d.statusByFamily.length && <div className="muted">אין נתונים.</div>}
      </div>

      {/* סיכומים כלליים: סה"כ הערכה תקציבית + סה"כ שעות עבודה (זה לצד זה) */}
      <div className="grid-2">
        <div className="card">
          <h3>סה"כ שעות עבודה לכלל הסקר (לחיצה מציגה את הבקרות עם הערכה)</h3>
          <div className="kpi-grid">
            <div className="kpi ok" onClick={() => F('בקרות עם הערכת שעות עבודה', (c) => Number(c.workHours) > 0, WORK_HOURS)}>
              <div className="num">{Number(d.totalWorkHours || 0).toLocaleString('he-IL')}</div>
              <div className="lbl">סה"כ שעות — לחץ לצפייה</div>
            </div>
            {!d.totalWorkHours && <div className="muted">לא הוזנו הערכות שעות עבודה עדיין.</div>}
          </div>
        </div>

        <div className="card">
          <h3>סה"כ הערכה תקציבית לכלל הסקר (לחיצה מציגה את הבקרות עם תקציב)</h3>
          <div className="kpi-grid">
            {Object.entries(d.budgetByCurrency || {}).map(([cur, sum]) => (
              <div key={cur} className="kpi info" onClick={() => F(`בקרות עם הערכה תקציבית (${cur})`, (c) => !c.noCost && c.budgetEstimate > 0 && (c.budgetCurrency || 'ILS') === cur, BUDGET)}>
                <div className="num">{CUR_SYMBOL[cur] || ''}{Number(sum).toLocaleString('he-IL')}</div>
                <div className="lbl">סה"כ {cur} — לחץ לצפייה</div>
              </div>
            ))}
            {!Object.keys(d.budgetByCurrency || {}).length && <div className="muted">לא הוזנו הערכות תקציביות עדיין.</div>}
          </div>
        </div>
      </div>

      {/* משימות — תצוגת הנהלה + תצוגה אישית */}
      <div className="grid-2">
        <div className="card">
          <h3>ניהול משימות — תמונת הנהלה</h3>
          <div className="kpi-grid">
            <Kpi cls="high" num={d.tasks.byStatus.open} lbl="משימות פתוחות" />
            <Kpi cls="info" num={d.tasks.byStatus.in_progress} lbl="בתהליך" />
            <Kpi cls="ok" num={d.tasks.byStatus.closed} lbl="סגורות" />
          </div>
          <table className="tbl">
            <thead><tr><th>אחראי</th><th>פתוחות</th><th>בתהליך</th><th>סגורות</th><th>סה"כ</th></tr></thead>
            <tbody>
              {d.tasks.perUser.map((u, i) => (
                <tr key={i}><td>{u.user}</td><td>{u.open}</td><td>{u.in_progress}</td><td>{u.closed}</td><td>{u.total}</td></tr>
              ))}
              {!d.tasks.perUser.length && <tr><td colSpan={5} className="muted">אין משימות עדיין</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="card">
          {/* מנהל/אדמין רואה את כל המשימות, משתמש רגיל את שלו */}
          {(() => {
            const isManager = user?.role === 'management' || user?.role === 'admin';
            const list = isManager
              ? d.tasks.list
              : d.tasks.list.filter((t) => t.assignee?.username === user.username);
            return (
              <>
                <h3>{isManager
                  ? `כל המשימות בסקר (${list.length}) — לחיצה לפתיחת הבקרה`
                  : `המשימות שלי (${user.fullName || user.username})`}</h3>
                <table className="tbl">
                  <thead><tr><th>בקרה</th><th>משימה</th>{isManager && <th>אחראי</th>}<th>סטטוס</th></tr></thead>
                  <tbody>
                    {list.map((t) => (
                      <tr key={t.id} onClick={() => onOpenControl(t.control.id, 4)} style={{ cursor: 'pointer' }}>
                        <td>{t.control.name}</td><td>{t.description}</td>
                        {isManager && <td>{t.assignee ? (t.assignee.fullName || t.assignee.username) : '—'}</td>}
                        <td><span className={'pill lvl-' + (t.status === 'closed' ? 'נמוך' : t.status === 'in_progress' ? 'בינוני' : 'גבוה')}>{TASK_STATUS_HE[t.status]}</span></td>
                      </tr>
                    ))}
                    {!list.length && (
                      <tr><td colSpan={isManager ? 4 : 3} className="muted">{isManager ? 'אין משימות בסקר' : 'אין משימות המשויכות אליך'}</td></tr>
                    )}
                  </tbody>
                </table>
              </>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

function Kpi({ num, lbl, cls, onClick, title }) {
  return (
    <div className={'kpi ' + cls} onClick={onClick} title={title}
      style={{ cursor: onClick ? 'pointer' : 'default' }}>
      <div className="num">{num}</div>
      <div className="lbl">{lbl}</div>
    </div>
  );
}
