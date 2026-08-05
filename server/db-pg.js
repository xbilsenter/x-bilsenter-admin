'use strict';

const fs = require('fs');
const path = require('path');
const {
  parseJson,
  formatDate,
  DEFAULT_VEDLIKEHOLD,
  DEFAULT_BIL_STATUS_FARGER,
  DEFAULT_HENV_STATUS_FARGER,
  DEFAULT_INNBYTTE_STATUS_FARGER,
  DEFAULT_SJEKKLISTE_MAL,
  DEFAULT_INNSTILLINGER,
  SETTINGS_KEYS,
  PASS_MASK,
  PERMISSION_DEFS,
  ALL_PERMISSION_IDS,
  ROLE_TEMPLATES,
  normalizeModulOppsett,
  normalizeVedlikeholdModus,
  normalizeBilStatusFarger,
  normalizeHenvStatusFarger,
  normalizeInnbytteStatusFarger,
  normalizeBilSjekklister,
  sjekklisteFraMalServer,
  parseBilSjekklisterObject,
  getAktivSjekklisteFromRow,
  ensureSjekklisterForStatus,
  normalizeKundeEpost,
  mergeHenvKommentarer,
  createInternKommentar,
  normalizeHenvKommentarer,
  normalizeSmtpPortForStorage,
  normalizePermissions,
  jsonStringify
} = require('./db-shared');

const dbDriver = require('./database');
const { prepare, exec: execAsync, transaction, isPostgres } = dbDriver;
const { ensureMailFoldersSchema } = require('./mail-folders');

const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

if (!process.env.VERCEL) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  } catch (err) {
    console.warn('[db] Kunne ikke opprette lokal data-mappe:', err.message);
  }
}

const SERIAL_TABLES = [
  'users',
  'mail_kontoer',
  'henvendelser',
  'innbytte',
  'selg_bil',
  'biler',
  'kalender',
  'innkjopskalkyle',
  'eposter',
  'epost_utkast',
  'epost_maler',
  'mail_mapper',
  'epost_vedlegg',
  'kunder'
];

async function syncPostgresSequences() {
  for (const table of SERIAL_TABLES) {
    try {
      await prepare(`
        SELECT setval(
          pg_get_serial_sequence('${table}', 'id'),
          COALESCE((SELECT MAX(id) FROM ${table}), 1)
        )
      `).get();
    } catch (err) {
      console.warn(`Sekvens-sync hoppet over ${table}:`, err.message);
    }
  }
}

async function ensureInnkjopskalkyleSchema() {
  await execAsync(`
    CREATE TABLE IF NOT EXISTS public.innkjopskalkyle (
      id BIGSERIAL PRIMARY KEY,
      auksjon TEXT NOT NULL DEFAULT '',
      auksjonsslutt TIMESTAMPTZ,
      partinummer TEXT NOT NULL DEFAULT '',
      regnr TEXT NOT NULL DEFAULT '',
      kmstand INTEGER NOT NULL DEFAULT 0,
      modell TEXT NOT NULL DEFAULT '',
      utstyrsnivaa TEXT NOT NULL DEFAULT '',
      utsalgspris INTEGER NOT NULL DEFAULT 0,
      pakost INTEGER NOT NULL DEFAULT 0,
      auk_gebyr INTEGER NOT NULL DEFAULT 0,
      garantikost INTEGER NOT NULL DEFAULT 0,
      omreg_avgift INTEGER NOT NULL DEFAULT 0,
      avanse INTEGER NOT NULL DEFAULT 0,
      innkjopspris INTEGER NOT NULL DEFAULT 0,
      kommentarer TEXT NOT NULL DEFAULT '',
      autosys_data JSONB,
      created_by BIGINT REFERENCES public.users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_innkjopskalkyle_auksjon ON public.innkjopskalkyle (auksjon);
    CREATE INDEX IF NOT EXISTS idx_innkjopskalkyle_auksjonsslutt ON public.innkjopskalkyle (auksjonsslutt);
    CREATE INDEX IF NOT EXISTS idx_innkjopskalkyle_regnr ON public.innkjopskalkyle (regnr);
    ALTER TABLE public.innkjopskalkyle ADD COLUMN IF NOT EXISTS autosys_data JSONB;
    ALTER TABLE public.innkjopskalkyle ADD COLUMN IF NOT EXISTS updated_by BIGINT REFERENCES public.users(id) ON DELETE SET NULL;
  `);
}

async function ensureSelgBilSchema() {
  await execAsync(`
    CREATE TABLE IF NOT EXISTS public.selg_bil (
      id BIGSERIAL PRIMARY KEY,
      navn TEXT NOT NULL,
      epost TEXT NOT NULL,
      tlf TEXT NOT NULL,
      regnr TEXT NOT NULL,
      merke TEXT DEFAULT '',
      modell TEXT DEFAULT '',
      arsmodell TEXT DEFAULT '',
      drivstoff TEXT DEFAULT '',
      farge TEXT DEFAULT '',
      kjoretoy_type TEXT DEFAULT '',
      hjuldrift TEXT DEFAULT '',
      effekt_hk TEXT DEFAULT '',
      siste_eu_kontroll TEXT DEFAULT '',
      neste_eu_kontroll TEXT DEFAULT '',
      kilometerstand TEXT DEFAULT '',
      servicehistorikk TEXT DEFAULT '',
      siste_service TEXT DEFAULT '',
      utstyr JSONB NOT NULL DEFAULT '[]'::jsonb,
      sommerdekk TEXT DEFAULT '',
      vinterdekk TEXT DEFAULT '',
      forventning TEXT DEFAULT '',
      kommentar TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'Ny',
      ansvarlig TEXT DEFAULT '',
      tilbud TEXT DEFAULT '',
      kommentarer JSONB NOT NULL DEFAULT '[]'::jsonb,
      bilder JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE public.selg_bil ADD COLUMN IF NOT EXISTS kunde_id BIGINT REFERENCES public.kunder(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_selg_bil_status ON public.selg_bil (status);
    CREATE INDEX IF NOT EXISTS idx_selg_bil_kunde ON public.selg_bil (kunde_id);
  `);
}

async function ensureBilSchemaExtensions() {
  const statements = [
    "ALTER TABLE public.biler ADD COLUMN IF NOT EXISTS finn_kode TEXT DEFAULT ''",
    "ALTER TABLE public.biler ADD COLUMN IF NOT EXISTS chassisnr TEXT DEFAULT ''",
    "ALTER TABLE public.biler ADD COLUMN IF NOT EXISTS drivstoff TEXT DEFAULT ''",
    "ALTER TABLE public.biler ADD COLUMN IF NOT EXISTS girkasse TEXT DEFAULT ''",
    "ALTER TABLE public.biler ADD COLUMN IF NOT EXISTS utstyr TEXT DEFAULT ''",
    "ALTER TABLE public.biler ADD COLUMN IF NOT EXISTS intern_info TEXT DEFAULT ''",
    "ALTER TABLE public.biler ADD COLUMN IF NOT EXISTS kommentarer JSONB NOT NULL DEFAULT '[]'::jsonb",
    "ALTER TABLE public.biler ADD COLUMN IF NOT EXISTS dokumenter JSONB NOT NULL DEFAULT '[]'::jsonb"
  ];
  for (const sql of statements) {
    await execAsync(sql);
  }
}

function withInitTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise(function (resolve) {
      setTimeout(function () {
        console.warn('[db] Database-init tok for lang tid – fortsetter oppstart uten å vente.');
        resolve();
      }, ms);
    })
  ]);
}

const dbReady = withInitTimeout(
  ensureMailFoldersSchema()
    .then(function () { return ensureSelgBilSchema(); })
    .then(function () { return ensureInnkjopskalkyleSchema(); })
    .then(function () { return ensureBilSchemaExtensions(); })
    .then(function () { return syncPostgresSequences(); })
    .then(function () { return ensureDefaultAdminUser(); }),
  Number(process.env.DB_INIT_TIMEOUT_MS || 15000)
).catch(function (err) {
  console.warn('Database-init feilet:', err.message);
});

function initDb() {
  return dbReady;
}

async function ensureDefaultAdminUser() {
  const bcrypt = require('bcryptjs');
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'admin123';
  const existing = await getUserByUsername(username);
  if (existing) return;

  try {
    await createUser({
      username,
      name: 'Administrator',
      email: '',
      role: 'Daglig leder',
      permissions: ALL_PERMISSION_IDS,
      aktiv: true,
      isAdmin: true
    }, bcrypt.hashSync(password, 10));
    console.log('Opprettet standard admin-bruker:', username);
  } catch (err) {
    if (!/duplicate key|already exists/i.test(String(err.message))) throw err;
  }
}

function mapEpostMal(row) {
  if (!row) return null;
  const html = row.innhold_html || '';
  const snippet = String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  return {
    id: row.id,
    navn: row.navn || '',
    emne: row.emne || '',
    html,
    snippet,
    updatedAt: row.updated_at || '',
    createdAt: row.created_at || ''
  };
}

async function getEpostMaler() {
  const rows = await prepare(`
    SELECT * FROM epost_maler
    ORDER BY lower(navn) ASC, id ASC
  `).all();
  return rows.map(mapEpostMal).filter(Boolean);
}

async function getEpostMalById(id) {
  const row = await prepare('SELECT * FROM epost_maler WHERE id = ?').get(Number(id));
  return mapEpostMal(row);
}

async function createEpostMal(data) {
  const navn = String(data.navn || '').trim();
  if (!navn) throw new Error('Malnavn er påkrevd.');
  const info = await prepare(`
    INSERT INTO epost_maler (navn, emne, innhold_html, created_at, updated_at)
    VALUES (@navn, @emne, @innhold_html, datetime('now'), datetime('now'))
  `).run({
    navn,
    emne: String(data.emne || '').trim(),
    innhold_html: String(data.html || data.innholdHtml || '').trim()
  });
  return getEpostMalById(info.lastInsertRowid);
}

async function updateEpostMal(id, data) {
  const existing = await prepare('SELECT id FROM epost_maler WHERE id = ?').get(Number(id));
  if (!existing) return null;
  const navn = data.navn != null ? String(data.navn).trim() : undefined;
  if (navn === '') throw new Error('Malnavn er påkrevd.');
  await prepare(`
    UPDATE epost_maler SET
      navn = COALESCE(@navn, navn),
      emne = COALESCE(@emne, emne),
      innhold_html = COALESCE(@innhold_html, innhold_html),
      updated_at = datetime('now')
    WHERE id = @id
  `).run({
    id: Number(id),
    navn: navn ?? null,
    emne: data.emne != null ? String(data.emne).trim() : null,
    innhold_html: data.html != null || data.innholdHtml != null
      ? String(data.html ?? data.innholdHtml ?? '').trim()
      : null
  });
  return getEpostMalById(id);
}

async function deleteEpostMal(id) {
  await prepare('DELETE FROM epost_maler WHERE id = ?').run(Number(id));
}

function isEpostUtkastEmpty(data) {
  if (!data) return true;
  const html = String(data.innhold_html || data.html || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .trim();
  return !String(data.til || data.to || '').trim()
    && !String(data.emne || data.subject || '').trim()
    && !html;
}

function mapEpostUtkast(row) {
  if (!row || isEpostUtkastEmpty(row)) return null;
  const html = row.innhold_html || '';
  const snippet = String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return {
    id: row.id,
    kontoId: row.konto_id || null,
    kontoNavn: row.konto_navn || '',
    kontoEpost: row.konto_epost || '',
    to: row.til || '',
    cc: row.kopi || '',
    bcc: row.blindkopi || '',
    subject: row.emne || '',
    html,
    snippet,
    updatedAt: row.updated_at || '',
    createdAt: row.created_at || row.updated_at || '',
    sortDato: row.updated_at || row.created_at || '',
    dato: formatDate(row.updated_at || row.created_at)
  };
}

async function getEpostUtkastList() {
  const rows = await prepare(`
    SELECT u.*, k.navn AS konto_navn, k.epost AS konto_epost
    FROM epost_utkast u
    LEFT JOIN mail_kontoer k ON k.id = u.konto_id
    ORDER BY u.updated_at DESC, u.id DESC
  `).all();
  return rows.map(mapEpostUtkast).filter(Boolean);
}

async function getEpostUtkastById(id) {
  const row = await prepare(`
    SELECT u.*, k.navn AS konto_navn, k.epost AS konto_epost
    FROM epost_utkast u
    LEFT JOIN mail_kontoer k ON k.id = u.konto_id
    WHERE u.id = ?
  `).get(Number(id));
  return mapEpostUtkast(row);
}

async function countEpostUtkast() {
  const row = await prepare('SELECT COUNT(*) AS c FROM epost_utkast').get();
  return row.c;
}

async function saveEpostUtkast(data) {
  const id = data.id ? Number(data.id) : null;
  if (isEpostUtkastEmpty({
    til: data.to,
    emne: data.subject,
    innhold_html: data.html
  })) {
    if (id) await deleteEpostUtkast(id);
    return null;
  }

  const payload = {
    konto_id: data.kontoId ? Number(data.kontoId) : null,
    til: String(data.to || '').trim(),
    kopi: String(data.cc || '').trim(),
    blindkopi: String(data.bcc || '').trim(),
    emne: String(data.subject || '').trim(),
    innhold_html: String(data.html || '')
  };

  if (id) {
    const existing = await prepare('SELECT id FROM epost_utkast WHERE id = ?').get(id);
    if (!existing) return null;
    await prepare(`
      UPDATE epost_utkast SET
        konto_id = @konto_id,
        til = @til,
        kopi = @kopi,
        blindkopi = @blindkopi,
        emne = @emne,
        innhold_html = @innhold_html,
        updated_at = datetime('now')
      WHERE id = @id
    `).run({ ...payload, id });
    return getEpostUtkastById(id);
  }

  const info = await prepare(`
    INSERT INTO epost_utkast (
      konto_id, til, kopi, blindkopi, emne, innhold_html, created_at, updated_at
    ) VALUES (
      @konto_id, @til, @kopi, @blindkopi, @emne, @innhold_html, datetime('now'), datetime('now')
    )
  `).run(payload);
  return getEpostUtkastById(info.lastInsertRowid);
}

async function deleteEpostUtkast(id) {
  if (!id) return;
  await prepare('DELETE FROM epost_utkast WHERE id = ?').run(Number(id));
}

function mapMailKonto(row, includeSecrets) {
  if (!row) return null;
  return {
    id: row.id,
    navn: row.navn,
    epost: row.epost,
    imapHost: row.imap_host,
    imapPort: row.imap_port,
    imapSecure: !!row.imap_secure,
    imapUser: row.imap_user,
    imapPass: includeSecrets ? row.imap_pass : (row.imap_pass ? PASS_MASK : ''),
    hasImapPass: !!row.imap_pass,
    smtpHost: row.smtp_host,
    smtpPort: row.smtp_port,
    smtpSecure: !!row.smtp_secure,
    smtpUser: row.smtp_user,
    smtpPass: includeSecrets ? row.smtp_pass : (row.smtp_pass ? PASS_MASK : ''),
    hasSmtpPass: !!row.smtp_pass,
    fromName: row.from_name || 'X Bilsenter AS',
    signatur: row.signatur || '',
    aktiv: !!row.aktiv,
    standard: !!row.standard,
    lastSync: row.last_sync || '',
    imapConfigured: !!(row.aktiv && row.imap_host && row.imap_user && row.imap_pass),
    smtpConfigured: !!(row.aktiv && row.smtp_host && row.smtp_user && row.smtp_pass)
  };
}

async function getMailKontoer(includeSecrets) {
  const rows = await prepare('SELECT * FROM mail_kontoer ORDER BY standard DESC, navn ASC').all();
  return rows.map(function (row) { return mapMailKonto(row, includeSecrets); });
}

async function getMailKontoById(id, includeSecrets) {
  const row = await prepare('SELECT * FROM mail_kontoer WHERE id = ?').get(id);
  return mapMailKonto(row, includeSecrets);
}

async function getDefaultMailKonto(includeSecrets) {
  let row = await prepare('SELECT * FROM mail_kontoer WHERE aktiv = 1 AND standard = 1 LIMIT 1').get();
  if (!row) row = await prepare('SELECT * FROM mail_kontoer WHERE aktiv = 1 ORDER BY id ASC LIMIT 1').get();
  return mapMailKonto(row, includeSecrets);
}

async function createMailKonto(data) {
  const aktiv = data.aktiv !== false ? 1 : 0;
  const standard = data.standard ? 1 : 0;
  if (standard) {
    await prepare('UPDATE mail_kontoer SET standard = 0').run();
  }

  const info = await prepare(`
    INSERT INTO mail_kontoer (
      navn, epost, imap_host, imap_port, imap_secure, imap_user, imap_pass,
      smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass, from_name, signatur, aktiv, standard
    ) VALUES (
      @navn, @epost, @imap_host, @imap_port, @imap_secure, @imap_user, @imap_pass,
      @smtp_host, @smtp_port, @smtp_secure, @smtp_user, @smtp_pass, @from_name, @signatur, @aktiv, @standard
    )
  `).run({
    navn: data.navn,
    epost: data.epost,
    imap_host: data.imapHost || '',
    imap_port: Number(data.imapPort || 993),
    imap_secure: data.imapSecure !== false ? 1 : 0,
    imap_user: data.imapUser || data.epost || '',
    imap_pass: data.imapPass || '',
    smtp_host: data.smtpHost || '',
    smtp_port: normalizeSmtpPortForStorage(data.smtpPort),
    smtp_secure: data.smtpSecure ? 1 : 0,
    smtp_user: data.smtpUser || data.epost || '',
    smtp_pass: data.smtpPass || '',
    from_name: data.fromName || 'X Bilsenter AS',
    signatur: data.signatur || '',
    aktiv,
    standard
  });

  return getMailKontoById(info.lastInsertRowid, false);
}

async function updateMailKonto(id, data) {
  const existing = await prepare('SELECT * FROM mail_kontoer WHERE id = ?').get(id);
  if (!existing) return null;

  if (data.standard) {
    await prepare('UPDATE mail_kontoer SET standard = 0').run();
  }

  const imapPass = data.imapPass != null && data.imapPass !== PASS_MASK && data.imapPass !== ''
    ? data.imapPass
    : existing.imap_pass;
  const smtpPass = data.smtpPass != null && data.smtpPass !== PASS_MASK && data.smtpPass !== ''
    ? data.smtpPass
    : existing.smtp_pass;

  await prepare(`
    UPDATE mail_kontoer SET
      navn = @navn,
      epost = @epost,
      imap_host = @imap_host,
      imap_port = @imap_port,
      imap_secure = @imap_secure,
      imap_user = @imap_user,
      imap_pass = @imap_pass,
      smtp_host = @smtp_host,
      smtp_port = @smtp_port,
      smtp_secure = @smtp_secure,
      smtp_user = @smtp_user,
      smtp_pass = @smtp_pass,
      from_name = @from_name,
      signatur = @signatur,
      aktiv = @aktiv,
      standard = @standard,
      updated_at = datetime('now')
    WHERE id = @id
  `).run({
    id,
    navn: data.navn ?? existing.navn,
    epost: data.epost ?? existing.epost,
    imap_host: data.imapHost ?? existing.imap_host,
    imap_port: data.imapPort != null ? Number(data.imapPort) : existing.imap_port,
    imap_secure: data.imapSecure != null ? (data.imapSecure ? 1 : 0) : existing.imap_secure,
    imap_user: data.imapUser ?? existing.imap_user,
    imap_pass: imapPass,
    smtp_host: data.smtpHost ?? existing.smtp_host,
    smtp_port: data.smtpPort != null ? normalizeSmtpPortForStorage(data.smtpPort) : existing.smtp_port,
    smtp_secure: data.smtpSecure != null ? (data.smtpSecure ? 1 : 0) : existing.smtp_secure,
    smtp_user: data.smtpUser ?? existing.smtp_user,
    smtp_pass: smtpPass,
    from_name: data.fromName ?? existing.from_name,
    signatur: data.signatur ?? existing.signatur,
    aktiv: data.aktiv != null ? (data.aktiv ? 1 : 0) : existing.aktiv,
    standard: data.standard != null ? (data.standard ? 1 : 0) : existing.standard
  });

  return getMailKontoById(id, false);
}

async function cleanupOrphanEposter() {
  const kontoCount = (await prepare('SELECT COUNT(*) AS c FROM mail_kontoer').get()).c;
  if (kontoCount === 0) {
    return (await prepare('DELETE FROM eposter').run()).changes;
  }
  return (await prepare(`
    DELETE FROM eposter
    WHERE konto_id IS NULL
       OR konto_id NOT IN (SELECT id FROM mail_kontoer)
  `).run()).changes;
}

async function countUlestEpost() {
  const row = await prepare(`
    SELECT COUNT(*) AS c
    FROM eposter e
    INNER JOIN mail_kontoer k ON k.id = e.konto_id
    WHERE e.retning = 'inn' AND e.lest = 0 AND e.slettet = 0
  `).get();
  return row.c;
}

async function deleteMailKonto(id) {
  const row = await prepare('SELECT id FROM mail_kontoer WHERE id = ?').get(id);
  if (!row) return false;
  await prepare('DELETE FROM eposter WHERE konto_id = ?').run(id);
  await prepare('DELETE FROM mail_kontoer WHERE id = ?').run(id);
  await cleanupOrphanEposter();
  return true;
}

async function setMailKontoLastSync(id, iso) {
  await prepare('UPDATE mail_kontoer SET last_sync = @last_sync, updated_at = datetime(\'now\') WHERE id = @id')
    .run({ id, last_sync: iso });
}

async function getInnstillinger() {
  const rows = await prepare('SELECT key, value FROM innstillinger').all();
  const byKey = {};
  rows.forEach(function (row) { byKey[row.key] = row.value; });

  const bilStatuser = parseJson(byKey.bil_statuser, DEFAULT_INNSTILLINGER.bilStatuser);
  const henvStatuser = parseJson(byKey.henv_statuser, DEFAULT_INNSTILLINGER.henvStatuser);
  const innbytteStatuser = parseJson(byKey.innbytte_statuser, DEFAULT_INNSTILLINGER.innbytteStatuser);

  return {
    vedlikeholdModus: normalizeVedlikeholdModus(parseJson(byKey.vedlikehold_modus, DEFAULT_VEDLIKEHOLD)),
    ansatte: parseJson(byKey.ansatte, DEFAULT_INNSTILLINGER.ansatte),
    merker: parseJson(byKey.merker, DEFAULT_INNSTILLINGER.merker),
    bilStatuser,
    bilStatusFarger: normalizeBilStatusFarger(
      bilStatuser,
      parseJson(byKey.bil_status_farger, DEFAULT_BIL_STATUS_FARGER)
    ),
    bilSjekklister: normalizeBilSjekklister(
      bilStatuser,
      parseJson(byKey.bil_sjekklister, null),
      parseJson(byKey.sjekkliste_mal, DEFAULT_SJEKKLISTE_MAL)
    ),
    sjekklisteMal: parseJson(byKey.sjekkliste_mal, DEFAULT_SJEKKLISTE_MAL),
    henvStatuser,
    henvStatusFarger: normalizeHenvStatusFarger(
      henvStatuser,
      parseJson(byKey.henv_status_farger, DEFAULT_HENV_STATUS_FARGER)
    ),
    innbytteStatuser,
    innbytteStatusFarger: normalizeInnbytteStatusFarger(
      innbytteStatuser,
      parseJson(byKey.innbytte_status_farger, DEFAULT_INNBYTTE_STATUS_FARGER)
    ),
    kalTyper: parseJson(byKey.kal_typer, DEFAULT_INNSTILLINGER.kalTyper),
    modulOppsett: normalizeModulOppsett(parseJson(byKey.modul_oppsett, DEFAULT_INNSTILLINGER.modulOppsett))
  };
}

async function migrateBilStatusNavn(oldStatuser, newStatuser) {
  if (!Array.isArray(oldStatuser) || !Array.isArray(newStatuser)) return;
  if (oldStatuser.length !== newStatuser.length) return;
  for (let i = 0; i < oldStatuser.length; i += 1) {
    const oldName = oldStatuser[i];
    const newName = newStatuser[i];
    if (newName && oldName !== newName) {
      await prepare('UPDATE biler SET status = ?, updated_at = datetime(\'now\') WHERE status = ?')
        .run(newName, oldName);
    }
  }
}

async function saveInnstillinger(partial) {
  const current = await getInnstillinger();

  if (Array.isArray(partial.bilStatuser)) {
    await migrateBilStatusNavn(current.bilStatuser, partial.bilStatuser
      .map(function (item) { return String(item || '').trim(); })
      .filter(Boolean));
  }

  for (const [prop, key] of Object.entries(SETTINGS_KEYS)) {
    if (!Array.isArray(partial[prop])) continue;
    const cleaned = partial[prop]
      .map(function (item) { return String(item || '').trim(); })
      .filter(Boolean);
    if (!cleaned.length) continue;
    await prepare(`
      UPDATE innstillinger SET value = @value, updated_at = datetime('now') WHERE key = @key
    `).run({ key, value: JSON.stringify(cleaned) });

    if (prop === 'henvStatuser') {
      await prepare(`
        UPDATE innstillinger SET value = @value, updated_at = datetime('now') WHERE key = @key
      `).run({
        key: 'henv_status_farger',
        value: JSON.stringify(normalizeHenvStatusFarger(
          cleaned,
          partial.henvStatusFarger || current.henvStatusFarger
        ))
      });
    }

    if (prop === 'bilStatuser') {
      await prepare(`
        UPDATE innstillinger SET value = @value, updated_at = datetime('now') WHERE key = @key
      `).run({
        key: 'bil_status_farger',
        value: JSON.stringify(normalizeBilStatusFarger(
          cleaned,
          partial.bilStatusFarger || current.bilStatusFarger
        ))
      });
    }

    if (prop === 'innbytteStatuser') {
      await prepare(`
        INSERT OR REPLACE INTO innstillinger (key, value, updated_at)
        VALUES (@key, @value, datetime('now'))
      `).run({
        key: 'innbytte_status_farger',
        value: JSON.stringify(normalizeInnbytteStatusFarger(
          cleaned,
          partial.innbytteStatusFarger || current.innbytteStatusFarger
        ))
      });
    }
  }

  if (partial.henvStatusFarger && typeof partial.henvStatusFarger === 'object') {
    const statuser = Array.isArray(partial.henvStatuser)
      ? partial.henvStatuser
      : current.henvStatuser;
    await prepare(`
      UPDATE innstillinger SET value = @value, updated_at = datetime('now') WHERE key = @key
    `).run({
      key: 'henv_status_farger',
      value: JSON.stringify(normalizeHenvStatusFarger(statuser, partial.henvStatusFarger))
    });
  }

  if (partial.bilStatusFarger && typeof partial.bilStatusFarger === 'object') {
    const statuser = Array.isArray(partial.bilStatuser)
      ? partial.bilStatuser
      : current.bilStatuser;
    await prepare(`
      UPDATE innstillinger SET value = @value, updated_at = datetime('now') WHERE key = @key
    `).run({
      key: 'bil_status_farger',
      value: JSON.stringify(normalizeBilStatusFarger(statuser, partial.bilStatusFarger))
    });
  }

  if (partial.innbytteStatusFarger && typeof partial.innbytteStatusFarger === 'object') {
    const statuser = Array.isArray(partial.innbytteStatuser)
      ? partial.innbytteStatuser
      : current.innbytteStatuser;
    await prepare(`
      INSERT OR REPLACE INTO innstillinger (key, value, updated_at)
      VALUES (@key, @value, datetime('now'))
    `).run({
      key: 'innbytte_status_farger',
      value: JSON.stringify(normalizeInnbytteStatusFarger(statuser, partial.innbytteStatusFarger))
    });
  }

  if (partial.bilSjekklister && typeof partial.bilSjekklister === 'object') {
    const statuser = Array.isArray(partial.bilStatuser)
      ? partial.bilStatuser
      : current.bilStatuser;
    await prepare(`
      UPDATE innstillinger SET value = @value, updated_at = datetime('now') WHERE key = @key
    `).run({
      key: 'bil_sjekklister',
      value: JSON.stringify(normalizeBilSjekklister(
        statuser,
        partial.bilSjekklister,
        partial.sjekklisteMal || current.sjekklisteMal
      ))
    });
  }

  if (Array.isArray(partial.sjekklisteMal)) {
    const cleaned = partial.sjekklisteMal
      .map(function (item) { return String(item || '').trim(); })
      .filter(Boolean);
    if (cleaned.length) {
      await prepare(`
        UPDATE innstillinger SET value = @value, updated_at = datetime('now') WHERE key = @key
      `).run({ key: 'sjekkliste_mal', value: JSON.stringify(cleaned) });
    }
  }

  if (Array.isArray(partial.modulOppsett)) {
    await prepare(`
      UPDATE innstillinger SET value = @value, updated_at = datetime('now') WHERE key = @key
    `).run({
      key: 'modul_oppsett',
      value: JSON.stringify(normalizeModulOppsett(partial.modulOppsett))
    });
  }

  if (partial.vedlikeholdModus && typeof partial.vedlikeholdModus === 'object') {
    await prepare(`
      UPDATE innstillinger SET value = @value, updated_at = datetime('now') WHERE key = @key
    `).run({
      key: 'vedlikehold_modus',
      value: JSON.stringify(normalizeVedlikeholdModus(partial.vedlikeholdModus))
    });
  }

  return getInnstillinger();
}

async function getLister() {
  const settings = await getInnstillinger();
  return {
    ansatte: settings.ansatte,
    merker: settings.merker,
    bilStatuser: settings.bilStatuser,
    bilStatusFarger: settings.bilStatusFarger,
    bilSjekklister: settings.bilSjekklister,
    sjekklisteMal: settings.sjekklisteMal,
    henvStatuser: settings.henvStatuser,
    henvStatusFarger: settings.henvStatusFarger,
    innbytteStatuser: settings.innbytteStatuser,
    innbytteStatusFarger: settings.innbytteStatusFarger,
    kalTyper: settings.kalTyper
  };
}

async function getVedlikeholdModus() {
  try {
    const row = await prepare("SELECT value FROM innstillinger WHERE key = 'vedlikehold_modus'").get();
    return normalizeVedlikeholdModus(parseJson(row?.value, DEFAULT_VEDLIKEHOLD));
  } catch (err) {
    console.warn('[db] Kunne ikke lese vedlikehold_modus:', err.message);
    return normalizeVedlikeholdModus(DEFAULT_VEDLIKEHOLD);
  }
}

function mapHenv(row) {
  return {
    id: row.id,
    navn: row.navn,
    epost: row.epost,
    tlf: row.tlf,
    emne: row.emne,
    melding: row.melding,
    status: row.status,
    ansvarlig: row.ansvarlig,
    svar: row.svar,
    kommentarer: normalizeHenvKommentarer(parseJson(row.kommentarer, [])),
    dato: formatDate(row.created_at),
    kilde: row.kilde,
    bilRef: row.bil_ref,
    kundeId: row.kunde_id || null
  };
}

function mapInnbytte(row) {
  return {
    id: row.id,
    navn: row.navn,
    epost: row.epost,
    tlf: row.tlf,
    reg: row.regnr,
    merke: row.merke,
    modell: row.modell,
    aar: row.arsmodell,
    km: row.kilometerstand ? Number(row.kilometerstand) || row.kilometerstand : 0,
    tilstand: row.servicehistorikk || '—',
    servicehistorikk: row.servicehistorikk || '',
    sisteService: row.siste_service || '',
    sommerdekk: row.sommerdekk || '',
    vinterdekk: row.vinterdekk || '',
    drivstoff: row.drivstoff || '',
    farge: row.farge || '',
    kjoretoyType: row.kjoretoy_type || '',
    forventning: row.forventning || '',
    beskrivelse: row.kommentar,
    onsketBil: row.finn_kode,
    status: row.status,
    ansvarlig: row.ansvarlig,
    tilbud: row.tilbud,
    dato: formatDate(row.created_at),
    kommentarer: normalizeHenvKommentarer(parseJson(row.kommentarer, [])),
    utstyr: parseJson(row.utstyr, []),
    bilder: parseJson(row.bilder, []),
    kundeId: row.kunde_id || null,
    raw: row
  };
}

function mapSelgBil(row) {
  return {
    id: row.id,
    navn: row.navn,
    epost: row.epost,
    tlf: row.tlf,
    reg: row.regnr,
    merke: row.merke,
    modell: row.modell,
    aar: row.arsmodell,
    km: row.kilometerstand ? Number(row.kilometerstand) || row.kilometerstand : 0,
    tilstand: row.servicehistorikk || '—',
    servicehistorikk: row.servicehistorikk || '',
    sisteService: row.siste_service || '',
    sommerdekk: row.sommerdekk || '',
    vinterdekk: row.vinterdekk || '',
    drivstoff: row.drivstoff || '',
    farge: row.farge || '',
    kjoretoyType: row.kjoretoy_type || '',
    hjuldrift: row.hjuldrift || '',
    effektHk: row.effekt_hk || '',
    sisteEuKontroll: row.siste_eu_kontroll || '',
    nesteEuKontroll: row.neste_eu_kontroll || '',
    forventning: row.forventning || '',
    beskrivelse: row.kommentar,
    status: row.status,
    ansvarlig: row.ansvarlig,
    tilbud: row.tilbud,
    dato: formatDate(row.created_at),
    kommentarer: normalizeHenvKommentarer(parseJson(row.kommentarer, [])),
    utstyr: parseJson(row.utstyr, []),
    bilder: parseJson(row.bilder, []),
    kundeId: row.kunde_id || null,
    raw: row
  };
}

function mapBil(row, kundeIds) {
  const ids = Array.isArray(kundeIds) ? kundeIds : [];
  const sjekklister = parseBilSjekklisterObject(row);
  const sjekkliste = getAktivSjekklisteFromRow(row, sjekklister);
  return {
    id: Number(row.id),
    reg: row.reg,
    merke: row.merke,
    modell: row.modell,
    aar: row.aar,
    km: row.km,
    innkjop: row.innkjop,
    salg: row.salg,
    farge: row.farge,
    status: row.status,
    sortOrder: Number(row.sort_order ?? 0),
    ansvarlig: row.ansvarlig,
    frist: row.frist,
    notater: row.notater,
    euKontroll: row.eu_kontroll,
    forsikring: row.forsikring,
    finnKode: row.finn_kode || '',
    chassisnr: row.chassisnr || '',
    drivstoff: row.drivstoff || '',
    girkasse: row.girkasse || '',
    utstyr: row.utstyr || '',
    internInfo: row.intern_info || '',
    kommentarer: normalizeHenvKommentarer(parseJson(row.kommentarer, [])),
    dokumenter: parseJson(row.dokumenter, []),
    sjekklister,
    sjekkliste,
    logg: parseJson(row.logg, []),
    svvData: parseJson(row.svv_data, null),
    kundeId: row.kunde_id || null,
    kundeIds: ids,
    archived: !!row.archived,
    archivedAt: row.archived_at || null
  };
}

function calcInnkjopsprisRow(row) {
  return (Number(row.utsalgspris) || 0) - (
    (Number(row.pakost) || 0)
    + (Number(row.auk_gebyr) || 0)
    + (Number(row.garantikost) || 0)
    + (Number(row.omreg_avgift) || 0)
    + (Number(row.avanse) || 0)
  );
}

function mapInnkjopskalkyle(row) {
  if (!row) return null;
  return {
    id: row.id,
    auksjon: row.auksjon || '',
    auksjonsslutt: row.auksjonsslutt || '',
    partinummer: row.partinummer || '',
    regnr: row.regnr || '',
    kmstand: Number(row.kmstand || 0),
    modell: row.modell || '',
    utstyrsniva: row.utstyrsnivaa || '',
    utsalgspris: Number(row.utsalgspris || 0),
    pakost: Number(row.pakost || 0),
    aukGebyr: Number(row.auk_gebyr || 0),
    garantikost: Number(row.garantikost || 0),
    omregAvgift: Number(row.omreg_avgift || 0),
    avanse: Number(row.avanse || 0),
    innkjopspris: Number(row.innkjopspris != null ? row.innkjopspris : calcInnkjopsprisRow(row)),
    kommentarer: row.kommentarer || '',
    autosysData: parseJson(row.autosys_data, null),
    createdBy: row.created_by || null,
    createdByName: row.created_by_name || '',
    createdAt: row.created_at || '',
    updatedBy: row.updated_by || null,
    updatedByName: row.updated_by_name || '',
    updatedAt: row.updated_at || ''
  };
}

function mapKal(row) {
  return {
    id: row.id,
    tittel: row.tittel,
    type: row.type,
    dato: row.dato,
    tid: row.tid,
    tidSlutt: row.tid_slutt || '',
    ansvarlig: row.ansvarlig,
    bilRef: row.bil_ref,
    notat: row.notat,
    kundeId: row.kunde_id || null
  };
}

function mapEpost(row, vedlegg) {
  const sortDato = row.mottatt_dato || row.created_at || '';
  return {
    id: row.id,
    kontoId: row.konto_id || null,
    kontoNavn: row.konto_navn || '',
    kontoEpost: row.konto_epost || '',
    mappeId: row.mappe_id || null,
    mappeNavn: row.mappe_navn || '',
    mappeType: row.mappe_type || '',
    messageId: row.message_id,
    threadId: row.thread_id,
    inReplyTo: row.in_reply_to,
    retning: row.retning,
    fraNavn: row.fra_navn,
    fraEpost: row.fra_epost,
    tilEpost: row.til_epost,
    emne: row.emne,
    innhold: row.innhold,
    innholdHtml: row.innhold_html,
    lest: !!row.lest,
    flagged: !!row.flagged,
    slettet: !!row.slettet,
    henvendelseId: row.henvendelse_id,
    status: row.status || '',
    ansvarlig: row.ansvarlig || '',
    kundeId: row.kunde_id || null,
    vedlegg: Array.isArray(vedlegg) ? vedlegg : [],
    vedleggCount: Number(row.vedlegg_count || (vedlegg ? vedlegg.length : 0)),
    sortDato,
    dato: formatDate(sortDato)
  };
}

function mapUser(row, includeHash) {
  if (!row) return null;
  const user = {
    id: row.id,
    username: row.username,
    name: row.name,
    email: row.email || '',
    role: row.role,
    permissions: parseJson(row.permissions, []),
    aktiv: !!row.aktiv,
    isAdmin: !!row.is_admin,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
  if (includeHash) user.passwordHash = row.password_hash;
  return user;
}

async function getUserById(id, includeHash) {
  const row = await prepare('SELECT * FROM users WHERE id = ?').get(Number(id));
  return mapUser(row, includeHash);
}

async function getUserByUsername(username, includeHash) {
  const name = String(username || '').trim();
  if (!name) return null;
  const row = await prepare('SELECT * FROM users WHERE lower(username) = lower(?)').get(name);
  return mapUser(row, includeHash);
}

async function getUsers() {
  const rows = await prepare(`
    SELECT id, username, name, email, role, permissions, aktiv, is_admin, created_at, updated_at
    FROM users
    ORDER BY lower(name) ASC, id ASC
  `).all();
  return rows.map(function (row) { return mapUser(row); }).filter(Boolean);
}

async function countAdminUsers() {
  const row = await prepare('SELECT COUNT(*) AS c FROM users WHERE is_admin = 1 AND aktiv = 1').get();
  return row.c;
}

async function createUser(data, passwordHash) {
  const username = String(data.username || '').trim();
  const name = String(data.name || '').trim();
  if (!username) throw new Error('Brukernavn er påkrevd.');
  if (!name) throw new Error('Navn er påkrevd.');
  if (!passwordHash) throw new Error('Passord er påkrevd.');
  if (await getUserByUsername(username)) throw new Error('Brukernavnet finnes allerede.');

  const role = String(data.role || 'Selger').trim() || 'Selger';
  const permissions = normalizePermissions(
    data.permissions && data.permissions.length
      ? data.permissions
      : (ROLE_TEMPLATES[role] || ROLE_TEMPLATES.Selger)
  );
  const isAdmin = !!data.isAdmin;

  const info = await prepare(`
    INSERT INTO users (username, password_hash, name, email, role, permissions, aktiv, is_admin)
    VALUES (@username, @password_hash, @name, @email, @role, @permissions, @aktiv, @is_admin)
  `).run({
    username,
    password_hash: passwordHash,
    name,
    email: String(data.email || '').trim(),
    role,
    permissions: JSON.stringify(permissions),
    aktiv: data.aktiv === false ? 0 : 1,
    is_admin: isAdmin ? 1 : 0
  });

  return getUserById(info.lastInsertRowid);
}

async function updateUser(id, data, passwordHash) {
  const existing = await prepare('SELECT * FROM users WHERE id = ?').get(Number(id));
  if (!existing) return null;

  const username = data.username != null ? String(data.username).trim() : undefined;
  if (username === '') throw new Error('Brukernavn er påkrevd.');
  if (username) {
    const clash = await prepare(`
      SELECT id FROM users WHERE lower(username) = lower(?) AND id != ?
    `).get(username, Number(id));
    if (clash) throw new Error('Brukernavnet finnes allerede.');
  }

  let permissions = null;
  if (data.permissions != null) {
    permissions = JSON.stringify(normalizePermissions(data.permissions));
  } else if (data.role != null) {
    const role = String(data.role).trim();
    permissions = JSON.stringify(normalizePermissions(ROLE_TEMPLATES[role] || parseJson(existing.permissions, [])));
  }

  if (data.isAdmin === false && existing.is_admin && (await countAdminUsers()) <= 1) {
    throw new Error('Kan ikke fjerne siste aktive administrator.');
  }
  if (data.aktiv === false && existing.is_admin && (await countAdminUsers()) <= 1) {
    throw new Error('Kan ikke deaktivere siste aktive administrator.');
  }

  await prepare(`
    UPDATE users SET
      username = COALESCE(@username, username),
      password_hash = COALESCE(@password_hash, password_hash),
      name = COALESCE(@name, name),
      email = COALESCE(@email, email),
      role = COALESCE(@role, role),
      permissions = COALESCE(@permissions, permissions),
      aktiv = COALESCE(@aktiv, aktiv),
      is_admin = COALESCE(@is_admin, is_admin),
      updated_at = datetime('now')
    WHERE id = @id
  `).run({
    id: Number(id),
    username: username ?? null,
    password_hash: passwordHash ?? null,
    name: data.name != null ? String(data.name).trim() : null,
    email: data.email != null ? String(data.email).trim() : null,
    role: data.role != null ? String(data.role).trim() : null,
    permissions,
    aktiv: data.aktiv == null ? null : (data.aktiv ? 1 : 0),
    is_admin: data.isAdmin == null ? null : (data.isAdmin ? 1 : 0)
  });

  return getUserById(id);
}

async function deleteUser(id, currentUserId) {
  const targetId = Number(id);
  if (targetId === Number(currentUserId)) {
    throw new Error('Du kan ikke slette din egen bruker.');
  }

  const existing = await prepare('SELECT * FROM users WHERE id = ?').get(targetId);
  if (!existing) return false;
  if (existing.is_admin && (await countAdminUsers()) <= 1) {
    throw new Error('Kan ikke slette siste aktive administrator.');
  }

  await prepare('DELETE FROM users WHERE id = ?').run(targetId);
  return true;
}

function getPermissionDefs() {
  return PERMISSION_DEFS;
}

function getRoleTemplates() {
  return ROLE_TEMPLATES;
}

async function countKundeLinks(kundeId) {
  const id = Number(kundeId);
  return {
    henvendelser: (await prepare('SELECT COUNT(*) AS c FROM henvendelser WHERE kunde_id = ?').get(id)).c,
    innbytte: (await prepare('SELECT COUNT(*) AS c FROM innbytte WHERE kunde_id = ?').get(id)).c,
    selgBil: (await prepare('SELECT COUNT(*) AS c FROM selg_bil WHERE kunde_id = ?').get(id)).c,
    eposter: (await prepare('SELECT COUNT(*) AS c FROM eposter WHERE kunde_id = ?').get(id)).c,
    kalender: (await prepare('SELECT COUNT(*) AS c FROM kalender WHERE kunde_id = ?').get(id)).c,
    biler: (await prepare('SELECT COUNT(*) AS c FROM biler WHERE kunde_id = ?').get(id)).c
  };
}

function mapKunde(row, withStats) {
  if (!row) return null;
  const base = {
    id: row.id,
    navn: row.navn,
    epost: row.epost,
    tlf: row.tlf || '',
    adresse: row.adresse || '',
    postnr: row.postnr || '',
    poststed: row.poststed || '',
    organisasjonsnummer: row.organisasjonsnummer || '',
    type: row.type || 'Privat',
    notater: row.notater || '',
    kilde: row.kilde || 'Manuell',
    dato: formatDate(row.created_at),
    oppdatert: formatDate(row.updated_at)
  };
  if (withStats) base.stats = null;
  return base;
}

async function mapKundeWithStats(row) {
  const base = mapKunde(row, false);
  if (!base) return null;
  base.stats = await countKundeLinks(row.id);
  return base;
}

async function findOrCreateKunde(data) {
  const email = normalizeKundeEpost(data.epost);
  const name = String(data.navn || '').trim() || email || 'Ukjent';
  const phone = String(data.tlf || '').trim();
  const source = String(data.kilde || 'Manuell').trim() || 'Manuell';

  if (email) {
    const existing = await prepare(`
      SELECT * FROM kunder WHERE lower(trim(epost)) = ? LIMIT 1
    `).get(email);
    if (existing) {
      if (name && name !== 'Ukjent' && existing.navn !== name) {
        await prepare('UPDATE kunder SET navn = ?, updated_at = datetime(\'now\') WHERE id = ?').run(name, existing.id);
      }
      if (phone && !existing.tlf) {
        await prepare('UPDATE kunder SET tlf = ?, updated_at = datetime(\'now\') WHERE id = ?').run(phone, existing.id);
      }
      return existing.id;
    }
  }

  const info = await prepare(`
    INSERT INTO kunder (navn, epost, tlf, kilde)
    VALUES (@navn, @epost, @tlf, @kilde)
  `).run({
    navn: name,
    epost: email,
    tlf: phone,
    kilde: source
  });
  return info.lastInsertRowid;
}

async function linkInboundEpostToKunde(epostId, fraNavn, fraEpost) {
  if (!fraEpost) return null;
  const kundeId = await findOrCreateKunde({
    navn: fraNavn,
    epost: fraEpost,
    tlf: '',
    kilde: 'E-post'
  });
  await prepare('UPDATE eposter SET kunde_id = ? WHERE id = ?').run(kundeId, epostId);
  return kundeId;
}

async function getKunder(search) {
  const q = String(search || '').trim().toLowerCase();
  let rows;
  if (q) {
    const like = `%${q}%`;
    rows = await prepare(`
      SELECT * FROM kunder
      WHERE lower(navn) LIKE ? OR lower(epost) LIKE ? OR tlf LIKE ?
      ORDER BY lower(navn) ASC, id ASC
    `).all(like, like, like);
  } else {
    rows = await prepare('SELECT * FROM kunder ORDER BY lower(navn) ASC, id ASC').all();
  }
  const result = [];
  for (const row of rows) {
    result.push(await mapKundeWithStats(row));
  }
  return result;
}

async function getKundeById(id) {
  const row = await prepare('SELECT * FROM kunder WHERE id = ?').get(Number(id));
  return mapKundeWithStats(row);
}

async function getKundeAktivitet(kundeId) {
  const id = Number(kundeId);
  return {
    henvendelser: (await prepare('SELECT * FROM henvendelser WHERE kunde_id = ? ORDER BY created_at DESC').all(id)).map(mapHenv),
    innbytte: (await prepare('SELECT * FROM innbytte WHERE kunde_id = ? ORDER BY created_at DESC').all(id)).map(mapInnbytte),
    selgBil: (await prepare('SELECT * FROM selg_bil WHERE kunde_id = ? ORDER BY created_at DESC').all(id)).map(mapSelgBil),
    eposter: (await prepare(`
      SELECT e.*, k.navn AS konto_navn, k.epost AS konto_epost
      FROM eposter e
      LEFT JOIN mail_kontoer k ON k.id = e.konto_id
      WHERE e.kunde_id = ?
      ORDER BY e.mottatt_dato DESC
    `).all(id)).map(mapEpost),
    kalender: (await prepare('SELECT * FROM kalender WHERE kunde_id = ? ORDER BY dato DESC, tid DESC').all(id)).map(mapKal),
    biler: (await prepare('SELECT * FROM biler WHERE kunde_id = ? ORDER BY id DESC').all(id)).map(function (row) {
      return mapBil(row, []);
    })
  };
}

async function createKunde(data) {
  const navn = String(data.navn || '').trim();
  if (!navn) throw new Error('Navn er påkrevd.');

  const info = await prepare(`
    INSERT INTO kunder (
      navn, epost, tlf, adresse, postnr, poststed, organisasjonsnummer, type, notater, kilde
    ) VALUES (
      @navn, @epost, @tlf, @adresse, @postnr, @poststed, @organisasjonsnummer, @type, @notater, @kilde
    )
  `).run({
    navn,
    epost: normalizeKundeEpost(data.epost),
    tlf: String(data.tlf || '').trim(),
    adresse: String(data.adresse || '').trim(),
    postnr: String(data.postnr || '').trim(),
    poststed: String(data.poststed || '').trim(),
    organisasjonsnummer: String(data.organisasjonsnummer || '').trim(),
    type: data.type === 'Bedrift' ? 'Bedrift' : 'Privat',
    notater: String(data.notater || '').trim(),
    kilde: String(data.kilde || 'Manuell').trim() || 'Manuell'
  });

  return getKundeById(info.lastInsertRowid);
}

async function updateKunde(id, data) {
  const existing = await prepare('SELECT * FROM kunder WHERE id = ?').get(Number(id));
  if (!existing) return null;

  if (data.navn != null && !String(data.navn).trim()) {
    throw new Error('Navn kan ikke være tom.');
  }

  await prepare(`
    UPDATE kunder SET
      navn = COALESCE(@navn, navn),
      epost = COALESCE(@epost, epost),
      tlf = COALESCE(@tlf, tlf),
      adresse = COALESCE(@adresse, adresse),
      postnr = COALESCE(@postnr, postnr),
      poststed = COALESCE(@poststed, poststed),
      organisasjonsnummer = COALESCE(@organisasjonsnummer, organisasjonsnummer),
      type = COALESCE(@type, type),
      notater = COALESCE(@notater, notater),
      updated_at = datetime('now')
    WHERE id = @id
  `).run({
    id: Number(id),
    navn: data.navn != null ? String(data.navn).trim() : null,
    epost: data.epost != null ? normalizeKundeEpost(data.epost) : null,
    tlf: data.tlf != null ? String(data.tlf).trim() : null,
    adresse: data.adresse != null ? String(data.adresse).trim() : null,
    postnr: data.postnr != null ? String(data.postnr).trim() : null,
    poststed: data.poststed != null ? String(data.poststed).trim() : null,
    organisasjonsnummer: data.organisasjonsnummer != null ? String(data.organisasjonsnummer).trim() : null,
    type: data.type != null ? (data.type === 'Bedrift' ? 'Bedrift' : 'Privat') : null,
    notater: data.notater != null ? String(data.notater).trim() : null
  });

  return getKundeById(id);
}

async function deleteKunde(id) {
  const targetId = Number(id);
  const existing = await prepare('SELECT id FROM kunder WHERE id = ?').get(targetId);
  if (!existing) return false;

  const stats = await countKundeLinks(targetId);
  const total = stats.henvendelser + stats.innbytte + stats.selgBil + stats.eposter + stats.kalender + stats.biler;
  if (total > 0) {
    throw new Error(`Kunden er koblet til ${total} poster. Fjern koblingene først.`);
  }

  await prepare('DELETE FROM kunder WHERE id = ?').run(targetId);
  return true;
}

async function getAllBilKundeIdsMap() {
  const map = {};
  const rows = await prepare(`
    SELECT bil_id, kunde_id FROM bil_kunder ORDER BY created_at ASC, kunde_id ASC
  `).all();
  rows.forEach(function (row) {
    if (!map[row.bil_id]) map[row.bil_id] = [];
    map[row.bil_id].push(row.kunde_id);
  });
  return map;
}

async function setBilKunder(bilId, kundeIds) {
  const id = Number(bilId);
  const ids = Array.from(new Set((Array.isArray(kundeIds) ? kundeIds : [])
    .map(Number)
    .filter(Boolean)));

  for (const kid of ids) {
    const kunde = await prepare('SELECT id FROM kunder WHERE id = ?').get(kid);
    if (!kunde) throw new Error('Kunde #' + kid + ' finnes ikke.');
  }

  await transaction(async function () {
    await prepare('DELETE FROM bil_kunder WHERE bil_id = ?').run(id);
    for (const kid of ids) {
      await prepare('INSERT INTO bil_kunder (bil_id, kunde_id) VALUES (?, ?)').run(id, kid);
    }
    await prepare('UPDATE biler SET kunde_id = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .run(ids[0] || null, id);
  })();

  return ids;
}

async function nextBilSortOrder(status) {
  const row = await prepare('SELECT MAX(sort_order) AS m FROM biler WHERE status = ?').get(status || '');
  return (row?.m || 0) + 10;
}

async function reorderBiler(updates, ansvarligNavn) {
  if (!Array.isArray(updates) || !updates.length) return [];

  const statusChanged = updates.some(function (item) {
    return item.status != null;
  });
  let bilSjekklisterMal = null;
  let bilStatuser = null;
  if (statusChanged) {
    const rows = await prepare(`
      SELECT key, value FROM innstillinger
      WHERE key IN ('bil_sjekklister', 'bil_statuser', 'sjekkliste_mal')
    `).all();
    const byKey = {};
    rows.forEach(function (row) { byKey[row.key] = row.value; });
    bilStatuser = parseJson(byKey.bil_statuser, DEFAULT_INNSTILLINGER.bilStatuser);
    bilSjekklisterMal = normalizeBilSjekklister(
      bilStatuser,
      parseJson(byKey.bil_sjekklister, null),
      parseJson(byKey.sjekkliste_mal, DEFAULT_SJEKKLISTE_MAL)
    );
  }

  const ids = updates.map(function (u) { return Number(u.id); }).filter(Boolean);
  const placeholders = ids.map(function () { return '?'; }).join(', ');
  const existingRows = await prepare(`SELECT * FROM biler WHERE id IN (${placeholders})`).all(ids);
  const byId = {};
  existingRows.forEach(function (row) { byId[row.id] = row; });

  const payloads = [];
  updates.forEach(function (item) {
    const id = Number(item.id);
    const existing = byId[id];
    if (!existing) return;
    const newStatus = String(item.status || existing.status);
    let sjekklister = parseBilSjekklisterObject(existing);
    if (bilSjekklisterMal && newStatus !== existing.status) {
      sjekklister = ensureSjekklisterForStatus(sjekklister, newStatus, bilSjekklisterMal);
    }
    const aktiv = getAktivSjekklisteFromRow({ ...existing, status: newStatus }, sjekklister);
    payloads.push({
      id,
      status: newStatus,
      sortOrder: Number(item.sortOrder) || 0,
      sjekklister: jsonStringify(sjekklister),
      sjekkliste: jsonStringify(aktiv)
    });
  });

  const ansvarlig = String(ansvarligNavn || '').trim();

  await Promise.all(payloads.map(function (p) {
    return prepare(`
      UPDATE biler SET status = @status, sort_order = @sortOrder,
        sjekklister = @sjekklister, sjekkliste = @sjekkliste,
        ansvarlig = CASE WHEN @ansvarlig != '' THEN @ansvarlig ELSE ansvarlig END,
        updated_at = datetime('now')
      WHERE id = @id
    `).run({ ...p, ansvarlig: ansvarlig });
  }));

  const kundeMap = await getAllBilKundeIdsMap();
  return payloads.map(function (p) {
    const row = byId[p.id];
    if (!row) return null;
    return mapBil({
      ...row,
      status: p.status,
      sort_order: p.sortOrder,
      sjekklister: p.sjekklister,
      sjekkliste: p.sjekkliste,
      ansvarlig: ansvarlig || row.ansvarlig
    }, kundeMap[p.id] || []);
  }).filter(Boolean);
}

initDb();

module.exports = {
  db: null,
  dbReady,
  syncPostgresSequences,
  isPostgres,
  prepare,
  execAsync,
  transaction,
  UPLOADS_DIR,
  parseJson,
  mapHenv,
  mergeHenvKommentarer,
  createInternKommentar,
  normalizeHenvKommentarer,
  mapInnbytte,
  mapSelgBil,
  mapBil,
  mapKal,
  mapInnkjopskalkyle,
  calcInnkjopsprisRow,
  mapEpost,
  formatDate,
  getInnstillinger,
  saveInnstillinger,
  getLister,
  getVedlikeholdModus,
  getMailKontoer,
  getMailKontoById,
  getDefaultMailKonto,
  createMailKonto,
  updateMailKonto,
  deleteMailKonto,
  cleanupOrphanEposter,
  countUlestEpost,
  getEpostUtkastList,
  getEpostUtkastById,
  countEpostUtkast,
  saveEpostUtkast,
  deleteEpostUtkast,
  getEpostMaler,
  getEpostMalById,
  createEpostMal,
  updateEpostMal,
  deleteEpostMal,
  setMailKontoLastSync,
  getUserById,
  getUserByUsername,
  getUsers,
  createUser,
  updateUser,
  deleteUser,
  getPermissionDefs,
  getRoleTemplates,
  ALL_PERMISSION_IDS,
  PASS_MASK,
  findOrCreateKunde,
  linkInboundEpostToKunde,
  mapKunde,
  getKunder,
  getKundeById,
  getKundeAktivitet,
  createKunde,
  updateKunde,
  deleteKunde,
  getAllBilKundeIdsMap,
  setBilKunder,
  nextBilSortOrder,
  reorderBiler,
  ensureSjekklisterForStatus,
  parseBilSjekklisterObject,
  getAktivSjekklisteFromRow,
  sjekklisteFraMalServer
};
