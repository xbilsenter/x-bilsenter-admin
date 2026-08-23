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

const FONT_DIR = path.join(__dirname, 'assets', 'fonts');
const FONT = {
  reg: path.join(FONT_DIR, 'PlusJakartaSans-Regular.woff'),
  med: path.join(FONT_DIR, 'PlusJakartaSans-Medium.woff'),
  sb: path.join(FONT_DIR, 'PlusJakartaSans-SemiBold.woff'),
  bold: path.join(FONT_DIR, 'PlusJakartaSans-Bold.woff'),
  eb: path.join(FONT_DIR, 'PlusJakartaSans-ExtraBold.woff')
};

const PAGE = {
  w: 595.28,
  h: 841.89,
  left: 52,
  right: 543,
  width: 491,
  footerY: 808
};

const C = {
  ink: '#0D1F0E',
  ink2: '#2A4A2C',
  muted: '#587A5A',
  faint: '#8FAF90',
  accent: '#19BA60',
  accentDark: '#0D8A44',
  accentInk: '#128C47',
  line: '#DDE8DE',
  lineSoft: '#E8F0E9',
  surface: '#F7FAF7',
  white: '#FFFFFF'
};

const SECTION_GAP = 16;
const FOOTER_H = 26;
const CLOSING_H = 54;
const COL_HEADER_H = 24;
const CONTENT_BOTTOM = PAGE.footerY - FOOTER_H - CLOSING_H - 12;

function registerFonts(doc) {
  doc.registerFont('PJ', FONT.reg);
  doc.registerFont('PJ-M', FONT.med);
  doc.registerFont('PJ-SB', FONT.sb);
  doc.registerFont('PJ-B', FONT.bold);
  doc.registerFont('PJ-EB', FONT.eb);
}

function sectionTitleHeight() {
  return 20;
}

function drawLogo(doc, x, y, width) {
  if (!LOGO_SVG) return false;
  SVGtoPDF(doc, LOGO_SVG, x, y, { width, preserveAspectRatio: 'xMinYMin meet' });
  return true;
}

function drawHairline(doc, y, weight) {
  doc.moveTo(PAGE.left, y).lineTo(PAGE.right, y)
    .strokeColor(C.line).lineWidth(weight || 0.5).stroke();
}

function drawFooter(doc) {
  drawHairline(doc, PAGE.footerY, 0.75);
  doc.font('PJ').fontSize(7).fillColor(C.faint)
    .text(
      `${RESERVASJON_FIRMA.navn}  ·  ${RESERVASJON_FIRMA.adresse}  ·  ${RESERVASJON_FIRMA.mobil}  ·  ${RESERVASJON_FIRMA.epost}  ·  ${RESERVASJON_FIRMA.web}`,
      PAGE.left,
      PAGE.footerY + 11,
      { width: PAGE.width, align: 'center', lineGap: 0.5 }
    );
}

function drawHeader(doc, model) {
  doc.rect(0, 0, PAGE.w, 3).fill(C.accent);

  if (!drawLogo(doc, PAGE.left, 30, 128)) {
    doc.font('PJ-EB').fontSize(18).fillColor(C.ink)
      .text('X BILSENTER', PAGE.left, 34, { lineBreak: false });
  }

  const metaW = 196;
  const metaX = PAGE.right - metaW;
  const metaY = 28;

  doc.font('PJ-EB').fontSize(6.5).fillColor(C.accentInk)
    .text('RESERVASJONSBEKREFTELSE', metaX, metaY, { width: metaW, align: 'right', characterSpacing: 1.1 });

  drawHairline(doc, metaY + 14, 0.35);

  doc.font('PJ-M').fontSize(7.5).fillColor(C.muted)
    .text('Dato', metaX, metaY + 20, { width: 44, align: 'left' });
  doc.font('PJ-SB').fontSize(7.5).fillColor(C.ink2)
    .text(model.dokument.dato, metaX + 44, metaY + 20, { width: metaW - 44, align: 'right' });

  doc.font('PJ-M').fontSize(7.5).fillColor(C.muted)
    .text('Referanse', metaX, metaY + 32, { width: 54, align: 'left' });
  doc.font('PJ-SB').fontSize(7.5).fillColor(C.ink2)
    .text(model.dokument.referanse || '—', metaX + 54, metaY + 32, { width: metaW - 54, align: 'right' });

  doc.font('PJ-M').fontSize(7.5).fillColor(C.muted)
    .text('Kunde', metaX, metaY + 44, { width: 36, align: 'left' });
  doc.font('PJ-B').fontSize(9.5).fillColor(C.ink)
    .text(model.kunde.navn, metaX + 36, metaY + 42, { width: metaW - 36, align: 'right' });

  drawHairline(doc, 92, 0.75);
  return 102;
}

function drawIntro(doc, y, model) {
  doc.font('PJ-B').fontSize(20).fillColor(C.ink)
    .text(model.dokument.tittel, PAGE.left, y, { characterSpacing: -0.2 });
  doc.font('PJ-SB').fontSize(7).fillColor(C.muted)
    .text(model.dokument.undertittel.toUpperCase(), PAGE.left, doc.y + 6, { characterSpacing: 0.9 });

  const introY = doc.y + 14;
  doc.rect(PAGE.left, introY, 2, 0).fill(C.accent);
  doc.font('PJ').fontSize(10).fillColor(C.ink2);
  const introTextH = doc.heightOfString(model.intro, { width: PAGE.width - 16, lineGap: 2.5 });
  doc.rect(PAGE.left, introY, 2, Math.max(28, introTextH + 4)).fill(C.accent);
  doc.font('PJ').fontSize(10).fillColor(C.ink2)
    .text(model.intro, PAGE.left + 12, introY, { width: PAGE.width - 16, lineGap: 2.5 });

  let nextY = introY + Math.max(28, introTextH + 4) + 6;
  if (model.bil.finnUrl) {
    doc.font('PJ-M').fontSize(7.5).fillColor(C.muted)
      .text('FINN-annonse', PAGE.left, nextY, { continued: true });
    doc.font('PJ').fontSize(7.5).fillColor(C.accentInk)
      .text(`  ${model.bil.finnUrl}`, { link: model.bil.finnUrl, underline: false });
    nextY = doc.y + 2;
  }

  return nextY + SECTION_GAP;
}

function drawSectionTitle(doc, y, title) {
  doc.font('PJ-EB').fontSize(6.5).fillColor(C.accentInk)
    .text(title.toUpperCase(), PAGE.left, y, { characterSpacing: 0.85 });
  drawHairline(doc, y + 11, 0.4);
  return y + sectionTitleHeight();
}

function drawSummaryTable(doc, y, rows, rowH) {
  const labelW = 158;
  const boxH = rows.length * rowH;

  doc.rect(PAGE.left, y, PAGE.width, boxH).strokeColor(C.line).lineWidth(0.75).stroke();

  let rowY = y;
  rows.forEach(function (row, index) {
    if (index > 0) {
      doc.moveTo(PAGE.left, rowY).lineTo(PAGE.right, rowY).strokeColor(C.lineSoft).lineWidth(0.35).stroke();
    }
    if (row.highlight) {
      doc.rect(PAGE.left, rowY, PAGE.width, rowH).fill(C.surface);
    } else if (index % 2 === 1) {
      doc.rect(PAGE.left, rowY, PAGE.width, rowH).fill('#FCFDFC');
    }

    const valueY = rowY + Math.max(6, Math.round((rowH - (row.highlight ? 12 : 10)) / 2));
    doc.font('PJ-M').fontSize(8).fillColor(C.muted)
      .text(row.label, PAGE.left + 12, valueY, { width: labelW });
    doc.font(row.highlight ? 'PJ-B' : 'PJ-SB')
      .fontSize(row.highlight ? 10.5 : 9)
      .fillColor(C.ink)
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
  doc.font('PJ').fontSize(8.5);
  const textH = doc.heightOfString(kommentar, { width: PAGE.width - pad * 2, lineGap: 1.8 });
  const boxH = Math.max(38, textH + 30);

  doc.rect(PAGE.left, y, PAGE.width, boxH).strokeColor(C.line).lineWidth(0.75).stroke();
  doc.font('PJ-EB').fontSize(6.5).fillColor(C.accentInk)
    .text('KOMMENTAR TIL INNBYTTEBIL', PAGE.left + pad, y + 10, { characterSpacing: 0.7 });
  doc.font('PJ').fontSize(8.5).fillColor(C.ink2)
    .text(kommentar, PAGE.left + pad, y + 22, { width: PAGE.width - pad * 2, lineGap: 1.8 });
  return y + boxH;
}

function drawPaymentBox(doc, y, payment, boxH) {
  const pad = 14;

  doc.rect(PAGE.left, y, PAGE.width, 2).fill(C.accent);
  doc.rect(PAGE.left, y + 2, PAGE.width, boxH - 2).fill(C.white);
  doc.rect(PAGE.left, y, PAGE.width, boxH).strokeColor(C.line).lineWidth(0.75).stroke();

  doc.font('PJ-SB').fontSize(9.5).fillColor(C.ink)
    .text(payment.title, PAGE.left + pad, y + 12, { width: PAGE.width - pad * 2 });
  let lineY = y + 28;
  payment.lines.forEach(function (line) {
    doc.font('PJ').fontSize(9).fillColor(C.ink2)
      .text(line, PAGE.left + pad, lineY, { width: PAGE.width - pad * 2, lineGap: 1.8 });
    lineY = doc.y + 4;
  });

  return y + boxH;
}

function measureListHeight(doc, items, width, fontSize, itemGap, lineGap) {
  const textW = width - 16;
  let total = 0;

  items.forEach(function (item, index) {
    doc.font('PJ').fontSize(fontSize);
    const h = doc.heightOfString(item, { width: textW, lineGap: lineGap });
    total += Math.max(h, fontSize + 1);
    if (index < items.length - 1) total += itemGap;
  });

  return total;
}

function resolveListFit(doc, items, width, maxHeight) {
  for (let fontSize = 8.5; fontSize >= 6.5; fontSize -= 0.25) {
    for (let itemGap = 6; itemGap >= 2; itemGap -= 1) {
      const lineGap = fontSize <= 7 ? 0.8 : 1.2;
      const h = measureListHeight(doc, items, width, fontSize, itemGap, lineGap);
      if (h <= maxHeight) {
        return { fontSize, itemGap, lineGap };
      }
    }
  }
  return { fontSize: 6.5, itemGap: 2, lineGap: 0.6 };
}

function drawListInBox(doc, x, y, width, maxHeight, items, numbered, fit) {
  doc.save();
  doc.rect(x, y, width, maxHeight).clip();

  let cy = y;
  const textW = width - 16;

  items.forEach(function (item, index) {
    const prefix = numbered ? `${index + 1}.` : '•';
    doc.font(numbered ? 'PJ-SB' : 'PJ-M').fontSize(fit.fontSize).fillColor(numbered ? C.accentInk : C.faint)
      .text(prefix, x, cy, { width: 14, lineBreak: false });
    doc.font('PJ').fontSize(fit.fontSize).fillColor(C.ink2)
      .text(item, x + 14, cy, { width: textW, lineGap: fit.lineGap });
    cy = doc.y + (index < items.length - 1 ? fit.itemGap : 0);
  });

  doc.restore();
  return cy;
}

function drawTwoColumnSections(doc, y, model, boxH, titleAlreadyDrawn) {
  const gap = 14;
  const colW = (PAGE.width - gap) / 2;
  const leftX = PAGE.left;
  const rightX = PAGE.left + colW + gap;
  const pad = 11;

  const ty = titleAlreadyDrawn ? y + sectionTitleHeight() : drawSectionTitle(doc, y, 'Vilkår og neste steg');
  const listMaxH = boxH - COL_HEADER_H - pad - 4;

  [leftX, rightX].forEach(function (x) {
    doc.rect(x, ty, colW, COL_HEADER_H).fill(C.accentDark);
    doc.rect(x, ty + COL_HEADER_H, colW, boxH - COL_HEADER_H).fill(C.white);
    doc.rect(x, ty, colW, boxH).strokeColor(C.line).lineWidth(0.75).stroke();
  });

  doc.font('PJ-SB').fontSize(7).fillColor(C.white)
    .text('VILKÅR', leftX + pad, ty + 8, { characterSpacing: 0.7 });
  doc.font('PJ-SB').fontSize(7).fillColor(C.white)
    .text('NESTE STEG', rightX + pad, ty + 8, { characterSpacing: 0.7 });

  const listY = ty + COL_HEADER_H + 8;
  const innerW = colW - pad * 2;

  const vilkarFit = resolveListFit(doc, model.vilkar, innerW, listMaxH);
  const stegFit = resolveListFit(doc, model.nesteSteg, innerW, listMaxH);

  drawListInBox(doc, leftX + pad, listY, innerW, listMaxH, model.vilkar, false, vilkarFit);
  drawListInBox(doc, rightX + pad, listY, innerW, listMaxH, model.nesteSteg, true, stegFit);

  return ty + boxH;
}

function drawClosing(doc, y, model) {
  doc.rect(PAGE.left, y, PAGE.width, CLOSING_H).strokeColor(C.line).lineWidth(0.75).stroke();

  doc.font('PJ-SB').fontSize(9.5).fillColor(C.ink)
    .text(model.avslutning, PAGE.left + 14, y + 18, { width: PAGE.width * 0.54, lineGap: 1.5 });

  const signX = PAGE.left + PAGE.width * 0.62;
  doc.font('PJ-M').fontSize(7).fillColor(C.muted).text('Signatur kunde', signX, y + 14);
  doc.moveTo(signX, y + CLOSING_H - 16).lineTo(PAGE.right - 14, y + CLOSING_H - 16)
    .strokeColor(C.line).lineWidth(0.5).stroke();
}

function innbytteCommentHeight(doc, model) {
  if (!model.innbytte?.kommentar) return 0;
  doc.font('PJ').fontSize(8.5);
  return Math.max(38, doc.heightOfString(model.innbytte.kommentar, { width: PAGE.width - 24, lineGap: 1.8 }) + 30) + 8;
}

function computeLayout(model, introEndY) {
  const summaryRows = model.summaryRows.length;
  const minSummaryRowH = 19;
  const maxSummaryRowH = 25;
  const minPaymentH = 68;
  const maxPaymentH = 80;
  const minTwoColH = COL_HEADER_H + 84;
  const sectionTitles = sectionTitleHeight() * 3;
  const gaps = SECTION_GAP * 2;

  return function pick(commentExtra) {
    const available = CONTENT_BOTTOM - introEndY - commentExtra;

    for (let rowH = maxSummaryRowH; rowH >= minSummaryRowH; rowH -= 1) {
      for (let payH = maxPaymentH; payH >= minPaymentH; payH -= 2) {
        for (let colH = 228; colH >= minTwoColH; colH -= 4) {
          const used = sectionTitles + gaps + summaryRows * rowH + payH + colH;
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
    registerFonts(doc);

    const chunks = [];
    doc.on('data', function (chunk) { chunks.push(chunk); });
    doc.on('end', function () { resolve(Buffer.concat(chunks)); });
    doc.on('error', reject);

    doc.rect(0, 0, PAGE.w, PAGE.h).fill(C.white);

    let y = drawHeader(doc, model);
    y = drawIntro(doc, y, model);

    const pickLayout = computeLayout(model, y);
    const commentExtra = innbytteCommentHeight(doc, model);
    const layout = pickLayout(commentExtra);

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
    const twoColH = Math.max(COL_HEADER_H + 84, CONTENT_BOTTOM - y - 2);
    drawTwoColumnSections(doc, twoColSectionY, model, twoColH, true);

    drawClosing(doc, PAGE.footerY - FOOTER_H - CLOSING_H - 8, model);
    drawFooter(doc);

    doc.end();
  });
}

module.exports = {
  buildReservasjonPdfBuffer
};
