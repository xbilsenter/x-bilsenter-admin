const PDFDocument = require('pdfkit');
const {
  RESERVASJON_FIRMA,
  buildReservasjonPdfModel
} = require('../shared/reservasjon');

const M = { t: 36, b: 34, l: 40, r: 40 };
const PAGE = {
  w: 595.28,
  h: 841.89,
  left: M.l,
  right: 595.28 - M.r,
  width: 595.28 - M.l - M.r,
  bottom: 841.89 - M.b
};

const C = {
  accent: '#19BA60',
  accentSoft: '#EDF7F0',
  accentDark: '#0F7A3D',
  text: '#111827',
  muted: '#64748B',
  line: '#E2E8F0',
  panel: '#F8FAFC'
};

function drawFooter(doc) {
  const y = PAGE.bottom - 10;
  doc.moveTo(PAGE.left, y).lineTo(PAGE.right, y).strokeColor(C.line).lineWidth(0.5).stroke();
  doc.font('Helvetica').fontSize(6.5).fillColor(C.muted)
    .text(
      `${RESERVASJON_FIRMA.navn} · ${RESERVASJON_FIRMA.adresse} · ${RESERVASJON_FIRMA.mobil} · ${RESERVASJON_FIRMA.epost} · ${RESERVASJON_FIRMA.web}`,
      PAGE.left,
      y + 5,
      { width: PAGE.width, align: 'center' }
    );
}

function drawHeader(doc, model) {
  doc.rect(0, 0, PAGE.w, 3.5).fill(C.accent);

  doc.font('Helvetica-Bold').fontSize(13).fillColor(C.text)
    .text('X BILSENTER', PAGE.left, M.t - 18, { lineBreak: false });
  doc.font('Helvetica').fontSize(6.5).fillColor(C.muted)
    .text(RESERVASJON_FIRMA.tagline.toUpperCase(), PAGE.left, M.t - 2, { characterSpacing: 0.4 });

  const rx = PAGE.right - 168;
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(C.accentDark)
    .text('RESERVASJONSBEKREFTELSE', rx, M.t - 16, { width: 168, align: 'right', characterSpacing: 0.6 });
  doc.font('Helvetica').fontSize(7).fillColor(C.muted)
    .text(`${model.dokument.dato} · Ref. ${model.dokument.referanse || '—'}`, rx, M.t - 4, { width: 168, align: 'right' });
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(C.text)
    .text(model.kunde.navn, rx, M.t + 6, { width: 168, align: 'right' });

  doc.moveTo(PAGE.left, M.t + 18).lineTo(PAGE.right, M.t + 18).strokeColor(C.line).lineWidth(0.75).stroke();
  return M.t + 26;
}

function drawIntro(doc, y, model) {
  doc.font('Helvetica').fontSize(8.5).fillColor(C.text)
    .text(model.intro, PAGE.left, y, { width: PAGE.width, lineGap: 0 });
  if (model.bil.finnUrl) {
    doc.font('Helvetica').fontSize(7).fillColor(C.muted)
      .text('FINN: ', PAGE.left, doc.y + 3, { continued: true, lineGap: 0 });
    doc.fillColor(C.accentDark).text(model.bil.finnUrl, { link: model.bil.finnUrl, underline: false });
  }
  return doc.y + 8;
}

function drawSectionLabel(doc, y, title) {
  doc.font('Helvetica-Bold').fontSize(7).fillColor(C.accentDark)
    .text(title.toUpperCase(), PAGE.left, y, { characterSpacing: 0.7 });
  return y + 11;
}

function drawSummaryGrid(doc, y, rows) {
  const cols = 2;
  const colW = (PAGE.width - 10) / cols;
  const rowH = 15;
  const pairs = [];
  for (let i = 0; i < rows.length; i += cols) {
    pairs.push(rows.slice(i, i + cols));
  }
  const boxH = pairs.length * rowH + 10;

  doc.roundedRect(PAGE.left, y, PAGE.width, boxH, 4).fill(C.panel);
  doc.roundedRect(PAGE.left, y, PAGE.width, boxH, 4).strokeColor(C.line).lineWidth(0.5).stroke();

  let rowY = y + 5;
  pairs.forEach(function (pair, rowIndex) {
    if (rowIndex > 0) {
      doc.moveTo(PAGE.left + 8, rowY).lineTo(PAGE.right - 8, rowY).strokeColor(C.line).lineWidth(0.35).stroke();
    }
    pair.forEach(function (cell, colIndex) {
      const x = PAGE.left + 8 + colIndex * colW;
      doc.font('Helvetica').fontSize(7).fillColor(C.muted).text(cell.label, x, rowY + 3, { width: 78 });
      doc.font(cell.highlight ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(cell.highlight ? 8.5 : 8)
        .fillColor(C.text)
        .text(cell.value, x + 82, rowY + 2, { width: colW - 90 });
    });
    rowY += rowH;
  });

  return y + boxH + 8;
}

function drawPaymentStrip(doc, y, payment) {
  const text = payment.lines.join(' ');
  const padX = 10;
  const innerW = PAGE.width - padX * 2 - 4;
  doc.font('Helvetica').fontSize(7.5);
  const textH = doc.heightOfString(text, { width: innerW, lineGap: 1 });
  const boxH = textH + 18;

  doc.roundedRect(PAGE.left, y, PAGE.width, boxH, 4).fill(C.accentSoft);
  doc.rect(PAGE.left, y, 3, boxH).fill(C.accent);
  doc.roundedRect(PAGE.left, y, PAGE.width, boxH, 4).strokeColor('#CFE9D8').lineWidth(0.5).stroke();

  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(C.accentDark)
    .text(payment.title, PAGE.left + padX + 2, y + 5, { width: innerW });
  doc.font('Helvetica').fontSize(7.5).fillColor(C.text)
    .text(text, PAGE.left + padX + 2, y + 14, { width: innerW, lineGap: 1 });

  return y + boxH + 8;
}

function drawCompactList(doc, x, y, width, items, options) {
  const opts = options || {};
  const fontSize = opts.fontSize || 7;
  const gap = opts.gap || 3;
  let cy = y;

  items.forEach(function (item, index) {
    const prefix = opts.numbered ? `${index + 1}.` : '•';
    doc.font('Helvetica-Bold').fontSize(fontSize).fillColor(opts.numbered ? C.accentDark : C.muted)
      .text(prefix, x, cy, { width: 12, lineGap: 0 });
    doc.font('Helvetica').fontSize(fontSize).fillColor(C.text)
      .text(item, x + 13, cy, { width: width - 13, lineGap: 0.5 });
    cy = doc.y + gap;
  });

  return cy;
}

function drawTwoColumnSections(doc, y, model) {
  const gap = 12;
  const colW = (PAGE.width - gap) / 2;
  const leftX = PAGE.left;
  const rightX = PAGE.left + colW + gap;
  const startY = y;

  let leftY = drawSectionLabel(doc, startY, 'Vilkår');
  leftY = drawCompactList(doc, leftX, leftY, colW, model.vilkar, { fontSize: 7, gap: 2.5 });

  let rightY = drawSectionLabel(doc, startY, 'Neste steg');
  rightY = drawCompactList(doc, rightX, rightY, colW, model.nesteSteg, { numbered: true, fontSize: 7, gap: 2.5 });

  return Math.max(leftY, rightY) + 6;
}

function drawClosing(doc, y, model) {
  doc.font('Helvetica').fontSize(8).fillColor(C.text)
    .text(model.avslutning, PAGE.left, y, { width: PAGE.width * 0.62, lineGap: 0 });

  const signX = PAGE.left + PAGE.width * 0.62 + 8;
  doc.font('Helvetica').fontSize(7).fillColor(C.muted).text('Med vennlig hilsen,', signX, y);
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.text).text(model.firma.navn, signX, doc.y + 2);
  doc.font('Helvetica-Oblique').fontSize(7).fillColor(C.muted).text(model.firma.tagline, signX, doc.y + 1);

  return doc.y + 6;
}

function buildReservasjonPdfBuffer(bil, kunde, reservasjonRaw) {
  const model = buildReservasjonPdfModel(bil, kunde, reservasjonRaw);

  return new Promise(function (resolve, reject) {
    const doc = new PDFDocument({ size: 'A4', margin: 0 });
    const chunks = [];
    doc.on('data', function (chunk) { chunks.push(chunk); });
    doc.on('end', function () { resolve(Buffer.concat(chunks)); });
    doc.on('error', reject);

    let y = drawHeader(doc, model);
    y = drawIntro(doc, y, model);

    y = drawSectionLabel(doc, y, 'Avtalen i korthet');
    y = drawSummaryGrid(doc, y, model.summaryRows);

    y = drawSectionLabel(doc, y, 'Depositum og betaling');
    y = drawPaymentStrip(doc, y, model.payment);

    y = drawTwoColumnSections(doc, y, model);
    y = drawClosing(doc, y, model);
    drawFooter(doc);

    doc.end();
  });
}

module.exports = {
  buildReservasjonPdfBuffer
};
