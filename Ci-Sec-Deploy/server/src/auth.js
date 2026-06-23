// ---------------------------------------------------------------------------
// auth.js — JWT, ניתוק לאחר 60 דק' חוסר פעילות (idle timeout), RBAC.
// ---------------------------------------------------------------------------
const jwt = require('jsonwebtoken');

// בסביבת production חובה JWT_SECRET אמיתי — אין fallback לסוד ידוע
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET חייב להיות מוגדר בסביבת production');
}
const JWT_SECRET = process.env.JWT_SECRET || 'dev-insecure-secret-change-me';
const IDLE_MIN = parseInt(process.env.SESSION_IDLE_MINUTES || '60', 10);

function sign(user) {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    { uid: user.id, username: user.username, role: user.role, networkId: user.networkId, last: now },
    JWT_SECRET,
    { expiresIn: '12h' }
  );
}

// בודק טוקן + idle timeout, ומנפיק טוקן מרוענן (sliding session)
function authenticate(req, res, next) {
  const hdr = req.headers.authorization || '';
  const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : req.cookies?.token;
  if (!token) return res.status(401).json({ error: 'לא מחובר' });
  try {
    const p = jwt.verify(token, JWT_SECRET);
    const now = Math.floor(Date.now() / 1000);
    if (now - (p.last || now) > IDLE_MIN * 60) {
      return res.status(401).json({ error: 'הסשן פג עקב חוסר פעילות' });
    }
    req.user = p;
    // ריענון חותמת הפעילות
    const fresh = sign({ id: p.uid, username: p.username, role: p.role, networkId: p.networkId });
    res.setHeader('X-Refresh-Token', fresh);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'טוקן לא תקין' });
  }
}

// בדיקת תפקיד
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'אין הרשאה לפעולה זו' });
    }
    next();
  };
}

// תפקידים שמותר להם לערוך (לא guest/management)
const canEdit = (req, res, next) => {
  if (['admin', 'users'].includes(req.user.role)) return next();
  return res.status(403).json({ error: 'אין הרשאת עריכה' });
};

module.exports = { sign, authenticate, requireRole, canEdit, JWT_SECRET, IDLE_MIN };
