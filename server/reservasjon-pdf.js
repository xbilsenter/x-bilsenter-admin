const PDFDocument = require('pdfkit');
const {
  RESERVASJON_FIRMA,
  buildReservasjonDocumentData,
  reservasjonSeksjoner
} = require('../shared/reservasjon');

const ACCENT = '#19BA60';
const TEXT = '#111827';
const MUTED = '#6B7280';

function drawSection(doc, title, body, yStart) {
  let y = yStart;
  if (title) {
    doc.font('Helvetica-Bold').fontSize(11).fillColor(TEXT).text(title, 50, y, { width: 495 });
    y = doc.y + 4;
  }
  doc.font('Helvetica').fontSize(10.5).fillColor(TEXT).text(body, 50, y, {
    width: 495,
    lineGap: 3
  });
  return doc.y + 14;
}

function drawFooter(doc) {
  const bottom = doc.page.height - 50;
  doc.moveTo(50, bottom - 52).lineTo(545, bottom - 52).strokeColor('#E5E7EB').lineWidth(0.5).stroke();

  doc.font('Helvetica').fontSize(7.5).fillColor(MUTED).text(
    'Denne meldingen er kun ment for mottakeren. Meldingen kan inneholde konfidensiell informasjon. Hvis du har mottatt meldingen ved en feil, ber vi deg om å slette meldingen og informere avsender.',
    50,
    bottom - 42,
    { width: 495, align: 'justify', lineGap: 1 }
  );
  doc.text(
    'This message is intended only for the recipient. The message may contain confidential information. If you have received the message in error, please delete the message and notify the sender.',
    50,
    doc.y + 4,
    { width: 495, align: 'justify', lineGap: 1 }
  );
}

function drawSignature(doc, yStart) {
  let y = yStart;
  doc.font('Helvetica').fontSize(10.5).fillColor(TEXT).text('Takk for en hyggelig handel!', 50, y);
  y = doc.y + 18;
  doc.text('Med vennlig hilsen,', 50, y);
  y = doc.y + 14;
  doc.font('Helvetica-Bold').fontSize(11).text(RESERVASJON_FIRMA.navn, 50, y);
  y = doc.y + 4;
  doc.font('Helvetica-Oblique').fontSize(10).fillColor(MUTED).text(RESERVASJON_FIRMA.tagline, 50, y);
  y = doc.y + 16;

  doc.save();
  doc.moveTo(50, y).lineTo(130, y).strokeColor(ACCENT).lineWidth(2).stroke();
  doc.restore();
  y += 10;

  doc.font('Helvetica-Bold').fontSize(14).fillColor(TEXT).text('X BILSENTER', 50, y);
  y = doc.y + 10;
  doc.font('Helvetica').fontSize(9.5).fillColor(MUTED).text(
    `${RESERVASJON_FIRMA.adresse} | Mobil ${RESERVASJON_FIRMA.mobil} | ${RESERVASJON_FIRMA.epost} | ${RESERVASJON_FIRMA.web}`,
    50,
    y,
    { width: 495 }
  );
  return doc.y;
}

function buildReservasjonPdfBuffer(bil, kunde, reservasjonRaw) {
  const data = buildReservasjonDocumentData(bil, kunde, reservasjonRaw);
  const sections = reservasjonSeksjoner(data);

  return new Promise(function (resolve, reject) {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];
    doc.on('data', function (chunk) { chunks.push(chunk); });
    doc.on('end', function () { resolve(Buffer.concat(chunks)); });
    doc.on('error', reject);

    doc.font('Helvetica-Bold').fontSize(16).fillColor(TEXT).text(RESERVASJON_FIRMA.navn, 50, 42);
    doc.font('Helvetica').fontSize(10).fillColor(MUTED).text('Reservasjonsbekreftelse', 50, 64);
    doc.moveTo(50, 82).lineTo(545, 82).strokeColor('#E5E7EB').lineWidth(1).stroke();

    let y = 98;
    sections.forEach(function (section) {
      if (y > 640) {
        doc.addPage();
        y = 50;
      }
      y = drawSection(doc, section.title, section.body, y);
    });

    if (y > 560) {
      doc.addPage();
      y = 50;
    }
    drawSignature(doc, y + 6);
    drawFooter(doc);
    doc.end();
  });
}

module.exports = {
  buildReservasjonPdfBuffer
};
