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
  white: '#FFFFFF',
  page: '#FAFCFB'
};

const SECTION_GAP = 14;
const FOOTER_H = 28;
const CLOSING_H = 52;
const CONTENT_BOTTOM = PAGE.footerY - FOOTER_H - CLOSING_H - 10;
const COL_HEADER_H = 26;

function sectionTitleHeight() {
  return 22;
}

function drawLogo(doc, x, y, width) {
  if (!LOGO_SVG) return false;
  SVGtoPDF(doc, LOGO_SVG, x, y, { width, preserveAspectRatio: 'xMinYMin meet' });
  return true;
}

function drawFooter(doc) {
  doc.rect(PAGE.left, PAGE.footerY - 4, PAGE.width, FOOTER_H + 14).fill('#FAFCFB');
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
  doc.rect(0, 0, PAGE.w, 4).fill(C.accent);
  doc.rect(0, 4, PAGE.w, 84).fill(C.white);
  doc.moveTo(PAGE.left, 88).lineTo(PAGE.right, 88).strokeColor(C.line).lineWidth(1).stroke();

  if (!drawLogo(doc, PAGE.left, 28, 132)) {
    doc.font('Helvetica-Bold').fontSize(20).fillColor(C.text)
      .text('X BILSENTER', PAGE.left, 32, { lineBreak: false });
  }

  const metaW = 200;
  const metaX = PAGE.right - metaW;
  const metaY = 24;

  doc.roundedRect(metaX, metaY, metaW, 56, 8).fill(C.accentSoft);
  doc.roundedRect(metaX, metaY, metaW, 56, 8).strokeColor('#CFE9D8').lineWidth(0.75).stroke();

  doc.font('Helvetica-Bold').fontSize(8).fillColor(C.accentDark)
    .text('RESERVASJONSBEKREFTELSE', metaX + 12, metaY + 10, { width: metaW - 24, align: 'right', characterSpacing: 0.8 });
  doc.font('Helvetica').fontSize(7.5).fillColor(C.muted)
    .text(`${model.dokument.dato}  ·  Ref. ${model.dokument.referanse || '—'}`, metaX + 12, metaY + 23, { width: metaW - 24, align: 'right' });
  doc.font('Helvetica-Bold').fontSize(9).fillColor(C.text)
    .text(model.kunde.navn, metaX + 12, metaY + 36, { width: metaW - 24, align: 'right' });

  return 98;
}

function drawIntro(doc, y, model) {
  doc.font('Helvetica-Bold').fontSize(17).fillColor(C.text)
    .text(model.dokument.tittel, PAGE.left, y);
  doc.font('Helvetica').fontSize(9).fillColor(C.muted)
    .text(model.dokument.undertittel.toUpperCase(), PAGE.left, doc.y + 5, { characterSpacing: 0.6 });

  doc.font('Helvetica').fontSize(10.5);
  const introTextH = doc.heightOfString(model.intro, { width: PAGE.width - 28, lineGap: 2 });
  const introBoxH = Math.max(36, introTextH + 24);
  const introBoxY = doc.y + 10;

  doc.roundedRect(PAGE.left, introBoxY, PAGE.width, introBoxH, 8).fill(C.panel);
  doc.roundedRect(PAGE.left, introBoxY, PAGE.width, introBoxH, 8).strokeColor(C.line).lineWidth(0.5).stroke();
  doc.font('Helvetica').fontSize(10.5).fillColor(C.text)
    .text(model.intro, PAGE.left + 14, introBoxY + 12, { width: PAGE.width - 28, lineGap: 2 });

  let nextY = introBoxY + introBoxH + 8;
  if (model.bil.finnUrl) {
    doc.font('Helvetica').fontSize(8).fillColor(C.muted)
      .text('FINN-annonse: ', PAGE.left, nextY, { continued: true });
    doc.fillColor(C.accentDark).text(model.bil.finnUrl, { link: model.bil.finnUrl, underline: false });
    nextY = doc.y + 4;
  }

  return nextY + SECTION_GAP;
}

function drawSectionTitle(doc, y, title) {
  doc.rect(PAGE.left, y + 2, 3, 11).fill(C.accent);
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.accentDark)
    .text(title.toUpperCase(), PAGE.left + 11, y, { characterSpacing: 0.75 });
  doc.moveTo(PAGE.left, y + 17).lineTo(PAGE.right, y + 17).strokeColor(C.line).lineWidth(0.4).stroke();
  return y + sectionTitleHeight();
}

function drawSummaryTable(doc, y, rows, rowH) {
  const pad = 10;
  const boxH = rows.length * rowH + pad * 2;
  const labelW = 152;

  doc.roundedRect(PAGE.left, y, PAGE.width, boxH, 8).fill(C.white);
  doc.roundedRect(PAGE.left, y, PAGE.width, boxH, 8).strokeColor(C.line).lineWidth(0.75).stroke();

  let rowY = y + pad;
  rows.forEach(function (row, index) {
    if (index > 0) {
      doc.moveTo(PAGE.left + 10, rowY).lineTo(PAGE.right - 10, rowY).strokeColor(C.line).lineWidth(0.35).stroke();
    }
    if (row.highlight) {
      doc.rect(PAGE.left + 6, rowY, PAGE.width - 12, rowH).fill('#F6FBF8');
    } else if (index % 2 === 1) {
      doc.rect(PAGE.left + 6, rowY, PAGE.width - 12, rowH).fill('#FCFDFE');
    }
    const valueY = rowY + Math.max(5, Math.round((rowH - 11) / 2));
    doc.font('Helvetica').fontSize(8.5).fillColor(C.muted)
      .text(row.label, PAGE.left + 12, valueY, { width: labelW });
    doc.font(row.highlight ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(row.highlight ? 10.5 : 9.5)
      .fillColor(C.text)
      .text(row.value, PAGE.left + 12 + labelW, valueY - (row.highlight ? 1 : 0), {
        width: PAGE.width - labelW - 24,
        align: 'right'
      });
    rowY += rowH;
  });

  return y + boxH;
}

function drawInnbytteComment(doc, y, kommentar) {
  const pad = 12;
  doc.font('Helvetica').fontSize(9);
  const textH = doc.heightOfString(kommentar, { width: PAGE.width - pad * 2, lineGap: 1.5 });
  const boxH = Math.max(40, textH + 28);

  doc.roundedRect(PAGE.left, y, PAGE.width, boxH, 8).fill(C.white);
  doc.roundedRect(PAGE.left, y, PAGE.width, boxH, 8).strokeColor(C.line).lineWidth(0.75).stroke();
  doc.font('Helvetica-Bold').fontSize(8).fillColor(C.accentDark)
    .text('KOMMENTAR TIL INNBYTTEBIL', PAGE.left + pad, y + 9, { characterSpacing: 0.5 });
  doc.font('Helvetica').fontSize(9).fillColor(C.text)
    .text(kommentar, PAGE.left + pad, y + 22, { width: PAGE.width - pad * 2, lineGap: 1.5 });
  return y + boxH;
}

function drawPaymentBox(doc, y, payment, boxH) {
  const pad = 14;
  const innerW = PAGE.width - pad * 2 - 4;

  doc.roundedRect(PAGE.left, y, PAGE.width, boxH, 8).fill(C.accentSoft);
  doc.rect(PAGE.left, y, 4, boxH).fill(C.accent);
  doc.roundedRect(PAGE.left, y, PAGE.width, boxH, 8).strokeColor('#CFE9D8').lineWidth(0.75).stroke();

  doc.font('Helvetica-Bold').fontSize(10).fillColor(C.accentDark)
    .text(payment.title, PAGE.left + pad + 2, y + 12, { width: innerW });
  let lineY = y + 30;
  payment.lines.forEach(function (line) {
    doc.font('Helvetica').fontSize(9.5).fillColor(C.text)
      .text(line, PAGE.left + pad + 2, lineY, { width: innerW, lineGap: 1.5 });
    lineY = doc.y + 5;
  });

  return y + boxH;
}

function measureListHeight(doc, items, width, fontSize, itemGap, lineGap, numbered) {
  const textW = width - 14;
  let total = 0;

  items.forEach(function (item, index) {
    doc.font('Helvetica').fontSize(fontSize);
    const h = doc.heightOfString(item, { width: textW, lineGap: lineGap });
    total += Math.max(h, fontSize + 1);
    if (index < items.length - 1) total += itemGap;
  });

  return total;
}

function resolveListFit(doc, items, width, maxHeight, numbered) {
  for (let fontSize = 9; fontSize >= 7; fontSize -= 0.5) {
    for (let itemGap = 7; itemGap >= 3; itemGap -= 1) {
      const lineGap = fontSize <= 7.5 ? 1 : 1.5;
      const h = measureListHeight(doc, items, width, fontSize, itemGap, lineGap, numbered);
      if (h <= maxHeight) {
        return { fontSize, itemGap, lineGap };
      }
    }
  }
  return { fontSize: 7, itemGap: 2, lineGap: 0.8 };
}

function drawListInBox(doc, x, y, width, maxHeight, items, numbered, fit) {
  doc.save();
  doc.rect(x, y, width, maxHeight).clip();

  let cy = y;
  const textW = width - 14;

  items.forEach(function (item, index) {
    const prefix = numbered ? `${index + 1}.` : '•';
    doc.font('Helvetica-Bold').fontSize(fit.fontSize).fillColor(numbered ? C.accentDark : C.muted)
      .text(prefix, x, cy, { width: 12, lineBreak: false });
    doc.font('Helvetica').fontSize(fit.fontSize).fillColor(C.text)
      .text(item, x + 12, cy, { width: textW, lineGap: fit.lineGap });
    cy = doc.y + (index < items.length - 1 ? fit.itemGap : 0);
  });

  doc.restore();
  return cy;
}

function drawTwoColumnSections(doc, y, model, boxH, titleAlreadyDrawn) {
  const gap = 12;
  const colW = (PAGE.width - gap) / 2;
  const leftX = PAGE.left;
  const rightX = PAGE.left + colW + gap;
  const pad = 10;

  const ty = titleAlreadyDrawn ? y + sectionTitleHeight() : drawSectionTitle(doc, y, 'Vilkår og neste steg');
  const listMaxH = boxH - COL_HEADER_H - pad - 6;

  [leftX, rightX].forEach(function (x) {
    doc.roundedRect(x, ty, colW, boxH, 8).fill(C.white);
    doc.roundedRect(x, ty, colW, boxH, 8).strokeColor(C.line).lineWidth(0.75).stroke();
    doc.rect(x, ty, colW, COL_HEADER_H).fill(C.accentSoft);
    doc.moveTo(x, ty + COL_HEADER_H).lineTo(x + colW, ty + COL_HEADER_H).strokeColor('#D9ECE2').lineWidth(0.5).stroke();
  });

  doc.font('Helvetica-Bold').fontSize(8).fillColor(C.accentDark)
    .text('VILKÅR', leftX + pad, ty + 9, { characterSpacing: 0.6 });
  doc.font('Helvetica-Bold').fontSize(8).fillColor(C.accentDark)
    .text('NESTE STEG', rightX + pad, ty + 9, { characterSpacing: 0.6 });

  const listY = ty + COL_HEADER_H + 6;
  const innerW = colW - pad * 2;

  const vilkarFit = resolveListFit(doc, model.vilkar, innerW, listMaxH, false);
  const stegFit = resolveListFit(doc, model.nesteSteg, innerW, listMaxH, true);

  drawListInBox(doc, leftX + pad, listY, innerW, listMaxH, model.vilkar, false, vilkarFit);
  drawListInBox(doc, rightX + pad, listY, innerW, listMaxH, model.nesteSteg, true, stegFit);

  return ty + boxH;
}

function drawClosing(doc, y, model) {
  doc.roundedRect(PAGE.left, y, PAGE.width, CLOSING_H, 8).fill(C.panel);
  doc.roundedRect(PAGE.left, y, PAGE.width, CLOSING_H, 8).strokeColor(C.line).lineWidth(0.75).stroke();

  doc.font('Helvetica').fontSize(10).fillColor(C.text)
    .text(model.avslutning, PAGE.left + 14, y + 15, { width: PAGE.width * 0.56, lineGap: 1.5 });

  const signX = PAGE.left + PAGE.width * 0.6;
  doc.font('Helvetica').fontSize(7.5).fillColor(C.muted).text('Signatur kunde', signX, y + 12);
  doc.moveTo(signX, y + CLOSING_H - 14).lineTo(PAGE.right - 14, y + CLOSING_H - 14).strokeColor(C.line).lineWidth(0.5).stroke();
}

function innbytteCommentHeight(doc, model) {
  if (!model.innbytte?.kommentar) return 0;
  doc.font('Helvetica').fontSize(9);
  return Math.max(40, doc.heightOfString(model.innbytte.kommentar, { width: PAGE.width - 24, lineGap: 1.5 }) + 28) + 8;
}

function computeLayout(model, introEndY) {
  const summaryRows = model.summaryRows.length;
  const summaryPad = 20;
  const minSummaryRowH = 20;
  const maxSummaryRowH = 26;
  const minPaymentH = 72;
  const maxPaymentH = 84;
  const minTwoColH = COL_HEADER_H + 88;
  const sectionTitles = sectionTitleHeight() * 3;
  const gaps = SECTION_GAP * 2;

  return function pick(commentExtra) {
    const available = CONTENT_BOTTOM - introEndY - commentExtra;

    for (let rowH = maxSummaryRowH; rowH >= minSummaryRowH; rowH -= 1) {
      for (let payH = maxPaymentH; payH >= minPaymentH; payH -= 2) {
        for (let colH = 220; colH >= minTwoColH; colH -= 4) {
          const used = sectionTitles + gaps + summaryPad + summaryRows * rowH + payH + colH;
          if (used <= available) {
            return { summaryRowH: rowH, paymentH: payH, twoColH: colH };
          }
        }
      }
    }

    return { summaryRowH: minSummaryRowH, paymentH: minPaymentH, twoColH: minTwoColH };
  };
}

function buildReservasjonPdfBuffer(bil, kunde, reservasjonRaw) {
  const model = buildReservasjonPdfModel(bil, kunde, reservasjonRaw);

  return new Promise(function (resolve, reject) {
    const doc = new PDFDocument({ size: 'A4', margin: 0 });
    const chunks = [];
    doc.on('data', function (chunk) { chunks.push(chunk); });
    doc.on('end', function () { resolve(Buffer.concat(chunks)); });
    doc.on('error', reject);

    doc.rect(0, 0, PAGE.w, PAGE.h).fill(C.page);

    let y = drawHeader(doc, model);
    y = drawIntro(doc, y, model);

    const pickLayout = computeLayout(model, y);
    const commentExtra = innbytteCommentHeight(doc, model);
    const layout = pickLayout(commentExtra);

    y = drawSectionTitle(doc, y, 'Avtalen i korthet');
    y = drawSummaryTable(doc, y, model.summaryRows, layout.summaryRowH);
    if (model.innbytte?.kommentar) {
      y += 6;
      y = drawInnbytteComment(doc, y, model.innbytte.kommentar);
    }
    y += SECTION_GAP;

    y = drawSectionTitle(doc, y, 'Depositum og betaling');
    y = drawPaymentBox(doc, y, model.payment, layout.paymentH);
    y += SECTION_GAP;

    const twoColSectionY = y;
    y = drawSectionTitle(doc, y, 'Vilkår og neste steg');
    const twoColH = Math.max(COL_HEADER_H + 88, CONTENT_BOTTOM - y - 2);
    drawTwoColumnSections(doc, twoColSectionY, model, twoColH, true);

    drawClosing(doc, PAGE.footerY - FOOTER_H - CLOSING_H - 6, model);
    drawFooter(doc);

    doc.end();
  });
}

module.exports = {
  buildReservasjonPdfBuffer
};
