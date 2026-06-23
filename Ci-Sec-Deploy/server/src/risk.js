// ---------------------------------------------------------------------------
// risk.js — נוסחאות חישוב הסיכון לפי קובץ הערכת הסיכונים (מקור האמת).
// כל החישובים מתעלמים מבקרות עם notRelevant=true.
// ---------------------------------------------------------------------------

// סולם 1-4 לכל ציר -> ציון 1-16 -> רמה
function levelFromScore(score) {
  if (score == null) return null;
  if (score >= 12) return 'קריטי';
  if (score >= 8) return 'גבוה';
  if (score >= 4) return 'בינוני';
  return 'נמוך';
}

function inherentScore(c) {
  if (c.probability && c.impact) return c.probability * c.impact;
  return null;
}

function residualScore(c) {
  if (c.resProbability && c.resImpact) return c.resProbability * c.resImpact;
  return null;
}

// התקדמות ביצוע פעולות המיטיגציה (0..1); null אם אין פעולות מובנות
function mitigationProgress(c) {
  const acts = c.mitigationActions;
  if (!Array.isArray(acts) || acts.length === 0) return null;
  const done = acts.filter((a) => a.done).length;
  return done / acts.length;
}

// סיכון נוכחי:
// - יש פעולות מיטיגציה: הסיכון יורד הדרגתית מהמובנה אל השיורי לפי אחוז הביצוע.
//   current = inherent - mitProgress*(inherent - target);  target = שיורי אם הוערך אחרת מובנה.
//   סטטוס "הושלם" כופה ביצוע מלא (שיורי).
// - אין פעולות: נוסחת הסטטוס הקלאסית (תאימות לאחור).
// אחוז ההתקדמות האפקטיבי (0..1) ששולט בירידת הסיכון:
// יש פעולות מיטיגציה -> לפי ביצוען (כפוי 1 בהושלם); אחרת לפי הסטטוס.
function currentFraction(c) {
  const mp = mitigationProgress(c);
  if (mp != null) return c.status === 'completed' ? 1 : mp;
  if (c.status === 'completed') return 1;
  if (c.status === 'in_progress') return 0.5;
  return 0;
}

function currentScore(c) {
  const inh = inherentScore(c);
  const res = residualScore(c);
  if (inh == null) return null;
  const target = res != null ? res : inh;
  return Math.round(inh - currentFraction(c) * (inh - target));
}

// מיקום הבקרה על צירי מפת החום לפי הסיכון הנוכחי (מובנה -> שיורי לפי ההתקדמות)
function currentAxes(c) {
  if (!c.probability || !c.impact) return { curProbability: null, curImpact: null };
  const f = currentFraction(c);
  const tProb = c.resProbability || c.probability;
  const tImpact = c.resImpact || c.impact;
  const clamp = (v) => Math.max(1, Math.min(4, Math.round(v)));
  return {
    curProbability: clamp(c.probability - f * (c.probability - tProb)),
    curImpact: clamp(c.impact - f * (c.impact - tImpact)),
  };
}

// שדות שנדרשים להשלמת הערכת בקרה
function missingFields(c) {
  const miss = [];
  if (c.probability == null) miss.push('הסתברות');
  if (c.impact == null) miss.push('השפעה');
  if (!c.threatScenario) miss.push('תרחיש איום/סיכון');
  if (!c.mitigation) miss.push('פעולות מיטיגציה');
  if (c.resProbability == null || c.resImpact == null) miss.push('סיכון שיורי');
  if (!c.mgmtDecision) miss.push('החלטת הנהלה');
  return miss;
}

function enrich(c) {
  const inh = inherentScore(c);
  const res = residualScore(c);
  const cur = currentScore(c);
  const miss = missingFields(c);
  const acts = Array.isArray(c.mitigationActions) ? c.mitigationActions : [];
  const mitTotal = acts.length;
  const mitDone = acts.filter((a) => a.done).length;
  const axes = currentAxes(c);
  return {
    ...c,
    inherentScore: inh,
    inherentLevel: levelFromScore(inh),
    residualScore: res,
    residualLevel: levelFromScore(res),
    currentScore: cur,
    currentLevel: levelFromScore(cur),
    curProbability: axes.curProbability,
    curImpact: axes.curImpact,
    mitTotal,
    mitDone,
    mitProgress: mitTotal ? Math.round((mitDone / mitTotal) * 100) : 0,
    missingFields: miss,
    incomplete: miss.length > 0 && !c.notRelevant,
  };
}

const LEVELS = ['נמוך', 'בינוני', 'גבוה', 'קריטי'];

// אגרגציה לכל הדשבורד
function aggregate(controls, families) {
  const relevant = controls.filter((c) => !c.notRelevant).map(enrich);
  const notRelevantCount = controls.filter((c) => c.notRelevant).length;

  const byLevel = (key) => {
    const m = { 'נמוך': 0, 'בינוני': 0, 'גבוה': 0, 'קריטי': 0, 'לא הוערך': 0 };
    relevant.forEach((c) => {
      const lvl = c[key];
      if (!lvl) m['לא הוערך']++; else m[lvl]++;
    });
    return m;
  };

  const scored = relevant.filter((c) => c.inherentScore != null);
  const avg = (arr, key) =>
    arr.length ? +(arr.reduce((s, c) => s + (c[key] || 0), 0) / arr.length).toFixed(2) : 0;

  // הפחתת סיכון שהושגה: כמה ירד הסיכון מהמובנה לנוכחי, באחוזים
  const sumInherent = scored.reduce((s, c) => s + c.inherentScore, 0);
  const sumCurrent = scored.reduce((s, c) => s + (c.currentScore != null ? c.currentScore : c.inherentScore), 0);
  const riskReductionPct = sumInherent ? Math.round(((sumInherent - sumCurrent) / sumInherent) * 100) : 0;

  // מפת חום 4x4 לפי הסיכון הנוכחי (מיקום מושפע מהתקדמות המיטיגציה)
  const heat = Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => 0));
  relevant.forEach((c) => {
    if (c.curProbability && c.curImpact) heat[4 - c.curProbability][c.curImpact - 1]++;
  });

  // סה"כ הערכה תקציבית לפי מטבע (לכלל הסקר)
  const budgetByCurrency = {};
  controls.forEach((c) => {
    if (!c.noCost && c.budgetEstimate != null && c.budgetEstimate !== 0) {
      const cur = c.budgetCurrency || 'ILS';
      budgetByCurrency[cur] = (budgetByCurrency[cur] || 0) + Number(c.budgetEstimate);
    }
  });

  // סה"כ הערכת שעות עבודה — לכלל הבקרות הרלוונטיות (אינו תלוי במטבע)
  let totalWorkHours = 0;
  relevant.forEach((c) => {
    if (c.workHours != null && Number(c.workHours) > 0) totalWorkHours += Number(c.workHours);
  });

  // ציון ממוצע לפי משפחה (לרדאר/עכביש ולגרף עמודות)
  const famMap = {};
  (families || []).forEach((f) => (famMap[f.id] = { id: f.id, code: f.code, name: f.name, scores: [], inh: [], res: [], mit: [], count: 0 }));
  relevant.forEach((c) => {
    const f = famMap[c.familyId];
    if (!f) return;
    f.count++;
    if (c.currentScore != null) f.scores.push(c.currentScore);
    if (c.inherentScore != null) f.inh.push(c.inherentScore);
    if (c.residualScore != null) f.res.push(c.residualScore);
    f.mit.push(c.mitProgress || 0);
  });
  const mean = (a) => (a.length ? +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2) : 0);
  const byFamily = Object.values(famMap).map((f) => ({
    id: f.id, code: f.code, name: f.name, count: f.count,
    avgScore: mean(f.scores), avgInherent: mean(f.inh), avgResidual: mean(f.res),
    avgMitProgress: Math.round(mean(f.mit)),
  }));

  // השוואת סיכון מובנה מול שיורי (כלל-סקר)
  const inhArr = relevant.filter((c) => c.inherentScore != null);
  const resArr = relevant.filter((c) => c.residualScore != null);
  const inherentVsResidual = {
    avgInherent: mean(inhArr.map((c) => c.inherentScore)),
    avgResidual: mean(resArr.map((c) => c.residualScore)),
    byLevelInherent: byLevel('inherentLevel'),
    byLevelResidual: byLevel('residualLevel'),
  };
  const incompleteCount = relevant.filter((c) => c.incomplete).length;

  // התפלגות החלטות הנהלה
  const decisions = { reduce: 0, transfer: 0, accept: 0, avoid: 0, none: 0 };
  relevant.forEach((c) => decisions[c.mgmtDecision || 'none']++);

  // סטטוס טיפול
  const status = { not_started: 0, in_progress: 0, completed: 0 };
  relevant.forEach((c) => (status[c.status] = (status[c.status] || 0) + 1));

  // התפלגות מורכבות הטיפול
  const complexity = { easy: 0, medium: 0, complex: 0, none: 0 };
  relevant.forEach((c) => complexity[c.complexity || 'none']++);

  // התפלגות יישום הבקרות לפי משפחה (סטטוס פר משפחה)
  const statusByFamily = (families || []).map((f) => {
    const fc = relevant.filter((c) => c.familyId === f.id);
    return {
      id: f.id, name: f.name,
      not_started: fc.filter((c) => c.status === 'not_started').length,
      in_progress: fc.filter((c) => c.status === 'in_progress').length,
      completed: fc.filter((c) => c.status === 'completed').length,
    };
  });

  return {
    kpi: {
      totalControls: controls.length,
      relevantControls: relevant.length,
      notRelevantControls: notRelevantCount,
      criticalCurrent: relevant.filter((c) => c.currentLevel === 'קריטי').length,
      highCurrent: relevant.filter((c) => c.currentLevel === 'גבוה').length,
      avgInherent: avg(scored, 'inherentScore'),
      avgCurrent: avg(scored, 'currentScore'),
      avgResidual: avg(relevant.filter((c) => c.residualScore != null), 'residualScore'),
      completed: status.completed,
      inProgress: status.in_progress,
      notStarted: status.not_started,
      open: status.not_started + status.in_progress,
      incomplete: incompleteCount,
      riskReductionPct,
    },
    levels: {
      inherent: byLevel('inherentLevel'),
      residual: byLevel('residualLevel'),
      current: byLevel('currentLevel'),
    },
    heatmap: heat,
    byFamily,
    decisions,
    status,
    budgetByCurrency,
    totalWorkHours,
    inherentVsResidual,
    complexity,
    statusByFamily,
  };
}

module.exports = { enrich, aggregate, levelFromScore, inherentScore, residualScore, currentScore, LEVELS };
