// ---------------------------------------------------------------------------
// backup.js — גיבוי/שחזור snapshot של כל בסיס הנתונים כקובץ JSON.
// (גיבוי לוגי הניתן להורדה למחשב ולשחזור חזרה.)
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');
const prisma = require('./prisma');

const BACKUP_DIR = path.join(__dirname, '..', 'backups');
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

const TABLES = [
  'network', 'survey', 'family', 'control', 'raciEntry', 'task', 'taskNote', 'user', 'auditLog',
];

async function dumpData() {
  const data = {};
  data.network = await prisma.network.findMany();
  data.survey = await prisma.survey.findMany();
  data.family = await prisma.family.findMany();
  data.control = await prisma.control.findMany();
  data.raciEntry = await prisma.raciEntry.findMany();
  data.task = await prisma.task.findMany();
  data.taskNote = await prisma.taskNote.findMany();
  data.user = await prisma.user.findMany(); // כולל passwordHash (מוצפן) — לא חושף סיסמאות
  data.auditLog = await prisma.auditLog.findMany();
  return data;
}

async function createSnapshot(type = 'manual') {
  const data = await dumpData();
  const ts = new Date();
  const stamp = ts.toISOString().replace(/[:.]/g, '-');
  const fileName = `cisec-backup-${stamp}.json`;
  const payload = { version: 1, createdAt: ts.toISOString(), type, data };
  const body = JSON.stringify(payload);
  fs.writeFileSync(path.join(BACKUP_DIR, fileName), body);
  const snap = await prisma.snapshot.create({
    data: { label: `גיבוי ${ts.toLocaleString('he-IL')}`, type, fileName, sizeBytes: Buffer.byteLength(body) },
  });
  return { snap, fileName };
}

function snapshotPath(fileName) {
  // הגנה מפני path traversal
  const safe = path.basename(fileName);
  return path.join(BACKUP_DIR, safe);
}

// שחזור מתוך payload גיבוי (אובייקט מפוענח)
async function restoreFromPayload(payload) {
  const data = payload.data || payload;
  // מחיקה בסדר הפוך לשמירת foreign keys
  await prisma.taskNote.deleteMany();
  await prisma.task.deleteMany();
  await prisma.raciEntry.deleteMany();
  await prisma.control.deleteMany();
  await prisma.family.deleteMany();
  await prisma.survey.deleteMany();
  await prisma.auditLog.deleteMany();
  // משתמשים: לא מוחקים את admin הקיים אם אין בגיבוי
  if (data.user && data.user.length) {
    await prisma.user.deleteMany();
  }
  if (data.network) await prisma.network.deleteMany();

  const insert = async (model, rows) => {
    if (!rows || !rows.length) return;
    for (const r of rows) {
      try { await prisma[model].create({ data: r }); } catch (e) { /* skip conflicts */ }
    }
  };
  await insert('network', data.network);
  await insert('user', data.user);
  await insert('survey', data.survey);
  await insert('family', data.family);
  await insert('control', data.control);
  await insert('raciEntry', data.raciEntry);
  await insert('task', data.task);
  await insert('taskNote', data.taskNote);
  await insert('auditLog', data.auditLog);
}

module.exports = { createSnapshot, snapshotPath, restoreFromPayload, BACKUP_DIR };
