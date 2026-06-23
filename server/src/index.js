// ---------------------------------------------------------------------------
// Ci-Sec API — Express + Prisma
// ---------------------------------------------------------------------------
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const cron = require('node-cron');

const prisma = require('./prisma');
const { sign, authenticate, requireRole, canEdit } = require('./auth');
const { aggregate, enrich } = require('./risk');
const { getCatalog } = require('./catalog');
const { populateSurvey, cloneSurvey } = require('./survey');
const backup = require('./backup');
const { exportSurvey } = require('./excel');

const app = express();
app.set('trust proxy', true); // מאחורי nginx — req.ip מ-X-Forwarded-For
app.use(cors({ exposedHeaders: ['X-Refresh-Token'] }));
app.use(express.json({ limit: '100mb' }));
app.use(cookieParser());

const audit = (userName, action, detail) =>
  prisma.auditLog.create({ data: { userName, action, detail: detail ? String(detail).slice(0, 2000) : null } }).catch(() => {});

const wrap = (fn) => (req, res) => fn(req, res).catch((e) => {
  // שגיאות מכוונות (עם status) מוחזרות כפי שהן; שאר השגיאות גנריות (ללא חשיפת פנים)
  if (e && e.status) return res.status(e.status).json({ error: e.message });
  console.error(e);
  res.status(500).json({ error: 'שגיאת שרת' });
});

const httpErr = (status, message) => { const e = new Error(message); e.status = status; return e; };

// בדיקת גישת משתמש מסוג users לרשת מסוימת
async function assertNetworkAccess(req, networkId) {
  if (req.user.role === 'users' && req.user.networkId && req.user.networkId !== networkId) {
    throw httpErr(403, 'אין גישה לרשת זו');
  }
}

// resolvers לאכיפת גישת רשת לפי מזהה משאב (מניעת IDOR)
async function assertSurvey(req, surveyId) {
  const s = await prisma.survey.findUnique({ where: { id: surveyId }, select: { networkId: true } });
  if (!s) throw httpErr(404, 'סקר לא נמצא');
  await assertNetworkAccess(req, s.networkId);
  return s.networkId;
}
async function assertControl(req, controlId) {
  const c = await prisma.control.findUnique({ where: { id: controlId }, select: { survey: { select: { networkId: true } } } });
  if (!c) throw httpErr(404, 'בקרה לא נמצאה');
  await assertNetworkAccess(req, c.survey.networkId);
}
async function assertFamily(req, familyId) {
  const f = await prisma.family.findUnique({ where: { id: familyId }, select: { surveyId: true, survey: { select: { networkId: true } } } });
  if (!f) throw httpErr(404, 'משפחה לא נמצאה');
  await assertNetworkAccess(req, f.survey.networkId);
  return f.surveyId;
}
async function assertTask(req, taskId) {
  const t = await prisma.task.findUnique({ where: { id: taskId }, select: { control: { select: { survey: { select: { networkId: true } } } } } });
  if (!t) throw httpErr(404, 'משימה לא נמצאה');
  await assertNetworkAccess(req, t.control.survey.networkId);
}
async function assertMitigationAction(req, actionId) {
  const a = await prisma.mitigationAction.findUnique({ where: { id: actionId }, select: { controlId: true, control: { select: { survey: { select: { networkId: true } } } } } });
  if (!a) throw httpErr(404, 'פעולת מיטיגציה לא נמצאה');
  await assertNetworkAccess(req, a.control.survey.networkId);
  return a.controlId;
}

// =========================================================================
// Health
// =========================================================================
app.get('/api/health', (req, res) => res.json({ ok: true }));

// =========================================================================
// Auth
// =========================================================================
// הגבלת קצב התחברות (in-memory) — מניעת brute-force. 10 כשלונות / 5 דק' לכל IP+משתמש
const loginAttempts = new Map();
const LOGIN_MAX = 10, LOGIN_WINDOW_MS = 5 * 60 * 1000;
function loginThrottle(req) {
  const key = `${req.ip}|${String(req.body?.username || '').trim().toLowerCase()}`;
  const now = Date.now();
  const rec = loginAttempts.get(key);
  if (rec && now - rec.first < LOGIN_WINDOW_MS && rec.count >= LOGIN_MAX) {
    throw httpErr(429, 'יותר מדי ניסיונות התחברות. נסה שוב בעוד מספר דקות.');
  }
  return key;
}
function loginFail(key) {
  const now = Date.now();
  const rec = loginAttempts.get(key);
  if (!rec || now - rec.first >= LOGIN_WINDOW_MS) loginAttempts.set(key, { first: now, count: 1 });
  else rec.count++;
}
// ניקוי תקופתי של רשומות ישנות
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of loginAttempts) if (now - v.first >= LOGIN_WINDOW_MS) loginAttempts.delete(k);
}, LOGIN_WINDOW_MS).unref?.();

app.post('/api/auth/login', wrap(async (req, res) => {
  const throttleKey = loginThrottle(req);
  const { username, password } = req.body;
  const user = await prisma.user.findUnique({ where: { username: String(username || '').trim() } });
  if (!user || !(await bcrypt.compare(String(password || ''), user.passwordHash))) {
    loginFail(throttleKey);
    return res.status(401).json({ error: 'שם משתמש או סיסמה שגויים' });
  }
  if (!user.isActive) return res.status(403).json({ error: 'המשתמש מבוטל. פנה למנהל המערכת.' });
  loginAttempts.delete(throttleKey); // איפוס מונה לאחר הצלחה
  await prisma.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } });
  await audit(user.username, 'login');
  res.json({
    token: sign(user),
    user: { id: user.id, username: user.username, role: user.role, fullName: user.fullName, networkId: user.networkId, mustChangePwd: user.mustChangePwd },
  });
}));

app.get('/api/auth/me', authenticate, wrap(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.uid } });
  if (!user) return res.status(401).json({ error: 'משתמש לא קיים' });
  res.json({ id: user.id, username: user.username, role: user.role, fullName: user.fullName, networkId: user.networkId, mustChangePwd: user.mustChangePwd });
}));

app.post('/api/auth/logout', authenticate, wrap(async (req, res) => {
  await audit(req.user.username, 'logout');
  res.json({ ok: true });
}));

// מדיניות סיסמה: מינימום 10 תווים
const MIN_PWD_LEN = 10;
const validatePwd = (pwd) => String(pwd || '').length >= MIN_PWD_LEN;

// כל משתמש יכול לשנות את הסיסמה של עצמו
app.post('/api/auth/change-password', authenticate, wrap(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = await prisma.user.findUnique({ where: { id: req.user.uid } });
  if (!user || !(await bcrypt.compare(String(currentPassword || ''), user.passwordHash))) {
    return res.status(400).json({ error: 'הסיסמה הנוכחית שגויה' });
  }
  if (!validatePwd(newPassword)) return res.status(400).json({ error: `סיסמה חייבת לפחות ${MIN_PWD_LEN} תווים` });
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(newPassword, 10), mustChangePwd: false } });
  await audit(user.username, 'change_password');
  res.json({ ok: true });
}));

// =========================================================================
// Users (admin)
// =========================================================================
app.get('/api/users', authenticate, requireRole('admin'), wrap(async (req, res) => {
  const users = await prisma.user.findMany({
    select: { id: true, username: true, role: true, fullName: true, networkId: true, createdAt: true, lastLogin: true, isActive: true },
    orderBy: { id: 'asc' },
  });
  res.json(users);
}));

// רשימת משתמשים בסיסית — לכל משתמש מאומת (לאחראי משימה / RACI)
app.get('/api/users/basic', authenticate, wrap(async (req, res) => {
  const users = await prisma.user.findMany({
    select: { id: true, username: true, fullName: true },
    orderBy: { username: 'asc' },
  });
  res.json(users);
}));

app.post('/api/users', authenticate, requireRole('admin'), wrap(async (req, res) => {
  const { username, password, role, fullName, networkId } = req.body;
  if (!username || !password || !role) return res.status(400).json({ error: 'חסרים שדות חובה' });
  if (!validatePwd(password)) return res.status(400).json({ error: `סיסמה חייבת לפחות ${MIN_PWD_LEN} תווים` });
  if (!['admin', 'users', 'management', 'guest'].includes(role)) return res.status(400).json({ error: 'קבוצה לא תקינה' });
  const exists = await prisma.user.findUnique({ where: { username } });
  if (exists) return res.status(400).json({ error: 'שם משתמש כבר קיים' });
  // עבור users: networkId מספרי = רשת ספציפית, ריק/all = כל הרשתות (null)
  const netId = role === 'users' && networkId && networkId !== 'all' ? Number(networkId) : null;
  const user = await prisma.user.create({
    data: {
      username: String(username).trim(),
      passwordHash: await bcrypt.hash(String(password), 10),
      role, fullName: fullName || null,
      networkId: netId,
      mustChangePwd: true, // המשתמש יידרש לשנות את הסיסמה הראשונית בכניסה
    },
  });
  await audit(req.user.username, 'create_user', username);
  res.json({ id: user.id });
}));

app.put('/api/users/:id', authenticate, requireRole('admin'), wrap(async (req, res) => {
  const id = Number(req.params.id);
  const { role, fullName, networkId, password, isActive } = req.body;
  const data = {};
  if (role) data.role = role;
  if (fullName !== undefined) data.fullName = fullName;
  if (networkId !== undefined) data.networkId = (networkId && networkId !== 'all') ? Number(networkId) : null;
  if (isActive !== undefined) data.isActive = !!isActive;
  // איפוס סיסמה ע"י אדמין — מזין סיסמה ראשונית והמשתמש יידרש לשנותה בכניסה
  if (password) {
    if (!validatePwd(password)) return res.status(400).json({ error: `סיסמה חייבת לפחות ${MIN_PWD_LEN} תווים` });
    data.passwordHash = await bcrypt.hash(String(password), 10); data.mustChangePwd = true;
  }
  const target = await prisma.user.findUnique({ where: { id } });
  if (target?.username === 'admin' && isActive === false) return res.status(400).json({ error: 'לא ניתן לבטל את אדמין המערכת' });
  await prisma.user.update({ where: { id }, data });
  await audit(req.user.username, 'update_user', id);
  res.json({ ok: true });
}));

app.delete('/api/users/:id', authenticate, requireRole('admin'), wrap(async (req, res) => {
  const id = Number(req.params.id);
  const target = await prisma.user.findUnique({ where: { id } });
  if (target?.username === 'admin') return res.status(400).json({ error: 'לא ניתן למחוק את אדמין המערכת' });
  await prisma.user.delete({ where: { id } });
  await audit(req.user.username, 'delete_user', id);
  res.json({ ok: true });
}));

// =========================================================================
// Networks
// =========================================================================
app.get('/api/networks', authenticate, wrap(async (req, res) => {
  let where = {};
  if (req.user.role === 'users' && req.user.networkId) where = { id: req.user.networkId };
  const nets = await prisma.network.findMany({ where, orderBy: { name: 'asc' } });
  res.json(nets);
}));

app.post('/api/networks', authenticate, requireRole('admin'), wrap(async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'חסר שם רשת' });
  const net = await prisma.network.create({ data: { name: String(name).trim() } });
  await audit(req.user.username, 'create_network', name);
  res.json(net);
}));

// מחיקת רשת — מוחקת את כל הסקרים שתחתיה (cascade) ומנתקת משתמשים משויכים
app.delete('/api/networks/:id', authenticate, requireRole('admin'), wrap(async (req, res) => {
  const id = Number(req.params.id);
  await prisma.user.updateMany({ where: { networkId: id }, data: { networkId: null } });
  await prisma.network.delete({ where: { id } });
  await audit(req.user.username, 'delete_network', id);
  res.json({ ok: true });
}));

// =========================================================================
// Surveys
// =========================================================================
app.get('/api/surveys', authenticate, wrap(async (req, res) => {
  const networkId = req.query.networkId ? Number(req.query.networkId) : undefined;
  let where = {};
  if (networkId) where.networkId = networkId;
  if (req.user.role === 'users' && req.user.networkId) where.networkId = req.user.networkId;
  const surveys = await prisma.survey.findMany({
    where, orderBy: [{ networkId: 'asc' }, { name: 'asc' }, { version: 'asc' }],
    include: { network: true, _count: { select: { controls: true } } },
  });
  res.json(surveys);
}));

// יצירת סקר חדש (כל משתמש שעורך) — מאכלס 12 משפחות + כל הבקרות
app.post('/api/surveys', authenticate, canEdit, wrap(async (req, res) => {
  const { networkId, name } = req.body;
  const scope = req.body.scope === 'reduced' ? 'reduced' : 'expanded';
  if (!networkId || !name) return res.status(400).json({ error: 'חובה לבחור רשת ולהזין שם סקר' });
  await assertNetworkAccess(req, Number(networkId));
  const survey = await prisma.survey.create({
    data: { name: String(name).trim(), networkId: Number(networkId), version: 1, createdBy: req.user.username },
  });
  await populateSurvey(survey.id, scope);
  await audit(req.user.username, 'create_survey', `${name} (${scope})`);
  res.json(survey);
}));

// יצירת גרסה עוקבת — עם תיאור גרסה אופציונלי
app.post('/api/surveys/:id/version', authenticate, canEdit, wrap(async (req, res) => {
  const id = Number(req.params.id);
  const src = await prisma.survey.findUnique({ where: { id } });
  if (!src) return res.status(404).json({ error: 'סקר לא נמצא' });
  await assertNetworkAccess(req, src.networkId);
  const description = req.body?.description ? String(req.body.description).trim().slice(0, 2000) : null;
  const ns = await cloneSurvey(id, req.user.username, description);
  await audit(req.user.username, 'create_version', ns.name);
  res.json(ns);
}));

// מחיקת סקר — admin מוחק כל סקר; משתמשים אחרים רק את הסקרים שיצרו
app.delete('/api/surveys/:id', authenticate, wrap(async (req, res) => {
  const id = Number(req.params.id);
  const s = await prisma.survey.findUnique({ where: { id } });
  if (!s) return res.status(404).json({ error: 'סקר לא נמצא' });
  await assertNetworkAccess(req, s.networkId);
  const isAdmin = req.user.role === 'admin';
  const isCreator = s.createdBy && s.createdBy === req.user.username;
  if (!isAdmin && !isCreator) return res.status(403).json({ error: 'רק אדמין או יוצר הסקר רשאי למחוק' });
  await prisma.survey.delete({ where: { id } }); // cascade -> families, controls, tasks, notes, raci, mitigationActions
  await audit(req.user.username, 'delete_survey', `${s.name} (v${s.version})`);
  res.json({ ok: true });
}));

// טעינת סקר מלא
app.get('/api/surveys/:id', authenticate, wrap(async (req, res) => {
  const id = Number(req.params.id);
  const survey = await prisma.survey.findUnique({
    where: { id },
    include: { network: true, families: { orderBy: { order: 'asc' }, include: { _count: { select: { controls: true } } } } },
  });
  if (!survey) return res.status(404).json({ error: 'סקר לא נמצא' });
  await assertNetworkAccess(req, survey.networkId);
  res.json(survey);
}));

// כל הבקרות של סקר
app.get('/api/surveys/:id/controls', authenticate, wrap(async (req, res) => {
  const id = Number(req.params.id);
  await assertSurvey(req, id);
  const controls = await prisma.control.findMany({ where: { surveyId: id }, orderBy: { id: 'asc' }, include: { mitigationActions: { select: { done: true } } } });
  res.json(controls.map(enrich));
}));

// דשבורד מנהלים — אגרגציה
app.get('/api/surveys/:id/dashboard', authenticate, wrap(async (req, res) => {
  const id = Number(req.params.id);
  const survey = await prisma.survey.findUnique({ where: { id }, include: { network: true } });
  if (!survey) return res.status(404).json({ error: 'סקר לא נמצא' });
  await assertNetworkAccess(req, survey.networkId);
  const families = await prisma.family.findMany({ where: { surveyId: id }, orderBy: { order: 'asc' } });
  const controls = await prisma.control.findMany({ where: { surveyId: id }, include: { mitigationActions: { select: { done: true } } } });
  const agg = aggregate(controls, families);
  // משימות לתצוגת הנהלה + לכל משתמש
  const tasks = await prisma.task.findMany({
    where: { control: { surveyId: id } },
    include: { assignee: { select: { id: true, username: true, fullName: true } }, control: { select: { id: true, name: true, familyId: true } } },
  });
  const taskStatus = { open: 0, in_progress: 0, closed: 0 };
  const perUser = {};
  tasks.forEach((t) => {
    taskStatus[t.status] = (taskStatus[t.status] || 0) + 1;
    const key = t.assignee?.username || 'לא משויך';
    perUser[key] = perUser[key] || { user: t.assignee?.fullName || key, open: 0, in_progress: 0, closed: 0, total: 0 };
    perUser[key][t.status]++; perUser[key].total++;
  });
  res.json({ survey, ...agg, tasks: { byStatus: taskStatus, perUser: Object.values(perUser), list: tasks } });
}));

// דשבורד-על — איחוד מדדים מכל הסקרים, בהפרדה פר סקר
app.get('/api/overview', authenticate, wrap(async (req, res) => {
  let where = {};
  if (req.user.role === 'users' && req.user.networkId) where.networkId = req.user.networkId;
  const surveys = await prisma.survey.findMany({
    where, include: { network: true }, orderBy: [{ networkId: 'asc' }, { name: 'asc' }, { version: 'asc' }],
  });
  const rows = [];
  for (const s of surveys) {
    const families = await prisma.family.findMany({ where: { surveyId: s.id } });
    const controls = await prisma.control.findMany({ where: { surveyId: s.id }, include: { mitigationActions: { select: { done: true } } } });
    const agg = aggregate(controls, families);
    const completionPct = agg.kpi.relevantControls ? Math.round((agg.kpi.completed / agg.kpi.relevantControls) * 100) : 0;
    rows.push({
      id: s.id, name: s.name, version: s.version, network: s.network?.name,
      kpi: agg.kpi, completionPct,
      levelsCurrent: agg.levels.current,
      budgetByCurrency: agg.budgetByCurrency,
    });
  }
  // צבירה כוללת
  const totals = rows.reduce((t, r) => {
    t.relevant += r.kpi.relevantControls; t.critical += r.kpi.criticalCurrent; t.high += r.kpi.highCurrent;
    t.completed += r.kpi.completed; t.open += r.kpi.open; t.incomplete += r.kpi.incomplete;
    return t;
  }, { relevant: 0, critical: 0, high: 0, completed: 0, open: 0, incomplete: 0, surveys: rows.length });
  res.json({ surveys: rows, totals });
}));

// יצוא לאקסל
app.get('/api/surveys/:id/export', authenticate, wrap(async (req, res) => {
  const id = Number(req.params.id);
  const survey = await prisma.survey.findUnique({ where: { id } });
  if (!survey) return res.status(404).json({ error: 'סקר לא נמצא' });
  await assertNetworkAccess(req, survey.networkId);
  const families = await prisma.family.findMany({ where: { surveyId: id } });
  const controls = await prisma.control.findMany({
    where: { surveyId: id },
    orderBy: { id: 'asc' },
    include: {
      mitigationActions: { orderBy: { order: 'asc' } },
      tasks: { include: { assignee: { select: { username: true, fullName: true } } }, orderBy: { id: 'asc' } },
    },
  });
  const buf = await exportSurvey(survey, families, controls);
  await audit(req.user.username, 'export_excel', survey.name);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="cisec-${id}.xlsx"`);
  res.send(Buffer.from(buf));
}));

// =========================================================================
// Families & Controls (create custom / edit)
// =========================================================================
app.post('/api/surveys/:id/families', authenticate, canEdit, wrap(async (req, res) => {
  const surveyId = Number(req.params.id);
  await assertSurvey(req, surveyId);
  const { name, code } = req.body;
  if (!name) return res.status(400).json({ error: 'חסר שם משפחה' });
  const max = await prisma.family.aggregate({ where: { surveyId }, _max: { order: true } });
  const fam = await prisma.family.create({
    data: { surveyId, name: String(name).trim(), code: code || 'CUSTOM', order: (max._max.order || 0) + 1, isCustom: true },
  });
  await audit(req.user.username, 'create_family', name);
  res.json(fam);
}));

app.post('/api/families/:id/controls', authenticate, canEdit, wrap(async (req, res) => {
  const familyId = Number(req.params.id);
  const fam = await prisma.family.findUnique({ where: { id: familyId } });
  if (!fam) return res.status(404).json({ error: 'משפחה לא נמצאה' });
  await assertSurvey(req, fam.surveyId);
  const c = req.body || {};
  const control = await prisma.control.create({
    data: {
      surveyId: fam.surveyId, familyId,
      name: String(c.name || 'בקרה חדשה').trim(),
      controlCode: c.controlCode || null, description: c.description || null,
      threatScenario: c.threatScenario || null, mitigation: c.mitigation || null,
      domain: c.domain || null, executor: c.executor || null,
      isCustom: true,
    },
  });
  await audit(req.user.username, 'create_control', control.name);
  res.json(enrich(control));
}));

app.get('/api/controls/:id', authenticate, wrap(async (req, res) => {
  const id = Number(req.params.id);
  await assertControl(req, id);
  const c = await prisma.control.findUnique({
    where: { id },
    include: {
      family: true,
      raciEntries: { include: { user: { select: { id: true, username: true, fullName: true } } } },
      tasks: { include: { notes: { orderBy: { createdAt: 'asc' } }, assignee: { select: { id: true, username: true, fullName: true } } }, orderBy: { id: 'asc' } },
      mitigationActions: { orderBy: { order: 'asc' } },
    },
  });
  if (!c) return res.status(404).json({ error: 'בקרה לא נמצאה' });
  res.json({ ...enrich(c), family: c.family, raciEntries: c.raciEntries, tasks: c.tasks, mitigationActions: c.mitigationActions });
}));

const CONTROL_FIELDS = [
  'name', 'controlCode', 'description', 'domain', 'isProcedural', 'executor', 'targetLevel', 'actualLevel',
  'nistSource', 'isoMapping', 'csfMapping', 'notesImpl', 'evidence', 'threatScenario', 'probability', 'impact',
  'resProbability', 'resImpact', 'mitigation', 'nistMitigation', 'status', 'mgmtDecision', 'responsibleR',
  'notRelevant', 'budgetEstimate', 'budgetCurrency', 'budgetNotes', 'noCost', 'complexity', 'complexityNotes',
  'workHours', 'workHoursNotes',
];

// snapshot של ה-KPI הנוכחי (avgCurrent, riskReductionPct).
// dedup חכם: דילוג רק אם ערכים זהים *וגם* פחות מ-30 שניות מאז הרשומה הקודמת
// (מונע ספאם מהקלקות מהירות, אבל מאפשר "heartbeat" כל פעם שעובר זמן).
async function recordKpiSnapshot(surveyId) {
  try {
    const families = await prisma.family.findMany({ where: { surveyId } });
    const controls = await prisma.control.findMany({
      where: { surveyId },
      include: { mitigationActions: { select: { done: true } } },
    });
    const agg = aggregate(controls, families);
    const avgCurrent = Number(agg.kpi.avgCurrent) || 0;
    const riskReductionPct = Number(agg.kpi.riskReductionPct) || 0;
    const last = await prisma.kpiSnapshot.findFirst({ where: { surveyId }, orderBy: { recordedAt: 'desc' } });
    if (last && last.avgCurrent === avgCurrent && last.riskReductionPct === riskReductionPct) {
      const elapsedMs = Date.now() - new Date(last.recordedAt).getTime();
      if (elapsedMs < 30 * 1000) return; // פחות מ-30 שניות וזהה -> לא נרשום שוב
    }
    await prisma.kpiSnapshot.create({ data: { surveyId, avgCurrent, riskReductionPct } });
  } catch (e) {
    console.error('[kpi-snapshot] failed:', e.message);
  }
}

app.put('/api/controls/:id', authenticate, canEdit, wrap(async (req, res) => {
  const id = Number(req.params.id);
  await assertControl(req, id);
  const data = {};
  for (const f of CONTROL_FIELDS) if (f in req.body) data[f] = req.body[f];
  if ('dueDate' in req.body) data.dueDate = req.body.dueDate ? new Date(req.body.dueDate) : null;
  // נורמליזציה של מספרים
  ['probability', 'impact', 'resProbability', 'resImpact'].forEach((k) => {
    if (k in data) {
      const v = data[k] === '' || data[k] == null ? null : Number(data[k]);
      data[k] = v == null ? null : Math.max(1, Math.min(4, v)); // סולם 1-4
    }
  });
  if ('budgetEstimate' in data) data.budgetEstimate = data.budgetEstimate === '' || data.budgetEstimate == null ? null : Number(data.budgetEstimate);
  if ('workHours' in data) data.workHours = data.workHours === '' || data.workHours == null ? null : Number(data.workHours);
  const c = await prisma.control.update({ where: { id }, data });
  // KPI snapshot עבור היסטוריית הדשבורד (לא חוסם תשובה)
  recordKpiSnapshot(c.surveyId);
  res.json(enrich(c));
}));

// RACI — החלפת כל הרשומות של בקרה
app.put('/api/controls/:id/raci', authenticate, canEdit, wrap(async (req, res) => {
  const id = Number(req.params.id);
  await assertControl(req, id);
  const entries = Array.isArray(req.body.entries) ? req.body.entries : [];
  await prisma.raciEntry.deleteMany({ where: { controlId: id } });
  for (const e of entries) {
    if (!e.raci) continue;
    await prisma.raciEntry.create({ data: { controlId: id, raci: e.raci, userId: e.userId ? Number(e.userId) : null, text: e.text || null } });
  }
  const out = await prisma.raciEntry.findMany({ where: { controlId: id }, include: { user: { select: { id: true, username: true, fullName: true } } } });
  res.json(out);
}));

// =========================================================================
// Tasks
// =========================================================================
app.post('/api/controls/:id/tasks', authenticate, canEdit, wrap(async (req, res) => {
  const controlId = Number(req.params.id);
  await assertControl(req, controlId);
  const { description, assigneeId, etaValue, etaUnit, status } = req.body;
  const task = await prisma.task.create({
    data: {
      controlId, description: String(description || '').trim() || 'משימה חדשה',
      assigneeId: assigneeId ? Number(assigneeId) : null,
      etaValue: etaValue ? Number(etaValue) : null, etaUnit: etaUnit || null,
      status: status || 'open',
    },
  });
  res.json(task);
}));

app.put('/api/tasks/:id', authenticate, canEdit, wrap(async (req, res) => {
  const id = Number(req.params.id);
  await assertTask(req, id);
  const { description, assigneeId, etaValue, etaUnit, status } = req.body;
  const data = {};
  if (description !== undefined) data.description = description;
  if (assigneeId !== undefined) data.assigneeId = assigneeId ? Number(assigneeId) : null;
  if (etaValue !== undefined) data.etaValue = etaValue ? Number(etaValue) : null;
  if (etaUnit !== undefined) data.etaUnit = etaUnit;
  if (status !== undefined) data.status = status;
  const task = await prisma.task.update({ where: { id }, data });
  res.json(task);
}));

// הוספת הערה (מלל חופשי) — נוצרת תת-חלונית עם חותמת זמן ושם משתמש
app.post('/api/tasks/:id/notes', authenticate, canEdit, wrap(async (req, res) => {
  const taskId = Number(req.params.id);
  await assertTask(req, taskId);
  const { text } = req.body;
  if (!String(text || '').trim()) return res.status(400).json({ error: 'טקסט ריק' });
  const note = await prisma.taskNote.create({
    data: { taskId, userId: req.user.uid, userName: req.user.username, text: String(text).trim() },
  });
  res.json(note);
}));

// =========================================================================
// פעולות מיטיגציה (צ'קליסט) — ביצוען מוריד את הסיכון הנוכחי
// =========================================================================
app.post('/api/controls/:id/mitigation-actions', authenticate, canEdit, wrap(async (req, res) => {
  const controlId = Number(req.params.id);
  await assertControl(req, controlId);
  const text = String(req.body.text || '').trim();
  if (!text) return res.status(400).json({ error: 'חסר תיאור פעולה' });
  const max = await prisma.mitigationAction.aggregate({ where: { controlId }, _max: { order: true } });
  const action = await prisma.mitigationAction.create({
    data: { controlId, text, order: (max._max.order || 0) + 1, done: !!req.body.done },
  });
  const ctrl = await prisma.control.findUnique({ where: { id: controlId }, select: { surveyId: true } });
  if (ctrl) recordKpiSnapshot(ctrl.surveyId);
  res.json(action);
}));

app.put('/api/mitigation-actions/:id', authenticate, canEdit, wrap(async (req, res) => {
  const id = Number(req.params.id);
  const controlId = await assertMitigationAction(req, id);
  const data = {};
  if (req.body.text !== undefined) data.text = String(req.body.text);
  if (req.body.done !== undefined) data.done = !!req.body.done;
  const action = await prisma.mitigationAction.update({ where: { id }, data });
  const ctrl = await prisma.control.findUnique({ where: { id: controlId }, select: { surveyId: true } });
  if (ctrl) recordKpiSnapshot(ctrl.surveyId);
  res.json(action);
}));

app.delete('/api/mitigation-actions/:id', authenticate, canEdit, wrap(async (req, res) => {
  const id = Number(req.params.id);
  const controlId = await assertMitigationAction(req, id);
  await prisma.mitigationAction.delete({ where: { id } });
  const ctrl = await prisma.control.findUnique({ where: { id: controlId }, select: { surveyId: true } });
  if (ctrl) recordKpiSnapshot(ctrl.surveyId);
  res.json({ ok: true });
}));

// היסטוריית KPI לפי סקר — לתרשים ציר זמן בדשבורד.
// מבצע גם snapshot חכם של המצב הנוכחי, כך שגם בסקר חדש תהיה לפחות נקודה אחת.
app.get('/api/surveys/:id/kpi-history', authenticate, wrap(async (req, res) => {
  const id = Number(req.params.id);
  await assertSurvey(req, id);
  await recordKpiSnapshot(id); // יוצר נקודה אם זמן/ערכים מצדיקים
  const rows = await prisma.kpiSnapshot.findMany({
    where: { surveyId: id },
    orderBy: { recordedAt: 'asc' },
    select: { recordedAt: true, avgCurrent: true, riskReductionPct: true },
  });
  res.json(rows);
}));

// =========================================================================
// NIST reference (לבורר מיטיגציה)
// =========================================================================
app.get('/api/nist', authenticate, wrap(async (req, res) => {
  const q = String(req.query.q || '').toLowerCase().trim();
  const nist = getCatalog().nist || [];
  const out = q
    ? nist.filter((n) => n.id.toLowerCase().includes(q) || n.title.toLowerCase().includes(q)).slice(0, 50)
    : nist.slice(0, 50);
  res.json(out);
}));

// =========================================================================
// Backup / Restore
// =========================================================================
app.get('/api/snapshots', authenticate, requireRole('admin'), wrap(async (req, res) => {
  res.json(await prisma.snapshot.findMany({ orderBy: { createdAt: 'desc' } }));
}));

app.post('/api/snapshots', authenticate, requireRole('admin'), wrap(async (req, res) => {
  const { snap } = await backup.createSnapshot('manual');
  await audit(req.user.username, 'backup', snap.fileName);
  res.json(snap);
}));

app.get('/api/snapshots/:id/download', authenticate, requireRole('admin'), wrap(async (req, res) => {
  const snap = await prisma.snapshot.findUnique({ where: { id: Number(req.params.id) } });
  if (!snap) return res.status(404).json({ error: 'גיבוי לא נמצא' });
  res.download(backup.snapshotPath(snap.fileName), snap.fileName);
}));

app.post('/api/snapshots/:id/restore', authenticate, requireRole('admin'), wrap(async (req, res) => {
  const fs = require('fs');
  const snap = await prisma.snapshot.findUnique({ where: { id: Number(req.params.id) } });
  if (!snap) return res.status(404).json({ error: 'גיבוי לא נמצא' });
  const payload = JSON.parse(fs.readFileSync(backup.snapshotPath(snap.fileName), 'utf8'));
  await backup.restoreFromPayload(payload);
  await audit(req.user.username, 'restore_snapshot', snap.fileName);
  res.json({ ok: true });
}));

// שחזור מקובץ גיבוי מקומי שהועלה (JSON בגוף הבקשה)
app.post('/api/restore', authenticate, requireRole('admin'), wrap(async (req, res) => {
  const payload = req.body;
  if (!payload || !payload.data) return res.status(400).json({ error: 'קובץ גיבוי לא תקין' });
  await backup.restoreFromPayload(payload);
  await audit(req.user.username, 'restore_upload');
  res.json({ ok: true });
}));

// =========================================================================
// Boot
// =========================================================================
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Ci-Sec API listening on ${PORT}`));

// גיבוי מתוזמן
const cronExpr = process.env.BACKUP_CRON || '0 2 * * *';
if (cron.validate(cronExpr)) {
  cron.schedule(cronExpr, async () => {
    try { await backup.createSnapshot('scheduled'); console.log('scheduled backup done'); }
    catch (e) { console.error('scheduled backup failed', e.message); }
  });
}
