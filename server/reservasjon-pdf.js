const PDFDocument = require('pdfkit');
const {
  RESERVASJON_FIRMA,
  buildReservasjonPdfModel
} = require('../shared/reservasjon');

const PAGE = { left: 45, right: 550, width: 505 };
const COLORS = {
  accent: '#19BA60',
  accentSoft: '#E8F8EF',
  accentDark: '#128C47',
  text: '#111827',
  muted: '#6B7280',
  line: '#E5E7EB',
  panel: '#F8FAF9',
  white: '#FFFFFF'
};

function ensureSpace(doc, y, needed, drawPageFooter) {
  const limit = doc.page.height - 72;
  if (y + needed <= limit) return y;
  drawPageFooter(doc);
  doc.addPage();
  return 52;
}

function drawPageHeader(doc) {
  doc.save();
  doc.rect(0, 0, doc.page.width, 8).fill(COLORS.accent);
  doc.restore();

  doc.font('Helvetica-Bold').fontSize(20).fillColor(COLORS.text)
    .text('X BILSENTER', PAGE.left, 28, { lineBreak: false });
  doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.muted)
    .text(RESERVASJON_FIRMA.tagline.toUpperCase(), PAGE.left, 50, { characterSpacing: 0.6 });

  doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.accentDark)
    .text('RESERVASJON', PAGE.right - 130, 30, { width: 130, align: 'right', characterSpacing: 1.1 });
  doc.font('Helvetica').fontSize(8).fillColor(COLORS.muted)
    .text('Bekreftelse', PAGE.right - 130, 43, { width: 130, align: 'right' });

  doc.moveTo(PAGE.left, 68).lineTo(PAGE.right, 68).strokeColor(COLORS.line).lineWidth(1).stroke();
}

function drawPageFooter(doc) {
  const y = doc.page.height - 42;
  doc.moveTo(PAGE.left, y).lineTo(PAGE.right, y).strokeColor(COLORS.line).lineWidth(0.5).stroke();
  doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.muted)
    .text(
      `${RESERVASJON_FIRMA.navn} · ${RESERVASJON_FIRMA.adresse} · ${RESERVASJON_FIRMA.mobil} · ${RESERVASJON_FIRMA.epost} · ${RESERVASJON_FIRMA.web}`,
      PAGE.left,
      y + 8,
      { width: PAGE.width, align: 'center' }
    );
}

function drawMetaRow(doc, y, model) {
  const leftW = PAGE.width * 0.55;
  const rightW = PAGE.width - leftW - 12;

  doc.font('Helvetica-Bold').fontSize(16).fillColor(COLORS.text)
    .text(model.dokument.tittel, PAGE.left, y, { width: leftW });
  doc.font('Helvetica').fontSize(10).fillColor(COLORS.muted)
    .text(model.dokument.undertittel, PAGE.left, doc.y + 4, { width: leftW });

  const metaX = PAGE.left + leftW + 12;
  let metaY = y + 2;
  const metaItems = [
    ['Dato', model.dokument.dato],
    ['Referanse', model.dokument.referanse || '—'],
    ['Kunde', model.kunde.navn]
  ];
  metaItems.forEach(function (item) {
    doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.muted)
      .text(item[0].toUpperCase(), metaX, metaY, { width: rightW, characterSpacing: 0.5 });
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(COLORS.text)
      .text(item[1], metaX, metaY + 10, { width: rightW });
    metaY += 28;
  });

  return Math.max(doc.y, metaY) + 16;
}

function drawIntro(doc, y, model) {
  doc.font('Helvetica').fontSize(10.5).fillColor(COLORS.text)
    .text(model.intro, PAGE.left, y, { width: PAGE.width, lineGap: 2 });
  if (model.bil.finnUrl) {
    doc.font('Helvetica').fontSize(9).fillColor(COLORS.muted)
      .text('Annonse: ', PAGE.left, doc.y + 6, { continued: true });
    doc.fillColor(COLORS.accentDark).text(model.bil.finnUrl, { link: model.bil.finnUrl, underline: true });
  }
  return doc.y + 18;
}

function drawSectionTitle(doc, y, title) {
  doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.accentDark)
    .text(title.toUpperCase(), PAGE.left, y, { characterSpacing: 0.8 });
  doc.moveTo(PAGE.left, y + 14).lineTo(PAGE.right, y + 14).strokeColor(COLORS.line).lineWidth(0.5).stroke();
  return y + 22;
}

function drawSummaryTable(doc, y, rows) {
  const rowH = 24;
  const labelW = 150;
  const boxH = rows.length * rowH + 16;
  doc.roundedRect(PAGE.left, y, PAGE.width, boxH, 8).fill(COLORS.panel);
  doc.roundedRect(PAGE.left, y, PAGE.width, boxH, 8).strokeColor(COLORS.line).lineWidth(0.75).stroke();

  let rowY = y + 8;
  rows.forEach(function (row, index) {
    if (index > 0) {
      doc.moveTo(PAGE.left + 12, rowY).lineTo(PAGE.right - 12, rowY).strokeColor(COLORS.line).lineWidth(0.5).stroke();
    }
    doc.font('Helvetica').fontSize(9).fillColor(COLORS.muted)
      .text(row.label, PAGE.left + 14, rowY + 7, { width: labelW });
    doc.font(row.highlight ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(row.highlight ? 10.5 : 9.5)
      .fillColor(row.highlight ? COLORS.text : COLORS.text)
      .text(row.value, PAGE.left + 14 + labelW, rowY + 6, { width: PAGE.width - labelW - 28 });
    rowY += rowH;
  });

  return y + boxH + 18;
}

function drawPaymentBox(doc, y, payment) {
  const padding = 14;
  const innerW = PAGE.width - padding * 2 - 6;
  doc.font('Helvetica').fontSize(9.5);
  const textH = payment.lines.reduce(function (sum, line) {
    return sum + doc.heightOfString(line, { width: innerW, lineGap: 2 }) + 4;
  }, 0);
  const boxH = textH + 38;

  doc.save();
  doc.roundedRect(PAGE.left, y, PAGE.width, boxH, 8).fill(COLORS.accentSoft);
  doc.roundedRect(PAGE.left, y, 5, boxH, 8).fill(COLORS.accent);
  doc.roundedRect(PAGE.left, y, PAGE.width, boxH, 8).strokeColor('#CFE9D8').lineWidth(0.75).stroke();
  doc.restore();

  doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.accentDark)
    .text(payment.title, PAGE.left + padding + 4, y + 12, { width: innerW });

  let lineY = y + 30;
  payment.lines.forEach(function (line) {
    doc.font('Helvetica').fontSize(9.5).fillColor(COLORS.text)
      .text(line, PAGE.left + padding + 4, lineY, { width: innerW, lineGap: 2 });
    lineY = doc.y + 4;
  });

  return y + boxH + 18;
}

function drawBulletList(doc, y, items, options) {
  const opts = options || {};
  const bullet = opts.bullet || '•';
  const fontSize = opts.fontSize || 9;
  const color = opts.color || COLORS.text;
  let currentY = y;

  items.forEach(function (item, index) {
    const prefix = opts.numbered ? `${index + 1}.` : bullet;
    doc.font('Helvetica-Bold').fontSize(fontSize).fillColor(opts.numbered ? COLORS.accentDark : COLORS.muted)
      .text(prefix, PAGE.left, currentY, { width: 16 });
    doc.font('Helvetica').fontSize(fontSize).fillColor(color)
      .text(item, PAGE.left + 18, currentY, { width: PAGE.width - 18, lineGap: 2 });
    currentY = doc.y + 6;
  });

  return currentY + 8;
}

function drawClosing(doc, y, model) {
  doc.font('Helvetica').fontSize(10.5).fillColor(COLORS.text)
    .text(model.avslutning, PAGE.left, y, { width: PAGE.width, lineGap: 2 });
  y = doc.y + 16;
  doc.text('Med vennlig hilsen,', PAGE.left, y);
  y = doc.y + 14;
  doc.font('Helvetica-Bold').fontSize(11).fillColor(COLORS.text)
    .text(model.firma.navn, PAGE.left, y);
  y = doc.y + 4;
  doc.font('Helvetica-Oblique').fontSize(9.5).fillColor(COLORS.muted)
    .text(model.firma.tagline, PAGE.left, y);
  return doc.y + 10;
}

function buildReservasjonPdfBuffer(bil, kunde, reservasjonRaw) {
  const model = buildReservasjonPdfModel(bil, kunde, reservasjonRaw);

  return new Promise(function (resolve, reject) {
    const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true });
    const chunks = [];
    doc.on('data', function (chunk) { chunks.push(chunk); });
    doc.on('end', function () { resolve(Buffer.concat(chunks)); });
    doc.on('error', reject);

    drawPageHeader(doc);
    let y = 82;
    y = drawMetaRow(doc, y, model);
    y = drawIntro(doc, y, model);

    y = ensureSpace(doc, y, 180, drawPageFooter);
    y = drawSectionTitle(doc, y, 'Avtalen i korthet');
    y = drawSummaryTable(doc, y, model.summaryRows);

    y = ensureSpace(doc, y, 120, drawPageFooter);
    y = drawSectionTitle(doc, y, 'Depositum og betaling');
    y = drawPaymentBox(doc, y, model.payment);

    y = ensureSpace(doc, y, 110, drawPageFooter);
    y = drawSectionTitle(doc, y, 'Vilkår');
    y = drawBulletList(doc, y, model.vilkar);

    y = ensureSpace(doc, y, 90, drawPageFooter);
    y = drawSectionTitle(doc, y, 'Neste steg');
    y = drawBulletList(doc, y, model.nesteSteg, { numbered: true });

    y = ensureSpace(doc, y, 70, drawPageFooter);
    drawClosing(doc, y, model);
    drawPageFooter(doc);

    doc.end();
  });
}

module.exports = {
  buildReservasjonPdfBuffer
};
