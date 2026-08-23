const PDFDocument = require('pdfkit');
const {
  RESERVASJON_FIRMA,
  buildReservasjonPdfModel
} = require('../shared/reservasjon');

const PAGE = {
  w: 595.28,
  h: 841.89,
  left: 48,
  right: 547,
  width: 499,
  footerY: 804
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

const SECTION_GAP = 18;
const CONTENT_BOTTOM = 726;
const CLOSING_H = 68;

function sectionTitleHeight() {
  return 18;
}

function drawFooter(doc) {
  doc.moveTo(PAGE.left, PAGE.footerY).lineTo(PAGE.right, PAGE.footerY).strokeColor(C.line).lineWidth(0.75).stroke();
  doc.font('Helvetica').fontSize(7.5).fillColor(C.muted)
    .text(
      `${RESERVASJON_FIRMA.navn} · ${RESERVASJON_FIRMA.adresse} · ${RESERVASJON_FIRMA.mobil} · ${RESERVASJON_FIRMA.epost} · ${RESERVASJON_FIRMA.web}`,
      PAGE.left,
      PAGE.footerY + 10,
      { width: PAGE.width, align: 'center', lineGap: 1 }
    );
}

function drawHeader(doc, model) {
  doc.rect(0, 0, PAGE.w, 6).fill(C.accent);

  doc.font('Helvetica-Bold').fontSize(22).fillColor(C.text)
    .text('X BILSENTER', PAGE.left, 28, { lineBreak: false });
  doc.font('Helvetica').fontSize(8).fillColor(C.muted)
    .text(RESERVASJON_FIRMA.tagline.toUpperCase(), PAGE.left, 54, { characterSpacing: 0.5 });

  const rx = PAGE.right - 190;
  doc.font('Helvetica-Bold').fontSize(9).fillColor(C.accentDark)
    .text('RESERVASJONSBEKREFTELSE', rx, 30, { width: 190, align: 'right', characterSpacing: 0.8 });
  doc.font('Helvetica').fontSize(8.5).fillColor(C.muted)
    .text(`${model.dokument.dato}  ·  Ref. ${model.dokument.referanse || '—'}`, rx, 46, { width: 190, align: 'right' });
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor(C.text)
    .text(model.kunde.navn, rx, 60, { width: 190, align: 'right' });

  doc.moveTo(PAGE.left, 82).lineTo(PAGE.right, 82).strokeColor(C.line).lineWidth(1).stroke();
  return 96;
}

function drawIntro(doc, y, model) {
  doc.font('Helvetica-Bold').fontSize(15).fillColor(C.text)
    .text(model.dokument.tittel, PAGE.left, y);
  doc.font('Helvetica').fontSize(9.5).fillColor(C.muted)
    .text(model.dokument.undertittel, PAGE.left, doc.y + 5);

  doc.font('Helvetica').fontSize(10.5).fillColor(C.text)
    .text(model.intro, PAGE.left, doc.y + 14, { width: PAGE.width, lineGap: 3 });

  if (model.bil.finnUrl) {
    doc.font('Helvetica').fontSize(8.5).fillColor(C.muted)
      .text('FINN-annonse: ', PAGE.left, doc.y + 6, { continued: true });
    doc.fillColor(C.accentDark).text(model.bil.finnUrl, { link: model.bil.finnUrl, underline: false });
  }

  return doc.y + SECTION_GAP;
}

function drawSectionTitle(doc, y, title) {
  doc.font('Helvetica-Bold').fontSize(9).fillColor(C.accentDark)
    .text(title.toUpperCase(), PAGE.left, y, { characterSpacing: 0.8 });
  doc.moveTo(PAGE.left, y + 13).lineTo(PAGE.right, y + 13).strokeColor(C.line).lineWidth(0.5).stroke();
  return y + sectionTitleHeight();
}

function drawSummaryTable(doc, y, rows, rowH) {
  const pad = 14;
  const boxH = rows.length * rowH + pad * 2;
  const labelW = 145;

  doc.roundedRect(PAGE.left, y, PAGE.width, boxH, 8).fill(C.panel);
  doc.roundedRect(PAGE.left, y, PAGE.width, boxH, 8).strokeColor(C.line).lineWidth(0.75).stroke();

  let rowY = y + pad;
  rows.forEach(function (row, index) {
    if (index > 0) {
      doc.moveTo(PAGE.left + 12, rowY).lineTo(PAGE.right - 12, rowY).strokeColor(C.line).lineWidth(0.4).stroke();
    }
    const valueY = rowY + Math.max(6, Math.round((rowH - 12) / 2));
    doc.font('Helvetica').fontSize(9).fillColor(C.muted)
      .text(row.label, PAGE.left + 14, valueY, { width: labelW });
    doc.font(row.highlight ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(row.highlight ? 11 : 10)
      .fillColor(C.text)
      .text(row.value, PAGE.left + 14 + labelW, valueY - (row.highlight ? 1 : 0), {
        width: PAGE.width - labelW - 28,
        align: 'right'
      });
    rowY += rowH;
  });

  return y + boxH;
}

function drawPaymentBox(doc, y, payment, boxH) {
  const pad = 16;
  const innerW = PAGE.width - pad * 2 - 6;

  doc.roundedRect(PAGE.left, y, PAGE.width, boxH, 8).fill(C.accentSoft);
  doc.rect(PAGE.left, y, 5, boxH).fill(C.accent);
  doc.roundedRect(PAGE.left, y, PAGE.width, boxH, 8).strokeColor('#CFE9D8').lineWidth(0.75).stroke();

  doc.font('Helvetica-Bold').fontSize(10.5).fillColor(C.accentDark)
    .text(payment.title, PAGE.left + pad + 4, y + 16, { width: innerW });
  let lineY = y + 36;
  payment.lines.forEach(function (line) {
    doc.font('Helvetica').fontSize(10).fillColor(C.text)
      .text(line, PAGE.left + pad + 4, lineY, { width: innerW, lineGap: 3 });
    lineY = doc.y + 8;
  });

  return y + boxH;
}

function drawListContent(doc, x, y, width, items, options) {
  const opts = options || {};
  const fontSize = opts.fontSize || 9.5;
  const itemGap = opts.itemGap || (opts.numbered ? 10 : 8);
  let cy = y;

  items.forEach(function (item, index) {
    const prefix = opts.numbered ? `${index + 1}.` : '•';
    doc.font('Helvetica-Bold').fontSize(fontSize).fillColor(opts.numbered ? C.accentDark : C.muted)
      .text(prefix, x, cy, { width: 16 });
    doc.font('Helvetica').fontSize(fontSize).fillColor(C.text)
      .text(item, x + 16, cy, { width: width - 16, lineGap: 2 });
    cy = doc.y + itemGap;
  });

  return cy;
}

function drawTwoColumnSections(doc, y, model, boxH, titleAlreadyDrawn) {
  const gap = 16;
  const colW = (PAGE.width - gap) / 2;
  const leftX = PAGE.left;
  const rightX = PAGE.left + colW + gap;

  const ty = titleAlreadyDrawn ? y + sectionTitleHeight() : drawSectionTitle(doc, y, 'Vilkår og neste steg');

  doc.roundedRect(leftX, ty, colW, boxH, 8).fill('#FFFFFF');
  doc.roundedRect(leftX, ty, colW, boxH, 8).strokeColor(C.line).lineWidth(0.75).stroke();
  doc.roundedRect(rightX, ty, colW, boxH, 8).fill('#FFFFFF');
  doc.roundedRect(rightX, ty, colW, boxH, 8).strokeColor(C.line).lineWidth(0.75).stroke();

  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.accentDark)
    .text('VILKÅR', leftX + 14, ty + 14);
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.accentDark)
    .text('NESTE STEG', rightX + 14, ty + 14);

  const listTop = ty + 34;
  const listGap = boxH > 190 ? 10 : 8;
  drawListContent(doc, leftX + 14, listTop, colW - 28, model.vilkar, { fontSize: 9.5, itemGap: listGap });
  drawListContent(doc, rightX + 14, listTop, colW - 28, model.nesteSteg, {
    numbered: true,
    fontSize: 9.5,
    itemGap: listGap + 2
  });

  return ty + boxH;
}

function drawClosing(doc, y, model) {
  doc.roundedRect(PAGE.left, y, PAGE.width, CLOSING_H, 8).fill(C.panel);
  doc.roundedRect(PAGE.left, y, PAGE.width, CLOSING_H, 8).strokeColor(C.line).lineWidth(0.75).stroke();

  doc.font('Helvetica').fontSize(10.5).fillColor(C.text)
    .text(model.avslutning, PAGE.left + 16, y + 16, { width: PAGE.width * 0.58, lineGap: 2 });

  const signX = PAGE.left + PAGE.width * 0.6;
  doc.font('Helvetica').fontSize(9).fillColor(C.muted).text('Med vennlig hilsen,', signX, y + 14);
  doc.font('Helvetica-Bold').fontSize(11).fillColor(C.text).text(model.firma.navn, signX, doc.y + 4);
  doc.font('Helvetica-Oblique').fontSize(9).fillColor(C.muted).text(model.firma.tagline, signX, doc.y + 3);

  doc.moveTo(signX, y + CLOSING_H - 16).lineTo(PAGE.right - 16, y + CLOSING_H - 16).strokeColor(C.line).lineWidth(0.5).stroke();
  doc.font('Helvetica').fontSize(7.5).fillColor(C.muted)
    .text('Signatur kunde', signX, y + CLOSING_H - 12);
}

function computeLayout(model, introEndY) {
  const summaryRows = model.summaryRows.length;
  const summaryPad = 28;
  const minSummaryRowH = 24;
  const maxSummaryRowH = 32;
  const minPaymentH = 84;
  const maxPaymentH = 98;
  const minTwoColH = 168;
  const sectionTitles = sectionTitleHeight() * 3;
  const gaps = SECTION_GAP * 4;
  const available = CONTENT_BOTTOM - introEndY;

  function usedHeight(rowH, payH, colH) {
    return sectionTitles + gaps + summaryPad + summaryRows * rowH + payH + colH + CLOSING_H;
  }

  for (let rowH = maxSummaryRowH; rowH >= minSummaryRowH; rowH -= 1) {
    for (let payH = maxPaymentH; payH >= minPaymentH; payH -= 2) {
      const remaining = available - usedHeight(rowH, payH, 0);
      const colH = Math.min(240, Math.max(minTwoColH, remaining));
      if (usedHeight(rowH, payH, colH) <= available) {
        return { summaryRowH: rowH, paymentH: payH, twoColH: colH };
      }
    }
  }

  return { summaryRowH: minSummaryRowH, paymentH: minPaymentH, twoColH: minTwoColH };
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
    const layout = computeLayout(model, y);

    y = drawSectionTitle(doc, y, 'Avtalen i korthet');
    y = drawSummaryTable(doc, y, model.summaryRows, layout.summaryRowH);
    y += SECTION_GAP;

    y = drawSectionTitle(doc, y, 'Depositum og betaling');
    y = drawPaymentBox(doc, y, model.payment, layout.paymentH);
    y += SECTION_GAP;

    const twoColSectionY = y;
    y = drawSectionTitle(doc, y, 'Vilkår og neste steg');
    const twoColH = Math.max(168, CONTENT_BOTTOM - y);
    drawTwoColumnSections(doc, twoColSectionY, model, twoColH, true);
    drawClosing(doc, CONTENT_BOTTOM, model);
    drawFooter(doc);

    doc.end();
  });
}

module.exports = {
  buildReservasjonPdfBuffer
};
