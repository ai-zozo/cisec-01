// ---------------------------------------------------------------------------
// init.js — רץ בעליית הקונטיינר: סנכרון סכימה ל-DB, בניית קטלוג, ו-seed.
// idempotent — בטוח להרצה חוזרת.
// ---------------------------------------------------------------------------
const { execSync } = require('child_process');
const path = require('path');

function run(cmd) {
  console.log('[init] $', cmd);
  execSync(cmd, { stdio: 'inherit', cwd: path.join(__dirname, '..') });
}

async function waitForDb(prisma, retries = 30) {
  for (let i = 0; i < retries; i++) {
    try { await prisma.$queryRaw`SELECT 1`; return; }
    catch (e) { console.log(`[init] waiting for DB... (${i + 1})`); await new Promise((r) => setTimeout(r, 2000)); }
  }
  throw new Error('DB not reachable');
}

(async () => {
  const prisma = require('../src/prisma');
  const bcrypt = require('bcryptjs');
  const { buildCatalog } = require('../src/catalog');
  const { populateSurvey } = require('../src/survey');

  // 0. להמתין שבסיס הנתונים יהיה זמין
  await waitForDb(prisma);

  // 1. סנכרון סכימה (יוצר טבלאות אם חסרות)
  try { run('npx prisma db push --skip-generate --accept-data-loss'); }
  catch (e) { console.error('[init] prisma db push failed:', e.message); }

  // 2. בניית שני הקטלוגים מהאקסלים (פעם אחת)
  try {
    const r = buildCatalog('reduced'); console.log(`[init] reduced catalog: ${r.families.length} families, ${r.controls.length} controls`);
    const e = buildCatalog('expanded'); console.log(`[init] expanded catalog: ${e.families.length} families, ${e.controls.length} controls`);
  } catch (e) { console.error('[init] catalog build failed:', e.message); }

  // 3. משתמש admin
  const adminPwd = process.env.ADMIN_DEFAULT_PASSWORD || 'Aa123456';
  const admin = await prisma.user.findUnique({ where: { username: 'admin' } });
  if (!admin) {
    await prisma.user.create({
      data: { username: 'admin', passwordHash: await bcrypt.hash(adminPwd, 10), role: 'admin', fullName: 'מנהל מערכת', mustChangePwd: true },
    });
    console.log('[init] admin user created');
  }

  // 4. רשת + סקר ברירת מחדל מאוכלס (רק אם אין סקרים כלל)
  const surveyCount = await prisma.survey.count();
  if (surveyCount === 0) {
    let net = await prisma.network.findFirst();
    if (!net) net = await prisma.network.create({ data: { name: 'רשת ראשית' } });
    const survey = await prisma.survey.create({ data: { name: 'סקר התחלתי', networkId: net.id, version: 1, createdBy: 'admin' } });
    console.log('[init] populating default survey from catalog...');
    await populateSurvey(survey.id, 'expanded');
    console.log('[init] default survey populated');
  }

  console.log('[init] done');
  await prisma.$disconnect();
})().catch((e) => { console.error('[init] fatal:', e); process.exit(0); });
