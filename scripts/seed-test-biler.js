#!/usr/bin/env node
'use strict';

/**
 * Legger inn testbiler i lageret for ytelses-/UI-testing.
 *
 *   node scripts/seed-test-biler.js
 *   node scripts/seed-test-biler.js --count 90
 *   node scripts/seed-test-biler.js --remove
 */

const path = require('path');

const ROOT = path.join(__dirname, '..');
const SERVER_DIR = path.join(ROOT, 'server');

require(path.join(SERVER_DIR, 'node_modules', 'dotenv')).config({ path: path.join(ROOT, '.env') });

const {
  dbReady,
  prepare,
  syncPostgresSequences,
  nextBilSortOrder,
  ensureSjekklisterForStatus,
  getAktivSjekklisteFromRow,
  getInnstillinger
} = require(path.join(SERVER_DIR, 'db-pg'));

const TEST_PREFIX = 'XB';
const TEST_REG_START = 90001;
const TEST_NOTE = 'Testbil – generert for ytelsestest';

const CATALOG = [
  { merke: 'Volkswagen', modeller: ['Golf', 'Passat', 'Tiguan', 'Polo', 'ID.4'] },
  { merke: 'Toyota', modeller: ['Corolla', 'RAV4', 'Yaris', 'Camry', 'C-HR'] },
  { merke: 'Volvo', modeller: ['XC60', 'XC40', 'V60', 'V90', 'EX30'] },
  { merke: 'BMW', modeller: ['320i', '520d', 'X1', 'X3', 'iX1'] },
  { merke: 'Audi', modeller: ['A3', 'A4', 'Q3', 'Q5', 'e-tron'] },
  { merke: 'Mercedes', modeller: ['A180', 'C220', 'GLA', 'GLC', 'EQA'] },
  { merke: 'Skoda', modeller: ['Octavia', 'Superb', 'Kodiaq', 'Fabia', 'Enyaq'] },
  { merke: 'Hyundai', modeller: ['i30', 'Tucson', 'Kona', 'Ioniq 5', 'Santa Fe'] },
  { merke: 'Kia', modeller: ['Ceed', 'Sportage', 'Niro', 'EV6', 'Sorento'] },
  { merke: 'Ford', modeller: ['Focus', 'Kuga', 'Puma', 'Mustang Mach-E', 'Explorer'] },
  { merke: 'Tesla', modeller: ['Model 3', 'Model Y', 'Model S', 'Model X'] },
  { merke: 'Peugeot', modeller: ['208', '308', '3008', '5008', 'e-208'] },
  { merke: 'Renault', modeller: ['Clio', 'Megane', 'Captur', 'Austral', 'Zoe'] },
  { merke: 'Nissan', modeller: ['Qashqai', 'Leaf', 'Juke', 'X-Trail', 'Ariya'] },
  { merke: 'Mazda', modeller: ['CX-5', 'CX-30', '3', '6', 'MX-30'] }
];

const FARGER = ['Svart', 'Hvit', 'Grå', 'Blå', 'Sølv', 'Rød', 'Grønn', 'Brun'];
const DRIVSTOFF = ['Bensin', 'Diesel', 'El', 'Hybrid'];
const GIRKASSER = ['Manuell', 'Automat'];
const ANSATTE = ['Waleed', 'Ahmed', 'Sara', 'Mikael', 'Lena'];

function parseArgs() {
  const args = process.argv.slice(2);
  let count = 90;
  let remove = false;

  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--remove') remove = true;
    if (args[i] === '--count' && args[i + 1]) {
      count = Math.max(1, Number(args[i + 1]) || 90);
      i += 1;
    }
  }

  return { count, remove };
}

function pick(list, index) {
  return list[index % list.length];
}

function buildTestReg(index) {
  return TEST_PREFIX + String(TEST_REG_START + index).padStart(5, '0');
}

function buildCar(index, settings) {
  const brand = pick(CATALOG, index);
  const modell = pick(brand.modeller, Math.floor(index / CATALOG.length));
  const statuser = settings.bilStatuser || [];
  const status = pick(statuser, index);
  const aar = 2016 + (index % 9);
  const km = 12000 + (index * 1737) % 165000;
  const innkjop = 85000 + (index * 2911) % 240000;
  const salg = innkjop + 18000 + (index * 503) % 65000;
  const drivstoff = pick(DRIVSTOFF, index);
  const girkasse = drivstoff === 'El' ? 'Automat' : pick(GIRKASSER, index);

  let sjekklister = ensureSjekklisterForStatus({}, status, settings.bilSjekklister);
  const aktivSjekkliste = getAktivSjekklisteFromRow({ status }, sjekklister);

  return {
    reg: buildTestReg(index),
    merke: brand.merke,
    modell,
    aar,
    km,
    innkjop,
    salg,
    farge: pick(FARGER, index),
    status,
    ansvarlig: pick(ANSATTE, index),
    frist: '',
    notater: TEST_NOTE,
    eu_kontroll: `${String((index % 12) + 1).padStart(2, '0')}.${2025 + (index % 2)}`,
    forsikring: index % 3 === 0 ? 'If Skadeforsikring' : 'Tryg',
    drivstoff,
    girkasse,
    finn_kode: status === 'Annonsert' ? String(100000000 + index) : '',
    chassisnr: `WVWZZZ${String(100000 + index).padStart(6, '0')}`,
    utstyr: 'Navigasjon, ryggekamera, cruisekontroll',
    intern_info: 'Intern testdata',
    sjekkliste: JSON.stringify(aktivSjekkliste),
    sjekklister: JSON.stringify(sjekklister),
    logg: JSON.stringify([{
      dato: new Date().toLocaleString('nb-NO'),
      tekst: 'Testbil opprettet automatisk',
      bruker: 'system'
    }]),
    svv_data: null
  };
}

async function removeTestBiler() {
  const info = await prepare(`
    DELETE FROM biler
    WHERE UPPER(reg) LIKE ? OR notater = ?
  `).run([TEST_PREFIX + '%', TEST_NOTE]);

  await syncPostgresSequences();
  return info.changes || 0;
}

async function insertTestBiler(count) {
  const settings = await getInnstillinger();
  const existingRows = await prepare(`
    SELECT reg FROM biler WHERE UPPER(reg) LIKE ?
  `).all(TEST_PREFIX + '%');
  const existing = new Set(existingRows.map(function (row) { return String(row.reg).toUpperCase(); }));

  let inserted = 0;
  let skipped = 0;

  for (let i = 0; i < count; i += 1) {
    const car = buildCar(i, settings);
    if (existing.has(car.reg)) {
      skipped += 1;
      continue;
    }

    const sortOrder = await nextBilSortOrder(car.status);
    await prepare(`
      INSERT INTO biler (
        reg, merke, modell, aar, km, innkjop, salg, farge, status, sort_order,
        ansvarlig, frist, notater, eu_kontroll, forsikring, finn_kode, chassisnr,
        drivstoff, girkasse, utstyr, intern_info, sjekkliste, sjekklister, logg, svv_data
      ) VALUES (
        @reg, @merke, @modell, @aar, @km, @innkjop, @salg, @farge, @status, @sortOrder,
        @ansvarlig, @frist, @notater, @eu_kontroll, @forsikring, @finn_kode, @chassisnr,
        @drivstoff, @girkasse, @utstyr, @intern_info, @sjekkliste, @sjekklister, @logg, @svv_data
      )
    `).run({ ...car, sortOrder });

    existing.add(car.reg);
    inserted += 1;
  }

  await syncPostgresSequences();

  const total = (await prepare(`
    SELECT COUNT(*) AS c FROM biler WHERE archived = 0 AND UPPER(reg) LIKE ?
  `).get(TEST_PREFIX + '%')).c;

  return { inserted, skipped, total };
}

async function main() {
  const { count, remove } = parseArgs();

  await dbReady;

  if (remove) {
    const removed = await removeTestBiler();
    console.log(`Fjernet ${removed} testbiler (reg.nr ${TEST_PREFIX}xxxxx).`);
    return;
  }

  const result = await insertTestBiler(count);
  console.log(`La inn ${result.inserted} nye testbiler.`);
  if (result.skipped) {
    console.log(`Hoppet over ${result.skipped} som allerede fantes.`);
  }
  console.log(`Totalt ${result.total} aktive testbiler i lageret (${TEST_PREFIX}xxxxx).`);
}

main().catch(function (err) {
  console.error('seed-test-biler feilet:', err.message);
  process.exit(1);
});
