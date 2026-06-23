import React, { useEffect, useState } from 'react';
import api from '../api';

// מסך בחירה בכניסה: לאיזו רשת ולאיזה סקר להיכנס
export default function SurveyPicker({ user, onPick, onCreateNew }) {
  const [networks, setNetworks] = useState([]);
  const [networkId, setNetworkId] = useState('');
  const [surveys, setSurveys] = useState([]);
  const [surveyId, setSurveyId] = useState('');

  useEffect(() => { api.get('/networks').then((r) => {
    setNetworks(r.data);
    if (r.data[0]) setNetworkId(String(r.data[0].id));
  }); }, []);

  useEffect(() => {
    if (!networkId) { setSurveys([]); return; }
    api.get('/surveys', { params: { networkId } }).then((r) => {
      setSurveys(r.data); setSurveyId(r.data[0] ? String(r.data[0].id) : '');
    });
  }, [networkId]);

  const canEdit = ['admin', 'users'].includes(user.role);

  return (
    <div className="login-wrap">
      <div className="login-card" style={{ width: 440 }}>
        <h1>Ci-Sec</h1>
        <p>בחר רשת וסקר להתחלת העבודה</p>
        <div className="field">
          <label>רשת</label>
          <select value={networkId} onChange={(e) => setNetworkId(e.target.value)}>
            {!networks.length && <option value="">אין רשתות</option>}
            {networks.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label>סקר</label>
          <select value={surveyId} onChange={(e) => setSurveyId(e.target.value)}>
            {!surveys.length && <option value="">אין סקרים ברשת זו</option>}
            {surveys.map((s) => <option key={s.id} value={s.id}>{`${s.name} - גרסה ${s.version ?? 1} - ${s._count?.controls ?? 0} בקרות`}</option>)}
          </select>
        </div>
        <button className="btn btn-primary btn-block" disabled={!surveyId} onClick={() => onPick(Number(surveyId))}>כניסה לסקר</button>
        {canEdit && <button className="btn btn-block" style={{ marginTop: 10 }} onClick={onCreateNew}>➕ צור סקר חדש</button>}
      </div>
    </div>
  );
}
