import React, { useEffect, useState } from 'react';
import api from '../api';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell,
} from 'recharts';

// התקדמות משוקללת: הושלם=100%, בתהליך=50%, לא התחיל=0%
const wPct = (completed, inProgress, total) =>
  total ? Math.round((completed * 100 + (inProgress || 0) * 50) / total) : 0;

// דשבורד-על: איחוד מדדים מכל הסקרים, בהפרדה פר סקר
export default function OverviewDashboard({ onOpenSurvey }) {
  const [data, setData] = useState(null);
  useEffect(() => { api.get('/overview').then((r) => setData(r.data)); }, []);
  if (!data) return <div className="muted">טוען נתונים…</div>;
  const { surveys, totals } = data;

  const critData = surveys.map((s) => ({ name: `${s.name} (${s.network})`, קריטי: s.kpi.criticalCurrent, גבוה: s.kpi.highCurrent, id: s.id }));
  const compData = surveys.map((s) => ({ name: s.name, 'הושלמו %': s.completionPct, id: s.id }));

  return (
    <div>
      <h2 className="page-title">דשבורד — מבט-על על כל הסקרים</h2>
      <p className="page-sub">איחוד {totals.surveys} סקרים · השוואה והפרדה פר סקר</p>

      {/* KPI מצרפי */}
      <div className="kpi-grid">
        <Kpi cls="info" num={totals.surveys} lbl="סקרים פעילים" />
        <Kpi cls="info" num={totals.relevant} lbl="בקרות רלוונטיות (סה״כ)" />
        <Kpi cls="crit" num={totals.critical} lbl="חשיפה קריטית (סה״כ)" />
        <Kpi cls="high" num={totals.high} lbl="חשיפה גבוהה (סה״כ)" />
        <Kpi cls="ok" num={totals.completed} lbl="בקרות שהושלמו" />
        <Kpi cls="high" num={totals.open} lbl="בקרות פתוחות" />
        <Kpi cls="crit" num={totals.incomplete} lbl="בקרות עם נתונים חסרים" />
      </div>

      <div className="grid-2">
        <div className="card">
          <h3>חשיפה קריטית/גבוהה לפי סקר</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={critData} margin={{ left: 10, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 9 }} interval={0} angle={-12} textAnchor="end" height={60} />
              <YAxis allowDecimals={false} /><Tooltip /><Legend />
              <Bar dataKey="קריטי" fill="#dc2626" cursor="pointer" onClick={(e) => e && onOpenSurvey(e.id)} />
              <Bar dataKey="גבוה" fill="#f97316" cursor="pointer" onClick={(e) => e && onOpenSurvey(e.id)} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="card">
          <h3>אחוז השלמת טיפול לפי סקר</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={compData} layout="vertical" margin={{ left: 30, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" domain={[0, 100]} unit="%" />
              <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10 }} />
              <Tooltip /><Bar dataKey="הושלמו %" cursor="pointer" onClick={(e) => e && onOpenSurvey(e.id)}>
                {compData.map((c, i) => <Cell key={i} fill={c['הושלמו %'] >= 75 ? '#16a34a' : c['הושלמו %'] >= 40 ? '#eab308' : '#dc2626'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* טבלת השוואה פר סקר */}
      <div className="card" style={{ padding: 0, overflow: 'auto' }}>
        <table className="tbl">
          <thead><tr>
            <th>רשת</th><th>סקר</th><th>גרסה</th><th>בקרות</th><th>קריטי</th><th>גבוה</th>
            <th>ציון נוכחי ממוצע</th><th>הושלמו</th><th>פתוחות</th><th>חסרי נתונים</th><th style={{ minWidth: 140 }}>התקדמות טיפול</th><th></th>
          </tr></thead>
          <tbody>
            {surveys.map((s) => {
              const pct = wPct(s.kpi.completed, s.kpi.inProgress, s.kpi.relevantControls);
              return (
              <tr key={s.id} onClick={() => onOpenSurvey(s.id)}>
                <td>{s.network}</td><td>{s.name}</td><td>{s.version}</td>
                <td>{s.kpi.relevantControls}</td>
                <td>{s.kpi.criticalCurrent > 0 ? <span className="pill lvl-קריטי">{s.kpi.criticalCurrent}</span> : 0}</td>
                <td>{s.kpi.highCurrent > 0 ? <span className="pill lvl-גבוה">{s.kpi.highCurrent}</span> : 0}</td>
                <td>{s.kpi.avgCurrent}</td>
                <td>{s.kpi.completed}</td><td>{s.kpi.open}</td><td>{s.kpi.incomplete}</td>
                <td>
                  <div className="flex" style={{ gap: 6 }}>
                    <div className="progress-track" style={{ flex: 1 }}>
                      <div className="progress-fill" style={{ width: pct + '%', background: pct >= 75 ? '#16a34a' : pct >= 40 ? '#f59e0b' : '#dc2626' }} />
                    </div>
                    <b style={{ fontSize: 12 }}>{pct}%</b>
                  </div>
                </td>
                <td><button className="btn">פתח →</button></td>
              </tr>
            ); })}
            {!surveys.length && <tr><td colSpan={12} className="muted">אין סקרים</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Kpi({ num, lbl, cls }) {
  return <div className={'kpi ' + cls}><div className="num">{num}</div><div className="lbl">{lbl}</div></div>;
}
