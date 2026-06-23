import React, { useEffect, useState } from 'react';
import api, { STATUS_HE } from '../api';

const lvlClass = (l) => 'pill lvl-' + (l || 'none');

// תצוגת תוצאות גנרית (חיפוש / לחיצה על מפת חום) — מסננת את בקרות הסקר
export default function ResultsView({ surveyId, title, filter, families = [], onOpenControl }) {
  const [all, setAll] = useState([]);
  useEffect(() => { api.get(`/surveys/${surveyId}/controls`).then((r) => setAll(r.data)); }, [surveyId]);
  const famName = {}; families.forEach((f) => (famName[f.id] = f.name));
  const rows = all.filter(filter).map((c) => ({ ...c, familyName: famName[c.familyId] }));
  return (
    <div>
      <h2 className="page-title">{title}</h2>
      <p className="page-sub">{rows.length} תוצאות · לחיצה פותחת את חלון הבקרה</p>
      <div className="card" style={{ padding: 0, overflow: 'auto', maxHeight: '74vh' }}>
        <table className="tbl">
          <thead><tr><th>קוד</th><th>שם הבקרה</th><th>משפחה</th><th>ציון מובנה</th><th>רמה</th><th>סטטוס</th></tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} onClick={() => onOpenControl(c.id)}>
                <td>{c.controlCode || c.id}</td>
                <td>{c.name}</td>
                <td>{c.familyName || '—'}</td>
                <td>{c.inherentScore ?? '—'}</td>
                <td><span className={lvlClass(c.inherentLevel)}>{c.inherentLevel || 'לא הוערך'}</span></td>
                <td>{STATUS_HE[c.status]}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={6} className="muted">אין תוצאות</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
