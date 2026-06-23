import React, { useEffect, useState } from 'react';
import api, { STATUS_HE } from '../api';

const lvlClass = (l) => 'pill lvl-' + (l || 'none');

export default function FamilyView({ surveyId, familyId, onOpenControl }) {
  const [controls, setControls] = useState([]);
  const [family, setFamily] = useState(null);

  useEffect(() => { (async () => {
    const [c, s] = await Promise.all([
      api.get(`/surveys/${surveyId}/controls`),
      api.get(`/surveys/${surveyId}`),
    ]);
    setControls(c.data.filter((x) => x.familyId === Number(familyId)));
    setFamily(s.data.families.find((f) => f.id === Number(familyId)));
  })(); }, [surveyId, familyId]);

  return (
    <div>
      <h2 className="page-title">{family?.name || 'משפחת בקרה'}</h2>
      <p className="page-sub">{controls.length} בקרות · לחיצה על שורה פותחת את חלון הבקרה</p>
      <div className="card" style={{ padding: 0, overflow: 'auto', maxHeight: '72vh' }}>
        <table className="tbl">
          <thead><tr>
            <th>קוד</th><th>שם הבקרה</th><th>תרחיש איום/סיכון</th>
            <th>ציון מובנה</th><th>רמה</th><th>סיכון נוכחי</th><th>סטטוס</th><th>נתונים</th><th>רלוונטיות</th>
          </tr></thead>
          <tbody>
            {controls.map((c) => (
              <tr key={c.id} onClick={() => onOpenControl(c.id)}>
                <td>{c.controlCode || c.id}</td>
                <td>{c.name}</td>
                <td style={{ maxWidth: 240, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.threatScenario || '—'}</td>
                <td>{c.inherentScore ?? '—'}</td>
                <td><span className={lvlClass(c.inherentLevel)}>{c.inherentLevel || 'לא הוערך'}</span></td>
                <td><span className={lvlClass(c.currentLevel)}>{c.currentLevel || 'לא הוערך'}</span></td>
                <td>{STATUS_HE[c.status]}</td>
                <td>{c.incomplete
                  ? <span className="tag-nr" title={'חסר: ' + (c.missingFields || []).join(', ')}>⚠ חסרים</span>
                  : (c.notRelevant ? '—' : <span className="pill lvl-נמוך">מלא</span>)}</td>
                <td>{c.notRelevant ? <span className="tag-nr">לא רלוונטי</span> : 'רלוונטי'}</td>
              </tr>
            ))}
            {!controls.length && <tr><td colSpan={9} className="muted">אין בקרות במשפחה זו</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
