// ---------------------------------------------------------------------------
// excel.js — יצוא סקר מלא ל-.xlsx: גליון בקרות, פעולות מיטיגציה, משימות,
// וגליון "דשבורד" עם נוסחאות חיות שמתעדכנות לפי הנתונים.
// ---------------------------------------------------------------------------
const ExcelJS = require('exceljs');
const { enrich } = require('./risk');
const { injectCharts } = require('./excel-charts');

const STATUS_HE = { not_started: 'לא התחיל', in_progress: 'בתהליך', completed: 'הושלם' };
const DECISION_HE = { reduce: 'הפחתת סיכון', transfer: 'העברת הסיכון', accept: 'קבלת הסיכון', avoid: 'הימנעות מהסיכון' };
const COMPLEXITY_HE = { easy: 'קל', medium: 'בינוני', complex: 'מורכב' };
const CURRENCY_SYM = { ILS: '₪', USD: '$', EUR: '€' };

// כותרות גליון הבקרות (הסדר חייב להישמר — הדשבורד מפנה לעמודות לפי אינדקס)
const CONTROL_HEADERS = [
  'מזהה בקרה', 'משפחת בקרה', 'קוד משפחה', 'שם הבקרה', 'תיאור הבקרה', 'תחום ברשת',           // A-F
  'תרחיש איום/סיכון', 'הסתברות (1-4)', 'השפעה (1-4)', 'ציון סיכון', 'רמת סיכון',             // G-K
  'מבצע (R)', 'פעולות מיטיגציה', 'הסתברות שיורית', 'השפעה שיורית', 'סיכון שיורי',           // L-P
  'רמת סיכון שיורי', 'סיכון נוכחי', 'רמת סיכון נוכחי', 'סטטוס', 'תאריך יעד',                  // Q-U
  'החלטת הנהלה', 'בקרה לא רלוונטית',                                                          // V-W
  'סה"כ פעולות מיטיגציה', 'בוצעו', '% ביצוע מיטיגציה',                                       // X-Z
  'מורכבות טיפול', 'הערכה תקציבית', 'מטבע', 'ללא עלות',                                       // AA-AD
  'הערכת שעות עבודה', 'פירוט שעות עבודה',                                                     // AE-AF
];

const headerStyle = (cell) => {
  cell.font = { bold: true, color: { argb: 'FF1F4E79' } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6F1FB' } };
  cell.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' };
  cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
};

const sectionTitleStyle = (cell) => {
  cell.font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
  cell.alignment = { vertical: 'middle', horizontal: 'right' };
};

// סוגריים לשם גליון עם רווח/עברית
const SHEET = "'הערכת סיכונים'";

async function exportSurvey(survey, families, controls) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Ci-Sec';
  wb.created = new Date();

  // --- גליון בקרות (raw data) ---
  const ws = wb.addWorksheet('הערכת סיכונים', { views: [{ rightToLeft: true, state: 'frozen', ySplit: 2 }] });
  ws.mergeCells(1, 1, 1, CONTROL_HEADERS.length);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = `Ci-Sec — ${survey.name} (גרסה ${survey.version}) · רשת: ${survey.network?.name || ''}`;
  titleCell.font = { bold: true, size: 14, color: { argb: 'FF1F4E79' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getRow(1).height = 24;
  const headerRow = ws.addRow(CONTROL_HEADERS);
  headerRow.eachCell(headerStyle);
  headerRow.height = 36;

  const famName = {};
  families.forEach((f) => (famName[f.id] = { name: f.name, code: f.code }));

  // המרת בקרה לשורה — עם נוסחאות חיות לכל הציונים והרמות.
  // עמודות INPUT: H,I (הסתברות/השפעה), N,O (שיורי), T (סטטוס), X,Y (מיטיגציה), W (לא רלוונטית)
  // עמודות מחושבות (נוסחה): J (מובנה), K (רמת מובנה), P (שיורי), Q (רמת שיורי),
  //   R (נוכחי — מובנה פחות אחוז ביצוע × (מובנה-שיורי), עם נפילה-לאחור לפי סטטוס), S (רמת נוכחי),
  //   Z (% ביצוע מיטיגציה)
  const enriched = controls.map(enrich);
  const levelFormula = (refCol) =>
    `IF(${refCol}="","",IF(${refCol}>=12,"קריטי",IF(${refCol}>=8,"גבוה",IF(${refCol}>=4,"בינוני","נמוך"))))`;
  enriched.forEach((c, idx) => {
    const fam = famName[c.familyId] || {};
    const r = 3 + idx; // שורת הנתונים בגליון (כותרת=2, נתונים מתחילים בשורה 3)
    const F = (formula, result) => ({ formula, result });
    ws.addRow([
      c.controlCode || c.id, fam.name || '', fam.code || '', c.name, c.description || '', c.domain || '',
      c.threatScenario || '',
      c.probability ?? '', c.impact ?? '',
      F(`IF(OR(H${r}="",I${r}=""),"",H${r}*I${r})`, c.inherentScore ?? ''),
      F(levelFormula(`J${r}`), c.inherentLevel || ''),
      c.responsibleR || c.executor || '', c.mitigation || '',
      c.resProbability ?? '', c.resImpact ?? '',
      F(`IF(OR(N${r}="",O${r}=""),"",N${r}*O${r})`, c.residualScore ?? ''),
      F(levelFormula(`P${r}`), c.residualLevel || ''),
      // סיכון נוכחי: אם יש פעולות מיטיגציה (X>0) -> מובנה פחות אחוז-ביצוע × (מובנה-שיורי) (סטטוס "הושלם" כופה 100%).
      // אחרת — לוגיקת סטטוס: לא התחיל=מובנה, בתהליך=ממוצע, הושלם=שיורי.
      F(
        `IF(J${r}="","",IF(X${r}>0,ROUND(J${r}-IF(T${r}="הושלם",1,Z${r}/100)*(J${r}-IF(P${r}="",J${r},P${r})),0),IF(T${r}="הושלם",IF(P${r}="",J${r},P${r}),IF(T${r}="בתהליך",IF(P${r}="",J${r},ROUND((J${r}+P${r})/2,0)),J${r}))))`,
        c.currentScore ?? ''
      ),
      F(levelFormula(`R${r}`), c.currentLevel || ''),
      STATUS_HE[c.status] || c.status, c.dueDate ? new Date(c.dueDate) : '',
      DECISION_HE[c.mgmtDecision] || '', c.notRelevant ? 'כן' : 'לא',
      c.mitTotal || 0, c.mitDone || 0,
      F(`IF(X${r}=0,0,ROUND(Y${r}/X${r}*100,0))`, c.mitProgress || 0),
      COMPLEXITY_HE[c.complexity] || '', c.budgetEstimate ?? '', c.budgetCurrency || '', c.noCost ? 'כן' : 'לא',
      c.workHours ?? '', c.workHoursNotes || '',
    ]);
  });

  // רוחבי עמודות
  const widths = [12, 22, 8, 28, 32, 16, 32, 10, 10, 10, 12, 16, 32, 12, 12, 12, 14, 12, 14, 12, 12, 16, 12, 10, 8, 12, 14, 14, 8, 10, 12, 32];
  widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));
  ws.getColumn(21).numFmt = 'dd/mm/yyyy'; // תאריך יעד
  ws.getColumn(26).numFmt = '0"%"'; // % ביצוע
  // עיצוב שורות וטופס
  for (let i = 3; i <= ws.rowCount; i++) {
    ws.getRow(i).alignment = { vertical: 'top', wrapText: true };
    ws.getRow(i).height = 30;
  }
  ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: CONTROL_HEADERS.length } };

  // --- גליון פעולות מיטיגציה ---
  const wsMit = wb.addWorksheet('פעולות מיטיגציה', { views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }] });
  wsMit.addRow(['בקרה — קוד', 'בקרה — שם', 'משפחה', 'פעולת מיטיגציה', 'בוצעה?']).eachCell(headerStyle);
  enriched.forEach((c) => {
    const fam = famName[c.familyId] || {};
    (c.mitigationActions || []).forEach((a) => {
      wsMit.addRow([c.controlCode || c.id, c.name, fam.name || '', a.text || '', a.done ? 'כן' : 'לא']);
    });
  });
  [12, 28, 22, 50, 8].forEach((w, i) => (wsMit.getColumn(i + 1).width = w));
  wsMit.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 5 } };

  // --- גליון משימות ---
  const wsT = wb.addWorksheet('משימות', { views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }] });
  wsT.addRow(['בקרה — קוד', 'בקרה — שם', 'משפחה', 'משימה', 'אחראי', 'הערכת זמן', 'יחידת זמן', 'סטטוס']).eachCell(headerStyle);
  const ETA_HE = { days: 'ימים', weeks: 'שבועות', months: 'חודשים', years: 'שנים' };
  const TASK_STATUS = { open: 'פתוחה', in_progress: 'בתהליך', done: 'הושלמה', blocked: 'חסומה' };
  enriched.forEach((c) => {
    const fam = famName[c.familyId] || {};
    (c.tasks || []).forEach((t) => {
      wsT.addRow([
        c.controlCode || c.id, c.name, fam.name || '',
        t.description || '', (t.assignee?.fullName || t.assignee?.username) || '',
        t.etaValue ?? '', ETA_HE[t.etaUnit] || '', TASK_STATUS[t.status] || t.status,
      ]);
    });
  });
  [12, 28, 22, 38, 18, 10, 10, 12].forEach((w, i) => (wsT.getColumn(i + 1).width = w));
  wsT.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 8 } };

  // --- גליון דשבורד עם נוסחאות חיות ---
  const positions = buildDashboardSheet(wb, families, enriched.length);

  // הזרקת גרפים נטיביים — מקושרים לטבלאות הדשבורד; מתעדכנים אוטומטית עם הנתונים
  const buf = await wb.xlsx.writeBuffer();
  try {
    // האינדקס של גליון "דשבורד" — sheet4 (הוא הגליון הרביעי שהוסף)
    return await injectCharts(buf, positions, 4);
  } catch (e) {
    console.error('[excel] chart injection failed, returning without charts:', e.message);
    return buf;
  }
}

// בונה גליון דשבורד עם נוסחאות מקושרות לגליון "הערכת סיכונים".
// כל ערך בדשבורד מחושב מהנתונים — שינוי בגליון הבקרות יעדכן הכל אוטומטית בפתיחה ב-Excel.
function buildDashboardSheet(wb, families, totalRows) {
  const ws = wb.addWorksheet('דשבורד', { views: [{ rightToLeft: true }], pageSetup: { orientation: 'landscape' } });
  const lastDataRow = 2 + totalRows; // header at row 2 + N data rows
  const dataRange = `${SHEET}!$A$3:$AD$${Math.max(lastDataRow, 3)}`;
  const colA = `${SHEET}!$A$3:$A$${Math.max(lastDataRow, 3)}`; // מזהה בקרה
  const colB = `${SHEET}!$B$3:$B$${Math.max(lastDataRow, 3)}`; // משפחת בקרה
  const colJ = `${SHEET}!$J$3:$J$${Math.max(lastDataRow, 3)}`; // ציון מובנה
  const colK = `${SHEET}!$K$3:$K$${Math.max(lastDataRow, 3)}`; // רמת סיכון מובנה
  const colP = `${SHEET}!$P$3:$P$${Math.max(lastDataRow, 3)}`; // סיכון שיורי
  const colR = `${SHEET}!$R$3:$R$${Math.max(lastDataRow, 3)}`; // סיכון נוכחי
  const colS = `${SHEET}!$S$3:$S$${Math.max(lastDataRow, 3)}`; // רמת סיכון נוכחי
  const colT = `${SHEET}!$T$3:$T$${Math.max(lastDataRow, 3)}`; // סטטוס
  const colV = `${SHEET}!$V$3:$V$${Math.max(lastDataRow, 3)}`; // החלטת הנהלה
  const colW = `${SHEET}!$W$3:$W$${Math.max(lastDataRow, 3)}`; // לא רלוונטית
  const colZ = `${SHEET}!$Z$3:$Z$${Math.max(lastDataRow, 3)}`; // % ביצוע מיטיגציה
  const colAA = `${SHEET}!$AA$3:$AA$${Math.max(lastDataRow, 3)}`; // מורכבות

  // כותרת
  ws.mergeCells('A1:E1');
  const title = ws.getCell('A1');
  title.value = 'דשבורד — תמונת מצב הסיכונים';
  title.font = { bold: true, size: 18, color: { argb: 'FF1F4E79' } };
  title.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 30;
  ws.mergeCells('A2:E2');
  const sub = ws.getCell('A2');
  sub.value = 'כל הנתונים מתעדכנים אוטומטית לפי גליון "הערכת סיכונים"';
  sub.font = { italic: true, color: { argb: 'FF6B7785' } };
  sub.alignment = { horizontal: 'center' };

  // === קטע 1: KPI ===
  let r = 4;
  const kpi = (row, label, formula, fmt) => {
    ws.getCell(`A${row}`).value = label;
    ws.getCell(`A${row}`).font = { bold: true };
    ws.getCell(`A${row}`).alignment = { horizontal: 'right' };
    ws.getCell(`A${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    ws.getCell(`B${row}`).value = { formula };
    ws.getCell(`B${row}`).font = { bold: true, size: 14, color: { argb: 'FF2563EB' } };
    if (fmt) ws.getCell(`B${row}`).numFmt = fmt;
    ws.getCell(`B${row}`).alignment = { horizontal: 'center' };
  };

  ws.mergeCells(`A${r}:B${r}`); sectionTitleStyle(ws.getCell(`A${r}`)); ws.getCell(`A${r}`).value = '⚡ מדדים מצרפיים (KPI)'; r++;
  kpi(r++, 'סה"כ בקרות', `COUNTA(${colA})`);
  kpi(r++, 'בקרות רלוונטיות', `COUNTIF(${colW},"לא")`);
  kpi(r++, 'בקרות לא רלוונטיות', `COUNTIF(${colW},"כן")`);
  kpi(r++, 'חשיפה קריטית נוכחית', `COUNTIFS(${colS},"קריטי",${colW},"לא")`);
  kpi(r++, 'חשיפה גבוהה נוכחית', `COUNTIFS(${colS},"גבוה",${colW},"לא")`);
  kpi(r++, 'ציון סיכון ממוצע (נוכחי)', `IFERROR(AVERAGEIFS(${colR},${colW},"לא",${colR},">0"),0)`, '0.00');
  kpi(r++, 'ציון מובנה ממוצע', `IFERROR(AVERAGEIFS(${colJ},${colW},"לא",${colJ},">0"),0)`, '0.00');
  kpi(r++, 'ציון שיורי ממוצע', `IFERROR(AVERAGEIFS(${colP},${colW},"לא",${colP},">0"),0)`, '0.00');
  kpi(r++, 'הופחת סיכון שהושג %',
    `IFERROR(ROUND((SUMIFS(${colJ},${colW},"לא")-SUMIFS(${colR},${colW},"לא"))/SUMIFS(${colJ},${colW},"לא")*100,0),0)`, '0"%"');
  kpi(r++, 'הושלמו', `COUNTIFS(${colT},"הושלם",${colW},"לא")`);
  kpi(r++, 'בתהליך', `COUNTIFS(${colT},"בתהליך",${colW},"לא")`);
  kpi(r++, 'לא התחילו', `COUNTIFS(${colT},"לא התחיל",${colW},"לא")`);
  kpi(r++, 'התקדמות טיפול משוקללת',
    `IFERROR(ROUND((COUNTIFS(${colT},"הושלם",${colW},"לא")*100+COUNTIFS(${colT},"בתהליך",${colW},"לא")*50)/COUNTIF(${colW},"לא"),0),0)`, '0"%"');

  // === קטע 2: התפלגות רמות סיכון (מובנה/שיורי/נוכחי) ===
  const positions = {};
  r += 1;
  ws.mergeCells(`A${r}:E${r}`); sectionTitleStyle(ws.getCell(`A${r}`)); ws.getCell(`A${r}`).value = '📊 התפלגות רמות סיכון'; r++;
  const lvlHdr = ws.getRow(r);
  lvlHdr.values = ['רמה', 'מובנה', 'שיורי', 'נוכחי', ''];
  lvlHdr.eachCell((c, col) => { if (col <= 4) headerStyle(c); });
  positions.riskLevels = { hdrRow: r, dataStart: r + 1, dataEnd: r + 4 };
  r++;
  ['קריטי', 'גבוה', 'בינוני', 'נמוך'].forEach((lvl) => {
    ws.getCell(`A${r}`).value = lvl;
    ws.getCell(`A${r}`).font = { bold: true };
    ws.getCell(`B${r}`).value = { formula: `COUNTIFS(${colK},"${lvl}",${colW},"לא")` };
    ws.getCell(`C${r}`).value = { formula: `COUNTIFS(${SHEET}!$Q$3:$Q$${Math.max(lastDataRow, 3)},"${lvl}",${colW},"לא")` };
    ws.getCell(`D${r}`).value = { formula: `COUNTIFS(${colS},"${lvl}",${colW},"לא")` };
    [`A${r}`, `B${r}`, `C${r}`, `D${r}`].forEach((a) => { ws.getCell(a).alignment = { horizontal: 'center' }; });
    // צבע רקע לפי רמה
    const color = lvl === 'קריטי' ? 'FFFDEAEA' : lvl === 'גבוה' ? 'FFFDEEE0' : lvl === 'בינוני' ? 'FFFDF6E3' : 'FFE9F8EE';
    ['A', 'B', 'C', 'D'].forEach((c) => { ws.getCell(`${c}${r}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } }; });
    r++;
  });

  // === קטע 3: סטטוס טיפול ===
  r += 1;
  ws.mergeCells(`A${r}:B${r}`); sectionTitleStyle(ws.getCell(`A${r}`)); ws.getCell(`A${r}`).value = '🚦 סטטוס טיפול'; r++;
  ws.getRow(r).values = ['סטטוס', 'כמות']; ws.getRow(r).eachCell((c, col) => { if (col <= 2) headerStyle(c); });
  positions.status = { hdrRow: r, dataStart: r + 1, dataEnd: r + 3 };
  r++;
  [['הושלם', 'הושלם'], ['בתהליך', 'בתהליך'], ['לא התחיל', 'לא התחיל']].forEach(([lbl, val]) => {
    ws.getCell(`A${r}`).value = lbl;
    ws.getCell(`B${r}`).value = { formula: `COUNTIFS(${colT},"${val}",${colW},"לא")` };
    ws.getCell(`B${r}`).alignment = { horizontal: 'center' };
    r++;
  });

  // === קטע 4: החלטות הנהלה ===
  r += 1;
  ws.mergeCells(`A${r}:B${r}`); sectionTitleStyle(ws.getCell(`A${r}`)); ws.getCell(`A${r}`).value = '🧭 התפלגות החלטות הנהלה'; r++;
  ws.getRow(r).values = ['החלטה', 'כמות']; ws.getRow(r).eachCell((c, col) => { if (col <= 2) headerStyle(c); });
  positions.decisions = { hdrRow: r, dataStart: r + 1, dataEnd: r + Object.keys(DECISION_HE).length };
  r++;
  Object.values(DECISION_HE).forEach((d) => {
    ws.getCell(`A${r}`).value = d;
    ws.getCell(`B${r}`).value = { formula: `COUNTIFS(${colV},"${d}",${colW},"לא")` };
    ws.getCell(`B${r}`).alignment = { horizontal: 'center' };
    r++;
  });
  ws.getCell(`A${r}`).value = 'ללא החלטה';
  ws.getCell(`B${r}`).value = { formula: `COUNTIFS(${colV},"",${colW},"לא")` };
  ws.getCell(`B${r}`).alignment = { horizontal: 'center' };
  r += 2;

  // === קטע 5: ציון ממוצע + ספירות לפי משפחה ===
  ws.mergeCells(`A${r}:G${r}`); sectionTitleStyle(ws.getCell(`A${r}`)); ws.getCell(`A${r}`).value = '🏷️ סיכומים לפי משפחה'; r++;
  const famHdr = ws.getRow(r);
  famHdr.values = ['משפחה', 'בקרות', 'קריטי נוכחי', 'גבוה נוכחי', 'ציון מובנה ממוצע', 'ציון נוכחי ממוצע', '% ביצוע מיטיגציה'];
  famHdr.eachCell((c, col) => { if (col <= 7) headerStyle(c); });
  positions.byFamily = { hdrRow: r, dataStart: r + 1, dataEnd: r + families.length };
  r++;
  families.forEach((f) => {
    const fname = (f.name || '').replace(/"/g, '""');
    ws.getCell(`A${r}`).value = f.name;
    ws.getCell(`A${r}`).font = { bold: true };
    ws.getCell(`B${r}`).value = { formula: `COUNTIFS(${colB},"${fname}",${colW},"לא")` };
    ws.getCell(`C${r}`).value = { formula: `COUNTIFS(${colB},"${fname}",${colS},"קריטי",${colW},"לא")` };
    ws.getCell(`D${r}`).value = { formula: `COUNTIFS(${colB},"${fname}",${colS},"גבוה",${colW},"לא")` };
    ws.getCell(`E${r}`).value = { formula: `IFERROR(AVERAGEIFS(${colJ},${colB},"${fname}",${colW},"לא",${colJ},">0"),0)` };
    ws.getCell(`E${r}`).numFmt = '0.00';
    ws.getCell(`F${r}`).value = { formula: `IFERROR(AVERAGEIFS(${colR},${colB},"${fname}",${colW},"לא",${colR},">0"),0)` };
    ws.getCell(`F${r}`).numFmt = '0.00';
    ws.getCell(`G${r}`).value = { formula: `IFERROR(AVERAGEIFS(${colZ},${colB},"${fname}",${colW},"לא"),0)` };
    ws.getCell(`G${r}`).numFmt = '0"%"';
    ['B', 'C', 'D', 'E', 'F', 'G'].forEach((c) => { ws.getCell(`${c}${r}`).alignment = { horizontal: 'center' }; });
    r++;
  });
  r += 1;

  // === קטע 6: מורכבות טיפול ===
  ws.mergeCells(`A${r}:B${r}`); sectionTitleStyle(ws.getCell(`A${r}`)); ws.getCell(`A${r}`).value = '🛠️ התפלגות מורכבות טיפול'; r++;
  ws.getRow(r).values = ['מורכבות', 'כמות']; ws.getRow(r).eachCell((c, col) => { if (col <= 2) headerStyle(c); }); r++;
  Object.values(COMPLEXITY_HE).forEach((cx) => {
    ws.getCell(`A${r}`).value = cx;
    ws.getCell(`B${r}`).value = { formula: `COUNTIFS(${colAA},"${cx}",${colW},"לא")` };
    ws.getCell(`B${r}`).alignment = { horizontal: 'center' };
    r++;
  });
  ws.getCell(`A${r}`).value = 'לא הוגדר';
  ws.getCell(`B${r}`).value = { formula: `COUNTIFS(${colAA},"",${colW},"לא")` };
  ws.getCell(`B${r}`).alignment = { horizontal: 'center' };
  r += 2;

  // === קטע 7: סיכום תקציב לפי מטבע ===
  ws.mergeCells(`A${r}:B${r}`); sectionTitleStyle(ws.getCell(`A${r}`)); ws.getCell(`A${r}`).value = '💰 הערכה תקציבית לפי מטבע'; r++;
  ws.getRow(r).values = ['מטבע', 'סה"כ']; ws.getRow(r).eachCell((c, col) => { if (col <= 2) headerStyle(c); }); r++;
  ['ILS', 'USD', 'EUR'].forEach((cur) => {
    ws.getCell(`A${r}`).value = cur + ' ' + (CURRENCY_SYM[cur] || '');
    ws.getCell(`B${r}`).value = { formula: `SUMIFS(${SHEET}!$AB$3:$AB$${Math.max(lastDataRow, 3)},${SHEET}!$AC$3:$AC$${Math.max(lastDataRow, 3)},"${cur}",${SHEET}!$AD$3:$AD$${Math.max(lastDataRow, 3)},"לא",${colW},"לא")` };
    ws.getCell(`B${r}`).numFmt = '#,##0';
    ws.getCell(`B${r}`).alignment = { horizontal: 'center' };
    r++;
  });

  // רוחבי עמודות בדשבורד — A-G לטבלאות, H-P שמורות לגרפים שיוזרקו
  [28, 16, 14, 14, 18, 18, 18].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  for (let i = 8; i <= 16; i++) ws.getColumn(i).width = 12;
  return positions;
}

module.exports = { exportSurvey };
