const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const SVGtoPDF = require('svg-to-pdfkit');
const {
  RESERVASJON_FIRMA,
  buildReservasjonPdfModel,
  normalizeAvtaleForholdPunkter
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

const SECTION_GAP = 11;
const FOOTER_H = 26;
const CLOSING_H = 48;
const COL_HEADER_H = 24;
const SUMMARY_GROUP_TITLE_H = 13;
const CONTENT_BOTTOM = PAGE.footerY - FOOTER_H - CLOSING_H - 10;

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

function drawHairlineSegment(doc, x1, x2, y, weight) {
  doc.moveTo(x1, y).lineTo(x2, y)
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
  const headerTop = 3;
  const headerBottom = 94;
  const logoW = 128;
  const logoH = logoW * (543 / 2000);
  const logoY = headerTop + ((headerBottom - headerTop) - logoH) / 2;

  doc.rect(0, 0, PAGE.w, headerTop).fill(C.accent);

  if (!drawLogo(doc, PAGE.left, logoY, logoW)) {
    doc.font('PJ-EB').fontSize(18).fillColor(C.ink)
      .text('X BILSENTER', PAGE.left, logoY + 4, { lineBreak: false });
  }

  const metaW = 196;
  const metaX = PAGE.right - metaW;
  const metaY = headerTop + 14;

  doc.font('PJ-EB').fontSize(6.5).fillColor(C.accentInk)
    .text(String(model.metaLabel || 'Reservasjonsbekreftelse').toUpperCase(), metaX, metaY, { width: metaW, align: 'right', characterSpacing: 1.1 });

  drawHairlineSegment(doc, metaX, PAGE.right, metaY + 14, 0.35);

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

  drawHairline(doc, headerBottom, 0.75);
  return headerBottom + 10;
}

function drawIntro(doc, y, model) {
  doc.font('PJ-B').fontSize(17).fillColor(C.ink)
    .text(model.dokument.tittel, PAGE.left, y, { characterSpacing: -0.2 });
  doc.font('PJ-SB').fontSize(7).fillColor(C.muted)
    .text(model.dokument.undertittel.toUpperCase(), PAGE.left, doc.y + 4, { characterSpacing: 0.9 });

  const introY = doc.y + 10;
  doc.font('PJ').fontSize(9.5).fillColor(C.ink2);
  const introTextH = doc.heightOfString(model.intro, { width: PAGE.width - 16, lineGap: 2 });
  doc.rect(PAGE.left, introY, 2, Math.max(24, introTextH + 4)).fill(C.accent);
  doc.font('PJ').fontSize(9.5).fillColor(C.ink2)
    .text(model.intro, PAGE.left + 12, introY, { width: PAGE.width - 16, lineGap: 2 });

  let nextY = introY + Math.max(24, introTextH + 4) + 4;
  if (model.bil.finnUrl) {
    doc.font('PJ-M').fontSize(7).fillColor(C.muted)
      .text('FINN-annonse', PAGE.left, nextY, { continued: true });
    doc.font('PJ').fontSize(7).fillColor(C.accentInk)
      .text(`  ${model.bil.finnUrl}`, { link: model.bil.finnUrl, underline: false });
    nextY = doc.y + 1;
  }

  return nextY + SECTION_GAP;
}

function drawSectionTitle(doc, y, title) {
  doc.font('PJ-EB').fontSize(6.5).fillColor(C.accentInk)
    .text(title.toUpperCase(), PAGE.left, y, { characterSpacing: 0.85 });
  drawHairline(doc, y + 11, 0.4);
  return y + sectionTitleHeight();
}

const COMMENT_LIST_FIT = { fontSize: 8.5, itemGap: 4, lineGap: 1.8 };

function commentBlockHeight(doc, text, punkter) {
  const items = normalizeAvtaleForholdPunkter(punkter);
  if (items.length) {
    doc.font('PJ').fontSize(COMMENT_LIST_FIT.fontSize);
    const listH = measureListHeight(
      doc,
      items,
      PAGE.width - 24,
      COMMENT_LIST_FIT.fontSize,
      COMMENT_LIST_FIT.itemGap,
      COMMENT_LIST_FIT.lineGap,
      false
    );
    return 10 + 14 + listH + 10;
  }
  if (!text) return 0;
  doc.font('PJ').fontSize(8.5);
  const textH = doc.heightOfString(text, { width: PAGE.width - 24, lineGap: 1.8 });
  return 10 + 14 + textH + 10;
}

function drawCommentBlock(doc, rowY, pad, label, text, punkter) {
  doc.moveTo(PAGE.left, rowY).lineTo(PAGE.right, rowY).strokeColor(C.line).lineWidth(0.5).stroke();
  doc.font('PJ-EB').fontSize(6.5).fillColor(C.accentInk)
    .text(label, PAGE.left + pad, rowY + 10, { characterSpacing: 0.7 });
  const items = normalizeAvtaleForholdPunkter(punkter);
  if (items.length) {
    drawListInBox(
      doc,
      PAGE.left + pad,
      rowY + 22,
      PAGE.width - pad * 2,
      items,
      false,
      COMMENT_LIST_FIT
    );
  } else {
    doc.font('PJ').fontSize(8.5).fillColor(C.ink2)
      .text(text, PAGE.left + pad, rowY + 22, {
        width: PAGE.width - pad * 2,
        lineGap: 1.8
      });
  }
  return rowY + commentBlockHeight(doc, text, punkter);
}

function measureSummaryGroupsHeight(groups, rowH) {
  return (groups || []).reduce(function (sum, group) {
    return sum + SUMMARY_GROUP_TITLE_H + Math.ceil((group.rows || []).length / 2) * rowH;
  }, 0);
}

function drawSummaryCell(doc, x, y, width, rowH, row, pad) {
  if (!row) return;
  if (row.highlight) {
    doc.rect(x, y, width, rowH).fill(C.white);
  }
  const labelW = 78;
  const valueY = y + Math.max(5, Math.round((rowH - (row.highlight ? 11 : 9)) / 2));
  doc.font('PJ-M').fontSize(7.5).fillColor(C.muted)
    .text(row.label, x + pad, valueY, { width: labelW });
  doc.font(row.highlight ? 'PJ-B' : 'PJ-SB')
    .fontSize(row.highlight ? 9.5 : 8.5)
    .fillColor(C.ink)
    .text(row.value, x + pad + labelW, valueY - (row.highlight ? 1 : 0), {
      width: width - labelW - pad * 2,
      align: 'right'
    });
}

function drawSummaryTable(doc, y, rows, rowH, avtaleKommentar, avtaleForholdPunkter, innbytteKommentar) {
  const labelW = 158;
  const pad = 12;
  const commentBlockH = commentBlockHeight(doc, avtaleKommentar, avtaleForholdPunkter)
    + commentBlockHeight(doc, innbytteKommentar);
  const rowsH = rows.length * rowH;
  const boxH = rowsH + commentBlockH;

  doc.rect(PAGE.left, y, PAGE.width, boxH).strokeColor(C.line).lineWidth(0.75).stroke();

  let rowY = y;
  rows.forEach(function (row, index) {
    if (index > 0) {
      doc.moveTo(PAGE.left, rowY).lineTo(PAGE.right, rowY).strokeColor(C.lineSoft).lineWidth(0.35).stroke();
    }
    if (row.highlight) {
      doc.rect(PAGE.left, rowY, PAGE.width, rowH).fill(C.white);
    } else if (index % 2 === 1) {
      doc.rect(PAGE.left, rowY, PAGE.width, rowH).fill('#FCFDFC');
    }

    const valueY = rowY + Math.max(6, Math.round((rowH - (row.highlight ? 12 : 10)) / 2));
    doc.font('PJ-M').fontSize(8).fillColor(C.muted)
      .text(row.label, PAGE.left + pad, valueY, { width: labelW });
    doc.font(row.highlight ? 'PJ-B' : 'PJ-SB')
      .fontSize(row.highlight ? 10.5 : 9)
      .fillColor(C.ink)
      .text(row.value, PAGE.left + pad + labelW, valueY - (row.highlight ? 1 : 0), {
        width: PAGE.width - labelW - pad * 2,
        align: 'right'
      });
    rowY += rowH;
  });

  if (avtaleKommentar || normalizeAvtaleForholdPunkter(avtaleForholdPunkter).length) {
    rowY = drawCommentBlock(doc, rowY, pad, 'AVTALTE FORHOLD', avtaleKommentar, avtaleForholdPunkter);
  }
  if (innbytteKommentar) {
    drawCommentBlock(doc, rowY, pad, 'KOMMENTAR TIL INNBYTTEBIL', innbytteKommentar);
  }

  return y + boxH;
}

function drawSummaryGroups(doc, y, groups, rowH, avtaleKommentar, avtaleForholdPunkter, innbytteKommentar) {
  const pad = 10;
  const colGap = 0;
  const colW = PAGE.width / 2;
  const commentBlockH = commentBlockHeight(doc, avtaleKommentar, avtaleForholdPunkter)
    + commentBlockHeight(doc, innbytteKommentar);
  const gridH = measureSummaryGroupsHeight(groups, rowH);
  const boxH = gridH + commentBlockH;

  doc.rect(PAGE.left, y, PAGE.width, boxH).strokeColor(C.line).lineWidth(0.75).stroke();

  let rowY = y;
  (groups || []).forEach(function (group, groupIndex) {
    if (groupIndex > 0) {
      doc.moveTo(PAGE.left, rowY).lineTo(PAGE.right, rowY).strokeColor(C.lineSoft).lineWidth(0.35).stroke();
    }
    doc.rect(PAGE.left, rowY, PAGE.width, SUMMARY_GROUP_TITLE_H).fill(C.surface);
    doc.font('PJ-SB').fontSize(6.5).fillColor(C.accentInk)
      .text(String(group.title || '').toUpperCase(), PAGE.left + pad, rowY + 3.5, { characterSpacing: 0.65 });
    rowY += SUMMARY_GROUP_TITLE_H;

    for (let i = 0; i < group.rows.length; i += 2) {
      if (i > 0 || groupIndex > 0) {
        doc.moveTo(PAGE.left, rowY).lineTo(PAGE.right, rowY).strokeColor(C.lineSoft).lineWidth(0.35).stroke();
      }
      drawSummaryCell(doc, PAGE.left, rowY, colW, rowH, group.rows[i], pad);
      doc.moveTo(PAGE.left + colW, rowY).lineTo(PAGE.left + colW, rowY + rowH)
        .strokeColor(C.lineSoft).lineWidth(0.35).stroke();
      drawSummaryCell(doc, PAGE.left + colW + colGap, rowY, colW - colGap, rowH, group.rows[i + 1], pad);
      rowY += rowH;
    }
  });

  if (avtaleKommentar || normalizeAvtaleForholdPunkter(avtaleForholdPunkter).length) {
    rowY = drawCommentBlock(doc, rowY, pad, 'AVTALTE FORHOLD', avtaleKommentar, avtaleForholdPunkter);
  }
  if (innbytteKommentar) {
    drawCommentBlock(doc, rowY, pad, 'KOMMENTAR TIL INNBYTTEBIL', innbytteKommentar);
  }

  return y + boxH;
}

function drawPaymentBox(doc, y, payment, boxH) {
  const pad = 12;

  doc.rect(PAGE.left, y, PAGE.width, 2).fill(C.accent);
  doc.rect(PAGE.left, y + 2, PAGE.width, boxH - 2).fill(C.white);
  doc.rect(PAGE.left, y, PAGE.width, boxH).strokeColor(C.line).lineWidth(0.75).stroke();

  doc.font('PJ-SB').fontSize(8.5).fillColor(C.ink)
    .text(payment.title, PAGE.left + pad, y + 9, { width: PAGE.width - pad * 2 });
  let lineY = y + 22;
  payment.lines.forEach(function (line) {
    doc.font('PJ').fontSize(8).fillColor(C.ink2)
      .text(line, PAGE.left + pad, lineY, { width: PAGE.width - pad * 2, lineGap: 1.2 });
    lineY = doc.y + 2;
  });

  return y + boxH;
}

const LIST_FONT_SIZE = 8.5;
const LIST_LINE_GAP = 1.2;

function listTextOptions(textWidth, lineGap) {
  return {
    width: textWidth,
    align: 'left',
    characterSpacing: 0,
    wordSpacing: 0,
    lineGap: lineGap
  };
}

function listPrefixWidth(doc, prefix, fontSize, numbered) {
  doc.font(numbered ? 'PJ-SB' : 'PJ-M').fontSize(fontSize);
  return Math.ceil(doc.widthOfString(prefix)) + 5;
}

function measureListHeight(doc, items, width, fontSize, itemGap, lineGap, numbered) {
  let total = 0;

  items.forEach(function (item, index) {
    const prefix = numbered ? `${index + 1}.` : '•';
    const prefixW = listPrefixWidth(doc, prefix, fontSize, numbered);
    doc.font('PJ').fontSize(fontSize);
    const h = doc.heightOfString(item, listTextOptions(width - prefixW, lineGap));
    total += Math.max(h, fontSize + 1);
    if (index < items.length - 1) total += itemGap;
  });

  return total;
}

function resolveListFit(doc, items, width, maxHeight, numbered) {
  for (let fontSize = LIST_FONT_SIZE; fontSize >= 6.5; fontSize -= 0.5) {
    const lineGap = fontSize <= 7.5 ? 1 : LIST_LINE_GAP;
    for (let itemGap = 6; itemGap >= 2; itemGap -= 1) {
      const h = measureListHeight(doc, items, width, fontSize, itemGap, lineGap, numbered);
      if (h <= maxHeight) {
        return { fontSize, itemGap, lineGap };
      }
    }
  }
  return { fontSize: 6.5, itemGap: 2, lineGap: 0.8 };
}

function drawListInBox(doc, x, y, width, items, numbered, fit) {
  let cy = y;

  items.forEach(function (item, index) {
    const prefix = numbered ? `${index + 1}.` : '•';
    const prefixW = listPrefixWidth(doc, prefix, fit.fontSize, numbered);
    const textX = x + prefixW;
    const textOpts = listTextOptions(width - prefixW, fit.lineGap);

    doc.font(numbered ? 'PJ-SB' : 'PJ-M').fontSize(fit.fontSize).fillColor(numbered ? C.accentInk : C.faint)
      .text(prefix, x, cy, { lineBreak: false, characterSpacing: 0 });
    doc.font('PJ').fontSize(fit.fontSize).fillColor(C.ink2)
      .text(item, textX, cy, textOpts);
    cy = doc.y + (index < items.length - 1 ? fit.itemGap : 0);
  });

  return Math.max(cy - y, fit.fontSize + 1);
}

function drawTwoColumnSections(doc, y, model, maxListH, titleAlreadyDrawn) {
  const gap = 14;
  const colW = (PAGE.width - gap) / 2;
  const leftX = PAGE.left;
  const rightX = PAGE.left + colW + gap;
  const pad = 11;
  const listPad = 8;

  const ty = titleAlreadyDrawn ? y + sectionTitleHeight() : drawSectionTitle(doc, y, 'Vilkår og neste steg');
  const listY = ty + COL_HEADER_H + listPad;
  const innerW = colW - pad * 2;

  doc.font('PJ').fontSize(LIST_FONT_SIZE);
  const vilkarFit = resolveListFit(doc, model.vilkar, innerW, maxListH, false);
  const stegFit = resolveListFit(doc, model.nesteSteg, innerW, maxListH, true);
  const vilkarContentH = measureListHeight(
    doc, model.vilkar, innerW, vilkarFit.fontSize, vilkarFit.itemGap, vilkarFit.lineGap, false
  );
  const stegContentH = measureListHeight(
    doc, model.nesteSteg, innerW, stegFit.fontSize, stegFit.itemGap, stegFit.lineGap, true
  );
  const contentH = Math.max(vilkarContentH, stegContentH);
  const boxH = COL_HEADER_H + listPad + contentH + listPad;

  [leftX, rightX].forEach(function (x) {
    doc.rect(x, ty, colW, COL_HEADER_H).fill(C.accentDark);
    doc.rect(x, ty + COL_HEADER_H, colW, boxH - COL_HEADER_H).fill(C.white);
    doc.rect(x, ty, colW, boxH).strokeColor(C.line).lineWidth(0.75).stroke();
  });

  doc.font('PJ-SB').fontSize(7).fillColor(C.white)
    .text('VILKÅR', leftX + pad, ty + 8, { characterSpacing: 0.7 });
  doc.font('PJ-SB').fontSize(7).fillColor(C.white)
    .text('NESTE STEG', rightX + pad, ty + 8, { characterSpacing: 0.7 });

  drawListInBox(doc, leftX + pad, listY, innerW, model.vilkar, false, vilkarFit);
  drawListInBox(doc, rightX + pad, listY, innerW, model.nesteSteg, true, stegFit);

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

function computeLayout(model, introEndY, doc) {
  const summaryGroups = model.summaryGroups || [];
  const kundeRows = (model.kundeRows || []).length;
  const commentH = commentBlockHeight(doc, model.avtaleKommentar || '', model.avtaleForholdPunkter)
    + commentBlockHeight(doc, model.innbytte?.kommentar || '');
  const minSummaryRowH = 17;
  const maxSummaryRowH = 22;
  const minPaymentH = 52;
  const maxPaymentH = 64;
  const minTwoColH = COL_HEADER_H + 96;
  const hasKundeSection = kundeRows > 0;
  const sectionCount = (model.skipPayment ? 2 : 3) + (hasKundeSection ? 1 : 0);
  const sectionTitles = sectionTitleHeight() * sectionCount;
  const gaps = SECTION_GAP * (sectionCount - 1);
  const skipPayment = !!model.skipPayment;

  return function pick() {
    const available = CONTENT_BOTTOM - introEndY;

    for (let rowH = maxSummaryRowH; rowH >= minSummaryRowH; rowH -= 1) {
      for (let payH = skipPayment ? 0 : maxPaymentH; payH >= (skipPayment ? 0 : minPaymentH); payH -= skipPayment ? 999 : 2) {
        const summaryH = measureSummaryGroupsHeight(summaryGroups, rowH) + commentH;
        const colH = available - sectionTitles - gaps - (hasKundeSection ? kundeRows * rowH : 0) - summaryH - (skipPayment ? 0 : payH);
        if (colH >= minTwoColH) {
          return { summaryRowH: rowH, paymentH: skipPayment ? 0 : payH, twoColH: colH };
        }
      }
    }

    return { summaryRowH: minSummaryRowH, paymentH: skipPayment ? 0 : minPaymentH, twoColH: minTwoColH };
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

    const pickLayout = computeLayout(model, y, doc);
    const layout = pickLayout();

    if (model.kundeRows?.length) {
      y = drawSectionTitle(doc, y, 'Kunde');
      y = drawSummaryTable(doc, y, model.kundeRows, layout.summaryRowH, '', [], '');
      y += SECTION_GAP;
    }

    y = drawSectionTitle(doc, y, 'Avtalen i korthet');
    y = drawSummaryGroups(
      doc,
      y,
      model.summaryGroups || [],
      layout.summaryRowH,
      model.avtaleKommentar || '',
      model.avtaleForholdPunkter || [],
      model.innbytte?.kommentar || ''
    );
    y += SECTION_GAP;

    if (!model.skipPayment) {
      y = drawSectionTitle(doc, y, 'Depositum og betaling');
      y = drawPaymentBox(doc, y, model.payment, layout.paymentH);
      y += SECTION_GAP;
    }

    const twoColSectionY = y;
    y = drawSectionTitle(doc, y, 'Vilkår og neste steg');
    const listStartY = twoColSectionY + sectionTitleHeight() + COL_HEADER_H + 8;
    const maxListH = Math.max(72, CONTENT_BOTTOM - listStartY - 8);
    drawTwoColumnSections(doc, twoColSectionY, model, maxListH, true);

    drawClosing(doc, PAGE.footerY - FOOTER_H - CLOSING_H - 8, model);
    drawFooter(doc);

    doc.end();
  });
}

module.exports = {
  buildReservasjonPdfBuffer
};
