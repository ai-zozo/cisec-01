// ---------------------------------------------------------------------------
// excel-charts.js — הזרקת גרפים נטיביים (chart objects) לקובץ xlsx שנוצר ע"י ExcelJS.
// יוצר xl/charts/chartN.xml, xl/drawings/drawing1.xml, ואת ה-rels הנדרשים.
// הגרפים מקושרים לטווחי נתונים בגליון "דשבורד" — שינוי בנתונים מעדכן הכל אוטומטית.
// ---------------------------------------------------------------------------
const JSZip = require('jszip');

const NS_CHART = 'http://schemas.openxmlformats.org/drawingml/2006/chart';
const NS_DML = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_SS_DRAW = 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing';
const NS_PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const SHEET = "'דשבורד'";

// === Chart XML builders ===

const COLORS = ['4472C4', 'ED7D31', '70AD47', 'FFC000', '5B9BD5', 'A5A5A5', 'FF6B6B', '7B68EE', '00C9A7', 'F08A5D', 'B83B5E', '6A2C70'];

// תוויות נתונים — לעמודות/פס: מציג ערך נומינלי על כל עמודה
const DLBLS_VAL = `<c:dLbls>
  <c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="900" b="1"/></a:pPr><a:endParaRPr lang="he-IL"/></a:p></c:txPr>
  <c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="0"/>
  <c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/>
</c:dLbls>`;

// תוויות לפאי — מציג שם קטגוריה + ערך + אחוז
const DLBLS_PIE = `<c:dLbls>
  <c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="900" b="1"/></a:pPr><a:endParaRPr lang="he-IL"/></a:p></c:txPr>
  <c:dLblPos val="outEnd"/>
  <c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="1"/>
  <c:showSerName val="0"/><c:showPercent val="1"/><c:showBubbleSize val="0"/>
  <c:separator>  ·  </c:separator>
</c:dLbls>`;

const LEGEND = `<c:legend>
  <c:legendPos val="b"/><c:overlay val="0"/>
  <c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="900"/></a:pPr><a:endParaRPr lang="he-IL"/></a:p></c:txPr>
</c:legend>`;

// פסי עמודה מקובצים: 3 סדרות (מובנה/שיורי/נוכחי) × 4 קטגוריות (רמות סיכון)
function clusteredColumnChartXml({ title, catRange, series }) {
  const seriesXml = series.map((s, i) => `
    <c:ser>
      <c:idx val="${i}"/>
      <c:order val="${i}"/>
      <c:tx><c:strRef><c:f>${s.titleRef}</c:f></c:strRef></c:tx>
      <c:spPr><a:solidFill><a:srgbClr val="${s.color || COLORS[i]}"/></a:solidFill></c:spPr>
      ${DLBLS_VAL}
      <c:cat><c:strRef><c:f>${catRange}</c:f></c:strRef></c:cat>
      <c:val><c:numRef><c:f>${s.valRange}</c:f></c:numRef></c:val>
    </c:ser>`).join('');
  return chartHeader(title) +
`<c:plotArea>
  <c:layout/>
  <c:barChart>
    <c:barDir val="col"/>
    <c:grouping val="clustered"/>
    <c:varyColors val="0"/>
    ${seriesXml}
    <c:gapWidth val="80"/>
    <c:axId val="1"/>
    <c:axId val="2"/>
  </c:barChart>
  ${catAxXml()}
  ${valAxXml()}
</c:plotArea>
${LEGEND}
<c:plotVisOnly val="1"/>
<c:dispBlanksAs val="gap"/>
` + chartFooter();
}

// פס אופקי: סדרה אחת לפי משפחה
function horizontalBarChartXml({ title, catRange, ser }) {
  return chartHeader(title) +
`<c:plotArea>
  <c:layout/>
  <c:barChart>
    <c:barDir val="bar"/>
    <c:grouping val="clustered"/>
    <c:varyColors val="0"/>
    <c:ser>
      <c:idx val="0"/>
      <c:order val="0"/>
      <c:tx><c:strRef><c:f>${ser.titleRef}</c:f></c:strRef></c:tx>
      <c:spPr><a:solidFill><a:srgbClr val="${ser.color || '4472C4'}"/></a:solidFill></c:spPr>
      ${DLBLS_VAL}
      <c:cat><c:strRef><c:f>${catRange}</c:f></c:strRef></c:cat>
      <c:val><c:numRef><c:f>${ser.valRange}</c:f></c:numRef></c:val>
    </c:ser>
    <c:gapWidth val="60"/>
    <c:axId val="1"/>
    <c:axId val="2"/>
  </c:barChart>
  ${catAxXml('l')}
  ${valAxXml('b')}
</c:plotArea>
<c:plotVisOnly val="1"/>
<c:dispBlanksAs val="gap"/>
` + chartFooter();
}

// פאי — תוויות עם שם קטגוריה + ערך + אחוז
function pieChartXml({ title, catRange, valRange, titleRef }) {
  return chartHeader(title) +
`<c:plotArea>
  <c:layout/>
  <c:pieChart>
    <c:varyColors val="1"/>
    <c:ser>
      <c:idx val="0"/>
      <c:order val="0"/>
      <c:tx><c:strRef><c:f>${titleRef}</c:f></c:strRef></c:tx>
      ${DLBLS_PIE}
      <c:cat><c:strRef><c:f>${catRange}</c:f></c:strRef></c:cat>
      <c:val><c:numRef><c:f>${valRange}</c:f></c:numRef></c:val>
    </c:ser>
    <c:firstSliceAng val="0"/>
  </c:pieChart>
</c:plotArea>
${LEGEND}
<c:plotVisOnly val="1"/>
<c:dispBlanksAs val="gap"/>
` + chartFooter();
}

function chartHeader(title) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="${NS_CHART}" xmlns:a="${NS_DML}" xmlns:r="${NS_REL}">
<c:chart>
<c:title>
  <c:tx><c:rich>
    <a:bodyPr rot="0" spcFirstLastPara="1" vertOverflow="ellipsis" wrap="square" anchor="ctr" anchorCtr="1"/>
    <a:lstStyle/>
    <a:p><a:pPr><a:defRPr sz="1400" b="1" kern="1200"><a:solidFill><a:srgbClr val="1F4E79"/></a:solidFill></a:defRPr></a:pPr>
      <a:r><a:rPr lang="he-IL" sz="1400" b="1"><a:solidFill><a:srgbClr val="1F4E79"/></a:solidFill></a:rPr><a:t>${escapeXml(title)}</a:t></a:r>
    </a:p>
  </c:rich></c:tx>
  <c:overlay val="0"/>
</c:title>
<c:autoTitleDeleted val="0"/>
`;
}

function chartFooter() {
  return `</c:chart>
<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr lang="he-IL"/></a:pPr><a:endParaRPr lang="he-IL"/></a:p></c:txPr>
</c:chartSpace>`;
}

function catAxXml(pos = 'b') {
  return `<c:catAx>
    <c:axId val="1"/><c:scaling><c:orientation val="minMax"/></c:scaling>
    <c:delete val="0"/><c:axPos val="${pos}"/>
    <c:crossAx val="2"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/>
  </c:catAx>`;
}
function valAxXml(pos = 'l') {
  return `<c:valAx>
    <c:axId val="2"/><c:scaling><c:orientation val="minMax"/></c:scaling>
    <c:delete val="0"/><c:axPos val="${pos}"/>
    <c:crossAx val="1"/><c:crosses val="autoZero"/><c:crossBetween val="between"/>
  </c:valAx>`;
}

function escapeXml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;'); }

// בניית drawing XML עם N עוגנים (anchor) לגרפים
function drawingXml(anchors) {
  const a = anchors.map((an, i) => `
  <xdr:twoCellAnchor>
    <xdr:from><xdr:col>${an.fromCol}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${an.fromRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>
    <xdr:to><xdr:col>${an.toCol}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${an.toRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>
    <xdr:graphicFrame macro="">
      <xdr:nvGraphicFramePr><xdr:cNvPr id="${i + 2}" name="Chart ${i + 1}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>
      <xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>
      <a:graphic><a:graphicData uri="${NS_CHART}"><c:chart xmlns:c="${NS_CHART}" xmlns:r="${NS_REL}" r:id="rId${i + 1}"/></a:graphicData></a:graphic>
    </xdr:graphicFrame>
    <xdr:clientData/>
  </xdr:twoCellAnchor>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="${NS_SS_DRAW}" xmlns:a="${NS_DML}" xmlns:r="${NS_REL}">${a}
</xdr:wsDr>`;
}

function drawingRelsXml(count) {
  const rels = Array.from({ length: count }, (_, i) =>
    `<Relationship Id="rId${i + 1}" Type="${NS_REL}/chart" Target="../charts/chart${i + 1}.xml"/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${NS_PKG_REL}">${rels}</Relationships>`;
}

function sheetRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${NS_PKG_REL}"><Relationship Id="rId1" Type="${NS_REL}/drawing" Target="../drawings/drawing1.xml"/></Relationships>`;
}

// === Main injection ===

// מזריק גרפים לתוך buffer של xlsx. מקבל:
//   buffer — buffer/Uint8Array שהפיק ExcelJS
//   positions — { riskLevels, status, decisions, byFamily, mitigation }
//   dashboardSheetIdx — אינדקס בסיס 1 של גליון הדשבורד (sheet4 = 4)
async function injectCharts(buffer, positions, dashboardSheetIdx = 4) {
  const zip = await JSZip.loadAsync(buffer);

  // הגדרת הגרפים — קישור לטווחים בגליון הדשבורד
  const cells = (col, row) => `${SHEET}!$${col}$${row}`;
  const range = (col, r1, r2) => `${SHEET}!$${col}$${r1}:$${col}$${r2}`;

  const charts = [];

  // (1) רמות סיכון — clustered column
  if (positions.riskLevels) {
    const { hdrRow, dataStart, dataEnd } = positions.riskLevels;
    charts.push({
      xml: clusteredColumnChartXml({
        title: 'התפלגות רמות סיכון (מובנה/שיורי/נוכחי)',
        catRange: range('A', dataStart, dataEnd),
        series: [
          { titleRef: cells('B', hdrRow), valRange: range('B', dataStart, dataEnd), color: '94A3B8' },
          { titleRef: cells('C', hdrRow), valRange: range('C', dataStart, dataEnd), color: '60A5FA' },
          { titleRef: cells('D', hdrRow), valRange: range('D', dataStart, dataEnd), color: '2563EB' },
        ],
      }),
      anchor: { fromCol: 7, fromRow: 3, toCol: 16, toRow: 22 },
    });

    // (2) פאי — רמות סיכון נוכחי (חדש לפי בקשת המשתמש)
    charts.push({
      xml: pieChartXml({
        title: 'התפלגות רמות סיכון נוכחי',
        catRange: range('A', positions.riskLevels.dataStart, positions.riskLevels.dataEnd),
        valRange: range('D', positions.riskLevels.dataStart, positions.riskLevels.dataEnd),
        titleRef: cells('D', positions.riskLevels.hdrRow),
      }),
      anchor: { fromCol: 7, fromRow: 23, toCol: 10, toRow: 39 },
    });
  }

  // (3) סטטוס — pie
  if (positions.status) {
    const { hdrRow, dataStart, dataEnd } = positions.status;
    charts.push({
      xml: pieChartXml({
        title: 'סטטוס טיפול בבקרות',
        catRange: range('A', dataStart, dataEnd),
        valRange: range('B', dataStart, dataEnd),
        titleRef: cells('B', hdrRow),
      }),
      anchor: { fromCol: 11, fromRow: 23, toCol: 13, toRow: 39 },
    });
  }

  // (4) החלטות הנהלה — pie
  if (positions.decisions) {
    const { hdrRow, dataStart, dataEnd } = positions.decisions;
    charts.push({
      xml: pieChartXml({
        title: 'התפלגות החלטות הנהלה',
        catRange: range('A', dataStart, dataEnd),
        valRange: range('B', dataStart, dataEnd),
        titleRef: cells('B', hdrRow),
      }),
      anchor: { fromCol: 14, fromRow: 23, toCol: 16, toRow: 39 },
    });
  }

  // (5) ציון נוכחי ממוצע לפי משפחה — horizontal bar
  if (positions.byFamily) {
    const { hdrRow, dataStart, dataEnd } = positions.byFamily;
    charts.push({
      xml: horizontalBarChartXml({
        title: 'ציון סיכון נוכחי ממוצע לפי משפחה',
        catRange: range('A', dataStart, dataEnd),
        ser: { titleRef: cells('F', hdrRow), valRange: range('F', dataStart, dataEnd), color: 'DC2626' },
      }),
      anchor: { fromCol: 7, fromRow: 40, toCol: 16, toRow: 61 },
    });

    // (6) % ביצוע מיטיגציה לפי משפחה
    charts.push({
      xml: horizontalBarChartXml({
        title: '% ביצוע מיטיגציה לפי משפחה',
        catRange: range('A', dataStart, dataEnd),
        ser: { titleRef: cells('G', hdrRow), valRange: range('G', dataStart, dataEnd), color: '16A34A' },
      }),
      anchor: { fromCol: 7, fromRow: 62, toCol: 16, toRow: 83 },
    });
  }

  // כתיבת קובצי הגרפים
  charts.forEach((c, i) => zip.file(`xl/charts/chart${i + 1}.xml`, c.xml));

  // קובץ drawing
  zip.file('xl/drawings/drawing1.xml', drawingXml(charts.map((c) => c.anchor)));
  zip.file('xl/drawings/_rels/drawing1.xml.rels', drawingRelsXml(charts.length));

  // rels של גליון הדשבורד
  zip.file(`xl/worksheets/_rels/sheet${dashboardSheetIdx}.xml.rels`, sheetRelsXml());

  // הוספת <drawing r:id="rId<N>"/> בתוך sheet{N}.xml — בסוף הגליון
  const sheetPath = `xl/worksheets/sheet${dashboardSheetIdx}.xml`;
  let sheetXml = await zip.file(sheetPath).async('string');
  if (!sheetXml.includes('<drawing ')) {
    // חיפוש האלמנט האחרון לפני </worksheet>
    sheetXml = sheetXml.replace('</worksheet>', '<drawing r:id="rId1"/></worksheet>');
    // לוודא ש-r namespace קיים בכותרת
    if (!sheetXml.includes('xmlns:r="')) {
      sheetXml = sheetXml.replace('<worksheet ', `<worksheet xmlns:r="${NS_REL}" `);
    }
    zip.file(sheetPath, sheetXml);
  }

  // עדכון [Content_Types].xml
  let ct = await zip.file('[Content_Types].xml').async('string');
  if (!ct.includes('drawing+xml')) {
    const additions =
      `<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>` +
      charts.map((_, i) =>
        `<Override PartName="/xl/charts/chart${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`).join('');
    ct = ct.replace('</Types>', additions + '</Types>');
    zip.file('[Content_Types].xml', ct);
  }

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

module.exports = { injectCharts };
