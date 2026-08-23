const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const SVGtoPDF = require('svg-to-pdfkit');
const {
  RESERVASJON_FIRMA,
  buildReservasjonPdfModel
} = require('../shared/reservasjon');

const LOGO_PATH = path.join(__dirname, 'assets', 'logo.svg');
const LOGO_SVG = fs.existsSync(LOGO_PATH) ? fs.readFileSync(LOGO_PATH, 'utf8') : '';

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
  panel: '#F8FAFC',
  white: '#FFFFFF'
};

const SECTION_GAP = 16;
const FOOTER_H = 28;
const CLOSING_H = 54;
const CONTENT_BOTTOM = PAGE.footerY - FOOTER_H - CLOSING_H - 8;

function sectionTitleHeight() {
  return 20;
}

function drawLogo(doc, x, y, width) {
  if (!LOGO_SVG) return false;
  SVGtoPDF(doc, LOGO_SVG, x, y, { width, preserveAspectRatio: 'xMinYMin meet' });
  return true;
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
  doc.rect(0, 0, PAGE.w, 5).fill(C.accent);

  if (!drawLogo(doc, PAGE.left, 26, 138)) {
    doc.font('Helvetica-Bold').fontSize(20).fillColor(C.text)
      .text('X BILSENTER', PAGE.left, 30, { lineBreak: false });
  }

  const metaW = 196;
  const metaX = PAGE.right - metaW;
  const metaY = 22;
  const metaH = 58;

  doc.roundedRect(metaX, metaY, metaW, metaH, 8).fill(C.accentSoft);
  doc.roundedRect(metaX, metaY, metaW, metaH, 8).strokeColor('#CFE9D8').lineWidth(0.75).stroke();

  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.accentDark)
    .text('RESERVASJONSBEKREFTELSE', metaX + 12, metaY + 10, { width: metaW - 24, align: 'right', characterSpacing: 0.7 });
  doc.font('Helvetica').fontSize(8).fillColor(C.muted)
    .text(`${model.dokument.dato}  ·  Ref. ${model.dokument.referanse || '—'}`, metaX + 12, metaY + 24, { width: metaW - 24, align: 'right' });
  doc.font('Helvetica-Bold').fontSize(9).fillColor(C.text)
    .text(model.kunde.navn, metaX + 12, metaY + 38, { width: metaW - 24, align: 'right' });

  doc.moveTo(PAGE.left, 88).lineTo(PAGE.right, 88).strokeColor(C.line).lineWidth(1).stroke();
  return 102;
}

function drawIntro(doc, y, model) {
  doc.font('Helvetica-Bold').fontSize(16).fillColor(C.text)
    .text(model.dokument.tittel, PAGE.left, y);
  doc.font('Helvetica').fontSize(9.5).fillColor(C.muted)
    .text(model.dokument.undertittel, PAGE.left, doc.y + 6);

  const introBoxY = doc.y + 12;
  doc.roundedRect(PAGE.left, introBoxY, PAGE.width, 42, 8).fill(C.panel);
  doc.roundedRect(PAGE.left, introBoxY, PAGE.width, 42, 8).strokeColor(C.line).lineWidth(0.5).stroke();
  doc.font('Helvetica').fontSize(10.5).fillColor(C.text)
    .text(model.intro, PAGE.left + 14, introBoxY + 14, { width: PAGE.width - 28, lineGap: 2 });

  let nextY = introBoxY + 42 + 8;
  if (model.bil.finnUrl) {
    doc.font('Helvetica').fontSize(8.5).fillColor(C.muted)
      .text('FINN-annonse: ', PAGE.left, nextY, { continued: true });
    doc.fillColor(C.accentDark).text(model.bil.finnUrl, { link: model.bil.finnUrl, underline: false });
    nextY = doc.y + 6;
  }

  return nextY + SECTION_GAP;
}

function drawSectionTitle(doc, y, title) {
  doc.rect(PAGE.left, y + 1, 3, 12).fill(C.accent);
  doc.font('Helvetica-Bold').fontSize(9).fillColor(C.accentDark)
    .text(title.toUpperCase(), PAGE.left + 10, y, { characterSpacing: 0.7 });
  doc.moveTo(PAGE.left, y + 16).lineTo(PAGE.right, y + 16).strokeColor(C.line).lineWidth(0.4).stroke();
  return y + sectionTitleHeight();
}

function drawSummaryTable(doc, y, rows, rowH) {
  const pad = 12;
  const boxH = rows.length * rowH + pad * 2;
  const labelW = 150;

  doc.roundedRect(PAGE.left, y, PAGE.width, boxH, 8).fill(C.white);
  doc.roundedRect(PAGE.left, y, PAGE.width, boxH, 8).strokeColor(C.line).lineWidth(0.75).stroke();

  let rowY = y + pad;
  rows.forEach(function (row, index) {
    if (index > 0) {
      doc.moveTo(PAGE.left + 12, rowY).lineTo(PAGE.right - 12, rowY).strokeColor(C.line).lineWidth(0.35).stroke();
    }
    if (row.highlight) {
      doc.rect(PAGE.left + 8, rowY, PAGE.width - 16, rowH).fill('#F6FBF8');
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

function drawInnbytteComment(doc, y, kommentar) {
  const pad = 14;
  const boxH = 46;
  doc.roundedRect(PAGE.left, y, PAGE.width, boxH, 8).fill(C.white);
  doc.roundedRect(PAGE.left, y, PAGE.width, boxH, 8).strokeColor(C.line).lineWidth(0.75).stroke();
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.accentDark)
    .text('KOMMENTAR TIL INNBYTTEBIL', PAGE.left + pad, y + 10);
  doc.font('Helvetica').fontSize(9.5).fillColor(C.text)
    .text(kommentar, PAGE.left + pad, y + 24, { width: PAGE.width - pad * 2, lineGap: 2 });
  return y + boxH;
}

function drawPaymentBox(doc, y, payment, boxH) {
  const pad = 16;
  const innerW = PAGE.width - pad * 2 - 6;

  doc.roundedRect(PAGE.left, y, PAGE.width, boxH, 8).fill(C.accentSoft);
  doc.rect(PAGE.left, y, 4, boxH).fill(C.accent);
  doc.roundedRect(PAGE.left, y, PAGE.width, boxH, 8).strokeColor('#CFE9D8').lineWidth(0.75).stroke();

  doc.font('Helvetica-Bold').fontSize(10.5).fillColor(C.accentDark)
    .text(payment.title, PAGE.left + pad + 4, y + 14, { width: innerW });
  let lineY = y + 34;
  payment.lines.forEach(function (line) {
    doc.font('Helvetica').fontSize(10).fillColor(C.text)
      .text(line, PAGE.left + pad + 4, lineY, { width: innerW, lineGap: 2 });
    lineY = doc.y + 6;
  });

  return y + boxH;
}

function drawListContent(doc, x, y, width, items, options) {
  const opts = options || {};
  const fontSize = opts.fontSize || 9.5;
  const itemGap = opts.itemGap || (opts.numbered ? 9 : 7);
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
  const gap = 14;
  const colW = (PAGE.width - gap) / 2;
  const leftX = PAGE.left;
  const rightX = PAGE.left + colW + gap;

  const ty = titleAlreadyDrawn ? y + sectionTitleHeight() : drawSectionTitle(doc, y, 'Vilkår og neste steg');

  doc.roundedRect(leftX, ty, colW, boxH, 8).fill(C.white);
  doc.roundedRect(leftX, ty, colW, boxH, 8).strokeColor(C.line).lineWidth(0.75).stroke();
  doc.roundedRect(rightX, ty, colW, boxH, 8).fill(C.white);
  doc.roundedRect(rightX, ty, colW, boxH, 8).strokeColor(C.line).lineWidth(0.75).stroke();

  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.accentDark)
    .text('VILKÅR', leftX + 14, ty + 12);
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.accentDark)
    .text('NESTE STEG', rightX + 14, ty + 12);

  const listTop = ty + 30;
  const listGap = boxH > 175 ? 9 : 7;
  drawListContent(doc, leftX + 14, listTop, colW - 28, model.vilkar, { fontSize: 9.5, itemGap: listGap });
  drawListContent(doc, rightX + 14, listTop, colW - 28, model.nesteSteg, {
    numbered: true,
    fontSize: 9.5,
    itemGap: listGap + 1
  });

  return ty + boxH;
}

function drawClosing(doc, y, model) {
  doc.roundedRect(PAGE.left, y, PAGE.width, CLOSING_H, 8).fill(C.panel);
  doc.roundedRect(PAGE.left, y, PAGE.width, CLOSING_H, 8).strokeColor(C.line).lineWidth(0.75).stroke();

  doc.font('Helvetica').fontSize(10.5).fillColor(C.text)
    .text(model.avslutning, PAGE.left + 16, y + 16, { width: PAGE.width * 0.58, lineGap: 2 });

  const signX = PAGE.left + PAGE.width * 0.62;
  doc.moveTo(signX, y + 14).lineTo(PAGE.right - 16, y + 14).strokeColor(C.line).lineWidth(0.5).stroke();
  doc.font('Helvetica').fontSize(7.5).fillColor(C.muted).text('Signatur kunde', signX, y + 18);
  doc.moveTo(signX, y + CLOSING_H - 12).lineTo(PAGE.right - 16, y + CLOSING_H - 12).strokeColor(C.line).lineWidth(0.5).stroke();
}

function innbytteCommentHeight(model) {
  return model.innbytte?.kommentar ? 54 : 0;
}

function computeLayout(model, introEndY) {
  const summaryRows = model.summaryRows.length;
  const summaryPad = 24;
  const minSummaryRowH = 21;
  const maxSummaryRowH = 28;
  const minPaymentH = 76;
  const maxPaymentH = 88;
  const minTwoColH = 120;
  const commentExtra = innbytteCommentHeight(model);
  const sectionTitles = sectionTitleHeight() * 3;
  const gaps = SECTION_GAP * 2;
  const available = CONTENT_BOTTOM - introEndY - commentExtra;

  function usedHeight(rowH, payH, colH) {
    return sectionTitles + gaps + summaryPad + summaryRows * rowH + payH + colH;
  }

  for (let rowH = maxSummaryRowH; rowH >= minSummaryRowH; rowH -= 1) {
    for (let payH = maxPaymentH; payH >= minPaymentH; payH -= 2) {
      const remaining = available - usedHeight(rowH, payH, 0);
      const colH = Math.min(210, Math.max(minTwoColH, remaining));
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
    if (model.innbytte?.kommentar) {
      y += 8;
      y = drawInnbytteComment(doc, y, model.innbytte.kommentar);
    }
    y += SECTION_GAP;

    y = drawSectionTitle(doc, y, 'Depositum og betaling');
    y = drawPaymentBox(doc, y, model.payment, layout.paymentH);
    y += SECTION_GAP;

    const twoColSectionY = y;
    y = drawSectionTitle(doc, y, 'Vilkår og neste steg');
    const twoColH = Math.max(110, CONTENT_BOTTOM - y - 4);
    drawTwoColumnSections(doc, twoColSectionY, model, twoColH, true);

    drawClosing(doc, PAGE.footerY - FOOTER_H - CLOSING_H - 4, model);
    drawFooter(doc);

    doc.end();
  });
}

module.exports = {
  buildReservasjonPdfBuffer
};
