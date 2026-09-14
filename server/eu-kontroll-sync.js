'use strict';

const { prepare } = require('./db');
const { lookupVehicleFull, nesteEuKontrollIso, toIsoDateFromNorwegian } = require('./vegvesen');

const VEGVESEN_DELAY_MS = Number(process.env.EU_KONTROLL_SYNC_DELAY_MS || 120);

function normalizeReg(reg) {
  return String(reg || '').trim().toUpperCase().replace(/\s/g, '');
}

function sleep(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

function euKontrollIsoFromRow(row) {
  return toIsoDateFromNorwegian(row?.eu_kontroll);
}

/** Oppdater kun eu_kontroll når Vegvesen/Autosys har ny frist. */
function euKontrollShouldUpdate(currentIso, nextIso, onlyMissing) {
  if (!nextIso || !/^\d{4}-\d{2}-\d{2}$/.test(nextIso)) return false;
  if (onlyMissing) {
    return !currentIso || !/^\d{4}-\d{2}-\d{2}$/.test(currentIso);
  }
  return currentIso !== nextIso;
}

/**
 * Synkroniser neste EU-kontroll fra Vegvesen/Autosys for alle biler med reg.nr.
 * Oppdaterer kun kolonnen eu_kontroll — ingen andre bilfelter røres.
 */
async function syncBilerEuKontrollFromVegvesen(options, deps) {
  const onlyMissing = !!options?.onlyMissing;
  const apiKey = deps?.apiKey || process.env.VEGVESEN_API_KEY || '';
  const mapBilerForApi = deps?.mapBilerForApi;
  const getAllBilKundeIdsMap = deps?.getAllBilKundeIdsMap;

  const rows = await prepare(`
    SELECT id, reg, eu_kontroll
    FROM biler
    WHERE reg IS NOT NULL AND TRIM(reg) != ''
    ORDER BY id ASC
  `).all();

  let updated = 0;
  let skipped = 0;
  let failed = 0;
  const errors = [];

  for (const row of rows) {
    const reg = normalizeReg(row.reg);
    if (reg.length < 5) {
      skipped++;
      continue;
    }

    try {
      const result = await lookupVehicleFull(reg, apiKey);
      const iso = nesteEuKontrollIso(result.parsed);
      if (VEGVESEN_DELAY_MS > 0) await sleep(VEGVESEN_DELAY_MS);

      if (!iso) {
        skipped++;
        continue;
      }

      const currentIso = euKontrollIsoFromRow(row);
      if (!euKontrollShouldUpdate(currentIso, iso, onlyMissing)) {
        skipped++;
        continue;
      }

      await prepare(`
        UPDATE biler SET
          eu_kontroll = @eu_kontroll,
          updated_at = datetime('now')
        WHERE id = @id
      `).run({
        id: row.id,
        eu_kontroll: iso
      });
      updated++;
    } catch (err) {
      failed++;
      if (errors.length < 8) {
        errors.push({ reg: row.reg, error: err.message || 'Oppslag feilet.' });
      }
    }
  }

  let items = null;
  if (typeof mapBilerForApi === 'function' && typeof getAllBilKundeIdsMap === 'function') {
    const [freshRows, kundeMap] = await Promise.all([
      prepare('SELECT * FROM biler ORDER BY sort_order ASC, id ASC').all(),
      getAllBilKundeIdsMap()
    ]);
    items = await mapBilerForApi(freshRows, kundeMap);
  }

  return { updated, skipped, failed, errors, items };
}

/** Synkroniser neste EU-kontroll for én bil. */
async function syncSingleBilEuKontrollFromVegvesen(bilId, deps) {
  const id = Number(bilId);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error('Ugyldig bil-ID.');
  }

  const row = await prepare('SELECT id, reg, eu_kontroll FROM biler WHERE id = @id').get({ id });
  if (!row) throw new Error('Bil ikke funnet.');

  const reg = normalizeReg(row.reg);
  if (reg.length < 5) throw new Error('Mangler gyldig registreringsnummer på bilen.');

  const apiKey = deps?.apiKey || process.env.VEGVESEN_API_KEY || '';
  const mapBilForApi = deps?.mapBilForApi;
  const getAllBilKundeIdsMap = deps?.getAllBilKundeIdsMap;

  const result = await lookupVehicleFull(reg, apiKey);
  const iso = nesteEuKontrollIso(result.parsed);
  if (!iso) {
    return { updated: 0, skipped: true, unchanged: false, euKontroll: euKontrollIsoFromRow(row), item: null };
  }

  const currentIso = euKontrollIsoFromRow(row);
  if (currentIso === iso) {
    let item = null;
    if (typeof mapBilForApi === 'function' && typeof getAllBilKundeIdsMap === 'function') {
      const fresh = await prepare('SELECT * FROM biler WHERE id = @id').get({ id });
      const kundeMap = await getAllBilKundeIdsMap();
      item = await mapBilForApi(fresh, kundeMap[id] || []);
    }
    return { updated: 0, skipped: false, unchanged: true, euKontroll: iso, item };
  }

  await prepare(`
    UPDATE biler SET
      eu_kontroll = @eu_kontroll,
      updated_at = datetime('now')
    WHERE id = @id
  `).run({
    id,
    eu_kontroll: iso
  });

  let item = null;
  if (typeof mapBilForApi === 'function' && typeof getAllBilKundeIdsMap === 'function') {
    const fresh = await prepare('SELECT * FROM biler WHERE id = @id').get({ id });
    const kundeMap = await getAllBilKundeIdsMap();
    item = await mapBilForApi(fresh, kundeMap[id] || []);
  }

  return { updated: 1, skipped: false, unchanged: false, euKontroll: iso, item };
}

module.exports = {
  syncBilerEuKontrollFromVegvesen,
  syncSingleBilEuKontrollFromVegvesen,
  euKontrollShouldUpdate
};
