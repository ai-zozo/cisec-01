// ---------------------------------------------------------------------------
// survey.js — אכלוס סקר חדש מהקטלוג, ושכפול גרסה.
// ---------------------------------------------------------------------------
const prisma = require('./prisma');
const { getCatalog } = require('./catalog');

// אכלוס סקר חדש מתוך קטלוג תורת ההגנה (לפי scope: reduced/expanded)
async function populateSurvey(surveyId, scope = 'expanded') {
  const catalog = getCatalog(scope);
  const famByCode = {};
  let order = 0;
  for (const f of catalog.families) {
    const fam = await prisma.family.create({
      data: { surveyId, code: f.code, name: f.name, order: order++ },
    });
    famByCode[f.code] = fam.id;
  }
  // יצירת בקרות בקבוצות
  const data = catalog.controls.map((c) => ({
    surveyId,
    familyId: famByCode[c.familyCode] || famByCode['GOV'],
    controlCode: c.controlCode || null,
    name: c.name,
    description: c.description || null,
    domain: c.domain || null,
    isProcedural: c.isProcedural ?? null,
    executor: c.executor || null,
    targetLevel: c.targetLevel || null,
    actualLevel: c.actualLevel || null,
    nistSource: c.nistSource || null,
    notesImpl: c.notesImpl || null,
    threatScenario: c.threatScenario || null,
    mitigation: c.mitigation || null,
    status: c.status || 'not_started',
  }));
  // Prisma createMany בקבוצות
  const chunk = 200;
  for (let i = 0; i < data.length; i += chunk) {
    await prisma.control.createMany({ data: data.slice(i, i + chunk) });
  }
  return famByCode;
}

// שכפול סקר לגרסה חדשה (כולל משפחות, בקרות, RACI, משימות, הערות)
async function cloneSurvey(sourceId, createdBy, description = null) {
  const src = await prisma.survey.findUnique({
    where: { id: sourceId },
    include: {
      families: true,
      controls: { include: { tasks: { include: { notes: true } }, raciEntries: true } },
    },
  });
  if (!src) throw new Error('survey not found');

  // מספר גרסה עוקב לאותה רשת+שם בסיס
  const baseName = src.name.replace(/\s+גרסה\s+\d+$/, '');
  const siblings = await prisma.survey.findMany({
    where: { networkId: src.networkId, OR: [{ name: baseName }, { name: { startsWith: baseName + ' גרסה ' } }] },
  });
  const nextVer = Math.max(...siblings.map((s) => s.version), src.version) + 1;

  const newSurvey = await prisma.survey.create({
    data: {
      name: `${baseName} גרסה ${nextVer}`,
      version: nextVer,
      networkId: src.networkId,
      parentId: src.id,
      createdBy,
      description,
    },
  });

  const famMap = {};
  for (const f of src.families) {
    const nf = await prisma.family.create({
      data: { surveyId: newSurvey.id, code: f.code, name: f.name, order: f.order, isCustom: f.isCustom },
    });
    famMap[f.id] = nf.id;
  }
  for (const c of src.controls) {
    const { id, surveyId, familyId, tasks, raciEntries, updatedAt, ...rest } = c;
    const nc = await prisma.control.create({
      data: { ...rest, surveyId: newSurvey.id, familyId: famMap[familyId] },
    });
    for (const t of tasks) {
      const nt = await prisma.task.create({
        data: {
          controlId: nc.id, description: t.description, assigneeId: t.assigneeId,
          etaValue: t.etaValue, etaUnit: t.etaUnit, status: t.status,
        },
      });
      for (const n of t.notes) {
        await prisma.taskNote.create({
          data: { taskId: nt.id, userId: n.userId, userName: n.userName, text: n.text },
        });
      }
    }
    for (const r of raciEntries) {
      await prisma.raciEntry.create({
        data: { controlId: nc.id, raci: r.raci, userId: r.userId, text: r.text },
      });
    }
  }
  return newSurvey;
}

module.exports = { populateSurvey, cloneSurvey };
