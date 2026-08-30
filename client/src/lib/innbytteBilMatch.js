export function normalizeChassis(value) {
  return String(value || '').trim().toUpperCase().replace(/\s/g, '').replace(/[^A-Z0-9]/g, '');
}

export function parseFinnItemId(input) {
  const s = String(input || '').trim();
  if (!s) return null;
  const urlMatch = s.match(/finn\.no\/mobility\/item\/(\d+)/i);
  if (urlMatch) return urlMatch[1];
  const digits = s.replace(/\D/g, '');
  return digits.length >= 6 ? digits : null;
}

export function bilChassisFromRecord(bil) {
  const direct = normalizeChassis(bil?.chassisnr);
  if (direct) return direct;
  const understell = bil?.svvData?.vehicle?.understell;
  return normalizeChassis(understell);
}

export function innbytteOnsketChassis(inn) {
  return normalizeChassis(inn?.onsketBilChassis);
}

export function matchesInnbytteTilBil(inn, bil) {
  if (!inn || !bil) return false;

  if (inn.onsketBil && bil.finnKode) {
    const onsketFinnId = parseFinnItemId(inn.onsketBil);
    const bilFinnId = parseFinnItemId(bil.finnKode) || String(bil.finnKode).trim();
    if (onsketFinnId && bilFinnId && String(onsketFinnId) === String(bilFinnId)) {
      return true;
    }
  }

  const innChassis = innbytteOnsketChassis(inn);
  const bilChassis = bilChassisFromRecord(bil);
  if (innChassis && bilChassis && innChassis.length >= 5 && innChassis === bilChassis) {
    return true;
  }

  return false;
}
