import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

// צירוף הטוקן + טיפול בריענון sliding session
api.interceptors.request.use((cfg) => {
  const t = localStorage.getItem('token');
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

api.interceptors.response.use(
  (res) => {
    const fresh = res.headers['x-refresh-token'];
    if (fresh) localStorage.setItem('token', fresh);
    return res;
  },
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      if (!location.hash.includes('login')) window.dispatchEvent(new Event('cisec-logout'));
    }
    return Promise.reject(err);
  }
);

export default api;

export const LEVEL_COLORS = {
  'נמוך': '#16a34a', 'בינוני': '#eab308', 'גבוה': '#f97316', 'קריטי': '#dc2626', 'לא הוערך': '#94a3b8',
};
export const STATUS_HE = { not_started: 'לא התחיל', in_progress: 'בתהליך', completed: 'הושלם' };
export const TASK_STATUS_HE = { open: 'פתוחה', in_progress: 'בתהליך', closed: 'סגורה' };
export const DECISION_HE = { reduce: 'הפחתת סיכון', transfer: 'העברת הסיכון', accept: 'קבלת הסיכון', avoid: 'הימנעות מהסיכון', none: 'לא הוחלט' };
export const ETA_HE = { days: 'ימים', weeks: 'שבועות', months: 'חודשים', year: 'שנה' };
