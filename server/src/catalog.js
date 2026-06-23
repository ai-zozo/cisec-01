// ---------------------------------------------------------------------------
// catalog.js
// בניית קטלוג בקרות לאכלוס סקר. שני סוגי סקר:
//   reduced  (מצומצם) — מתוך הקובץ הערכת_סיכונים_תורת_ההגנה_בסייבר_2.0.xlsx
//   expanded (מורחב)  — מתוך בקרות תורת ההגנה 2.0 (גיליון "בקרות תוהג")
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const SEED_DIR = path.join(__dirname, '..', 'seed-data');
const cacheFile = (scope) => path.join(SEED_DIR, `catalog_${scope}.json`);

// 12 המשפחות (סדר תצוגה) — משמש לקטלוג המורחב ולסיווג
const FAMILIES = [
  { code: 'GOV', name: 'ממשל וניהול סיכונים' },
  { code: 'IDN', name: 'זיהוי ומיפוי נכסים' },
  { code: 'PRA', name: 'הגנה — גישה וזהות' },
  { code: 'PRN', name: 'הגנה — רשת ותשתית' },
  { code: 'PRE', name: 'הגנה — קצה ושרתים' },
  { code: 'PRD', name: 'הגנה — מידע' },
  { code: 'DET', name: 'גילוי וניטור' },
  { code: 'RSP', name: 'תגובה לאירוע' },
  { code: 'RCV', name: 'התאוששות' },
  { code: 'AWR', name: 'מודעות והדרכה' },
  { code: 'PHY', name: 'הגנה פיזית' },
  { code: 'SUP', name: "שרשרת אספקה וצד ג'" },
];

function classifyFamily(fn, topic, subtopic, control) {
  const t = `${fn || ''} ${topic || ''} ${subtopic || ''} ${control || ''}`.toLowerCase();
  const has = (...arr) => arr.some((w) => t.includes(w));
  if (has('פיזי', 'physical', 'מיזוג', 'גישה פיזית')) return 'PHY';
  if (has('מודעות', 'הדרכ', 'הכשר', 'awareness', 'training')) return 'AWR';
  if (has('שרשרת', 'ספק', 'צד ג', 'supply', 'third party', 'מיקור חוץ', 'outsourc')) return 'SUP';
  if (has('התאושש', 'המשכיות', 'גיבוי', 'recover', 'backup', 'bcp', 'drp', 'שחזור')) return 'RCV';
  if (has('אירוע', 'תגובה', 'incident', 'response', 'טיפול באירוע')) return 'RSP';
  if (has('ניטור', 'גילוי', 'detect', 'monitor', 'log', 'לוג', 'siem', 'אנומ')) return 'DET';
  if (has('זהות', 'הזדהות', 'הרשא', 'גישה', 'identity', 'access', 'authenticat', 'iam', 'סיסמ', 'mfa')) return 'PRA';
  if (has('רשת', 'תקשורת', 'network', 'firewall', 'חומת אש', 'תשתית', 'segmentation', 'תקשור')) return 'PRN';
  if (has('קצה', 'שרת', 'endpoint', 'server', 'תחנ', 'edr', 'antivirus', 'נוזק', 'malware', 'patch', 'עדכון')) return 'PRE';
  if (has('הצפנ', 'מידע', 'data', 'נתונים', 'dlp', 'classification', 'סיווג מידע', 'מאגר')) return 'PRD';
  if (has('נכס', 'מיפוי', 'מצאי', 'asset', 'inventory', 'זיהוי')) return 'IDN';
  if (has('ממשל', 'דירקטוריון', 'הנהלה', 'מדיניות', 'סיכון', 'govern', 'policy', 'risk', 'תקציב', 'רגולצ', 'חקיק')) return 'GOV';
  return 'GOV';
}

function cell(row, idx) {
  if (idx == null || idx < 0) return null;
  const v = row[idx];
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}
function findCol(header, ...needles) {
  for (let i = 0; i < header.length; i++) {
    const h = String(header[i] || '').replace(/\s+/g, ' ').trim();
    for (const n of needles) if (h.includes(n)) return i;
  }
  return -1;
}
// צמצום ערך הסתברות/השפעה לסולם 1-4
const clamp4 = (v) => { if (v == null) return null; const n = Number(v); if (!n) return null; return Math.max(1, Math.min(4, Math.round(n))); };

// ---- קטלוג מצומצם: קובץ בפורמט הערכת הסיכונים ----
function parseReduced() {
  const file = path.join(SEED_DIR, 'reduced.xlsx');
  const wb = XLSX.readFile(file);
  const sheetName = wb.SheetNames.find((n) => n.includes('הערכת סיכונים')) || wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: null, blankrows: false });
  let h = -1;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const r = rows[i].map((c) => String(c || ''));
    if (r.some((c) => c.includes('שם הבקרה')) && r.some((c) => c.includes('משפחת בקרה'))) { h = i; break; }
  }
  if (h === -1) h = 0;
  const header = rows[h].map((c) => String(c || ''));
  const col = {
    famName: findCol(header, 'משפחת בקרה'), famCode: findCol(header, 'קוד משפחה'),
    code: findCol(header, 'מזהה בקרה'), name: findCol(header, 'שם הבקרה'),
    desc: findCol(header, 'תיאור הבקרה'), domain: findCol(header, 'תחום ברשת'),
    threat: findCol(header, 'תרחיש איום'), exec: findCol(header, 'מבצע'),
    mit: findCol(header, 'פעולות מיטיגציה'), status: findCol(header, 'סטטוס'),
    decision: findCol(header, 'החלטת הנהלה'), nr: findCol(header, 'לא רלוונטית'),
  };
  const famOrder = []; const seen = {};
  const controls = [];
  for (let i = h + 1; i < rows.length; i++) {
    const r = rows[i];
    const name = cell(r, col.name); const code = cell(r, col.code);
    if (!name && !code) continue;
    if (!name) continue;
    const famName = cell(r, col.famName) || 'ממשל וניהול סיכונים';
    let famCode = cell(r, col.famCode);
    if (!famCode) { const m = (code || '').match(/^[A-Z]+/); famCode = m ? m[0] : 'GOV'; }
    if (!seen[famCode]) { seen[famCode] = famName; famOrder.push({ code: famCode, name: famName }); }
    const statusHe = cell(r, col.status);
    const status = statusHe === 'הושלם' ? 'completed' : statusHe === 'בתהליך' ? 'in_progress' : 'not_started';
    controls.push({
      familyCode: famCode, controlCode: code, name,
      description: cell(r, col.desc), domain: cell(r, col.domain),
      threatScenario: cell(r, col.threat), executor: cell(r, col.exec),
      mitigation: cell(r, col.mit), status,
    });
  }
  const families = famOrder.length ? famOrder : FAMILIES;
  return { families, controls };
}

// ---- קטלוג מורחב: גיליון "בקרות תוהג" ----
function parseExpanded() {
  const file = path.join(SEED_DIR, 'toda_hagana.xlsx');
  const wb = XLSX.readFile(file);
  const sheetName = wb.SheetNames.find((n) => n.includes('בקרות תוהג')) || wb.SheetNames.find((n) => n.includes('בקרות')) || wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: null, blankrows: false });
  let headerIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const r = rows[i].map((c) => String(c || ''));
    if (r.some((c) => c.includes('זיהוי בקרה')) && r.some((c) => c.includes('הבקרה'))) { headerIdx = i; break; }
  }
  if (headerIdx === -1) headerIdx = 0;
  const header = rows[headerIdx].map((c) => String(c || ''));
  const col = {
    fn: findCol(header, 'פונקציה'), topic: findCol(header, 'נושא'),
    subtopic: findCol(header, 'נושא משני'), code: findCol(header, 'זיהוי בקרה'),
    name: header.findIndex((c) => String(c || '').replace(/\s+/g, ' ').trim() === 'הבקרה'),
    fix: findCol(header, 'פעילות מתקנת'), notes: findCol(header, 'דגשים ביישום'),
    proc: findCol(header, 'נהלית'), executor: findCol(header, 'גורם מבצע'), nist: findCol(header, 'מקור NIST'),
  };
  if (col.name < 0) col.name = findCol(header, 'הבקרה');
  const controls = [];
  let lastFn = null, lastTopic = null, lastSub = null;
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i]; if (!r || !r.length) continue;
    const name = cell(r, col.name); const code = cell(r, col.code);
    if (!name && !code) continue;
    lastFn = cell(r, col.fn) || lastFn; lastTopic = cell(r, col.topic) || lastTopic; lastSub = cell(r, col.subtopic) || lastSub;
    if (!name) continue;
    controls.push({
      familyCode: classifyFamily(lastFn, lastTopic, lastSub, name),
      controlCode: code, name,
      description: [lastTopic, lastSub].filter(Boolean).join(' / ') || null,
      domain: lastFn,
      threatScenario: `כשל ביישום הבקרה: ${name}`,
      mitigation: cell(r, col.fix) || `יישום ואכיפת הבקרה: ${name}`,
      executor: cell(r, col.executor),
      nistSource: cell(r, col.nist),
      isProcedural: (() => { const v = cell(r, col.proc); return v ? /כן|yes|נהל/i.test(v) : null; })(),
      notesImpl: cell(r, col.notes),
      status: 'not_started',
    });
  }
  return { families: FAMILIES, controls };
}

function buildCatalog(scope) {
  let parsed;
  try { parsed = scope === 'reduced' ? parseReduced() : parseExpanded(); }
  catch (e) { console.error(`[catalog] parse ${scope} failed:`, e.message); parsed = null; }
  if (!parsed || !parsed.controls.length) {
    parsed = { families: FAMILIES, controls: FAMILIES.map((f) => ({ familyCode: f.code, controlCode: `${f.code}-01`, name: `בקרה לדוגמה — ${f.name}` })) };
  }
  const catalog = { scope, ...parsed, builtAt: new Date().toISOString() };
  try { fs.writeFileSync(cacheFile(scope), JSON.stringify(catalog)); } catch (_) {}
  return catalog;
}

function getCatalog(scope = 'expanded') {
  scope = scope === 'reduced' ? 'reduced' : 'expanded';
  if (fs.existsSync(cacheFile(scope))) {
    try { return JSON.parse(fs.readFileSync(cacheFile(scope), 'utf8')); } catch (_) {}
  }
  return buildCatalog(scope);
}

module.exports = { FAMILIES, getCatalog, buildCatalog, clamp4 };
