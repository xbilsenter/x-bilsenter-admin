'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { normalizeBilTilstandsrapport, DEFAULT_BIL_TILSTANDSRAPPORT, normalizeBilArsprovekjennemerke, DEFAULT_BIL_ARSPROVEKJENNEMERKE, normalizeMerkerList } = require('./db-shared');
const { MERKER } = require('./merker');
const { formatSvvFargeNavn, normalizeSvvDataFarge } = require('./farge');

const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'xbilsenter.db');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

if (!process.env.VERCEL) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  } catch (err) {
    console.warn('[db] Kunne ikke opprette lokal data-mappe:', err.message);
  }
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function parseJson(value, fallback) {
  if (value == null || value === '') return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS henvendelser (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      navn TEXT NOT NULL,
      epost TEXT NOT NULL,
      tlf TEXT DEFAULT '',
      emne TEXT NOT NULL,
      melding TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'Ny',
      ansvarlig TEXT DEFAULT '',
      svar TEXT DEFAULT '',
      kommentarer TEXT NOT NULL DEFAULT '[]',
      kilde TEXT NOT NULL DEFAULT 'Nettside',
      bil_ref TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS innbytte (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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
      utstyr TEXT NOT NULL DEFAULT '[]',
      sommerdekk TEXT DEFAULT '',
      vinterdekk TEXT DEFAULT '',
      forventning TEXT DEFAULT '',
      kommentar TEXT DEFAULT '',
      finn_kode TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'Ny',
      ansvarlig TEXT DEFAULT '',
      tilbud TEXT DEFAULT '',
      kommentarer TEXT NOT NULL DEFAULT '[]',
      bilder TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS selg_bil (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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
      utstyr TEXT NOT NULL DEFAULT '[]',
      sommerdekk TEXT DEFAULT '',
      vinterdekk TEXT DEFAULT '',
      forventning TEXT DEFAULT '',
      kommentar TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'Ny',
      ansvarlig TEXT DEFAULT '',
      tilbud TEXT DEFAULT '',
      kommentarer TEXT NOT NULL DEFAULT '[]',
      bilder TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS biler (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reg TEXT NOT NULL,
      merke TEXT NOT NULL,
      modell TEXT NOT NULL,
      aar INTEGER NOT NULL DEFAULT 0,
      km INTEGER NOT NULL DEFAULT 0,
      innkjop INTEGER NOT NULL DEFAULT 0,
      salg INTEGER NOT NULL DEFAULT 0,
      farge TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'Innkjøpt',
      ansvarlig TEXT DEFAULT '',
      frist TEXT DEFAULT '',
      notater TEXT DEFAULT '',
      eu_kontroll TEXT DEFAULT '',
      forsikring TEXT DEFAULT '',
      sjekkliste TEXT NOT NULL DEFAULT '[]',
      logg TEXT NOT NULL DEFAULT '[]',
      svv_data TEXT DEFAULT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS kalender (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tittel TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'Annet',
      dato TEXT NOT NULL,
      tid TEXT NOT NULL DEFAULT '10:00',
      tid_slutt TEXT DEFAULT '',
      ansvarlig TEXT DEFAULT '',
      bil_ref TEXT DEFAULT '',
      notat TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS innkjopskalkyle (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      auksjon TEXT NOT NULL DEFAULT '',
      auksjonsslutt TEXT DEFAULT '',
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
      autosys_data TEXT DEFAULT NULL,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS innstillinger (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS eposter (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id TEXT NOT NULL UNIQUE,
      thread_id TEXT DEFAULT '',
      in_reply_to TEXT DEFAULT '',
      retning TEXT NOT NULL DEFAULT 'inn',
      fra_navn TEXT DEFAULT '',
      fra_epost TEXT NOT NULL DEFAULT '',
      til_epost TEXT DEFAULT '',
      emne TEXT NOT NULL DEFAULT '',
      innhold TEXT DEFAULT '',
      innhold_html TEXT DEFAULT '',
      lest INTEGER NOT NULL DEFAULT 0,
      henvendelse_id INTEGER DEFAULT NULL,
      mottatt_dato TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  seedInnstillinger();
  seedIfEmpty();
  migrateKalender();
  migrateEposter();
  migrateMailKontoer();
  cleanupOrphanEposter();
  migrateSmtpPortFix();
  migrateEpostUtkast();
  migrateEpostMaler();
  migrateUsers();
  migrateModulOppsett();
  migrateInnkjopskalkyleAutosys();
  migrateInnkjopskalkyleUpdatedBy();
  migrateBilSchemaExtensions();
  migrateBilSlettinger();
}

function normalizeModulOppsett(list) {
  const defaults = DEFAULT_INNSTILLINGER.modulOppsett;
  const defaultById = {};
  defaults.forEach(function (item) { defaultById[item.id] = item; });

  const byId = {};
  (Array.isArray(list) ? list : []).forEach(function (item) {
    if (!item || !item.id || !defaultById[item.id]) return;
    const fallback = defaultById[item.id].label;
    byId[item.id] = {
      id: item.id,
      label: String(item.label || '').trim() || fallback
    };
  });

  const result = [];
  (Array.isArray(list) ? list : []).forEach(function (item) {
    if (!item?.id || !byId[item.id]) return;
    if (result.some(function (row) { return row.id === item.id; })) return;
    result.push(byId[item.id]);
  });

  defaults.forEach(function (item) {
    if (!result.some(function (row) { return row.id === item.id; })) {
      result.push(byId[item.id] || { ...item });
    }
  });

  return result;
}

function migrateInnkjopskalkyleAutosys() {
  try {
    db.exec('ALTER TABLE innkjopskalkyle ADD COLUMN autosys_data TEXT DEFAULT NULL');
  } catch {
    /* column exists */
  }
}

function migrateInnkjopskalkyleUpdatedBy() {
  try {
    db.exec('ALTER TABLE innkjopskalkyle ADD COLUMN updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL');
  } catch {
    /* column exists */
  }
}

function migrateBilSchemaExtensions() {
  const columns = [
    "ALTER TABLE biler ADD COLUMN finn_kode TEXT DEFAULT ''",
    "ALTER TABLE biler ADD COLUMN chassisnr TEXT DEFAULT ''",
    "ALTER TABLE biler ADD COLUMN drivstoff TEXT DEFAULT ''",
    "ALTER TABLE biler ADD COLUMN girkasse TEXT DEFAULT ''",
    "ALTER TABLE biler ADD COLUMN utstyr TEXT DEFAULT ''",
    "ALTER TABLE biler ADD COLUMN intern_info TEXT DEFAULT ''",
    "ALTER TABLE biler ADD COLUMN kommentarer TEXT NOT NULL DEFAULT '[]'",
    "ALTER TABLE biler ADD COLUMN dokumenter TEXT NOT NULL DEFAULT '[]'",
    "ALTER TABLE biler ADD COLUMN okonomi TEXT NOT NULL DEFAULT '{}'",
    "ALTER TABLE biler ADD COLUMN tilstandsrapport TEXT NOT NULL DEFAULT '{\"medfolger\":false,\"nybilgaranti\":false,\"status\":\"ikke_utfort\"}'",
    "ALTER TABLE biler ADD COLUMN arsprovekjennemerke TEXT NOT NULL DEFAULT '{\"skiltnummer\":\"\",\"fraDato\":\"\",\"tilDato\":\"\",\"status\":\"ingen\",\"notater\":\"\"}'",
    "ALTER TABLE biler ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE biler ADD COLUMN sjekklister TEXT NOT NULL DEFAULT '{}'",
    "ALTER TABLE biler ADD COLUMN archived INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE biler ADD COLUMN archived_at TEXT DEFAULT NULL"
  ];
  columns.forEach(function (sql) {
    try { db.exec(sql); } catch { /* column exists */ }
  });
}

function migrateBilSlettinger() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS bil_slettinger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bil_id INTEGER,
      reg TEXT NOT NULL,
      merke TEXT DEFAULT '',
      modell TEXT DEFAULT '',
      status TEXT DEFAULT '',
      slettet_av_id INTEGER,
      slettet_av_navn TEXT NOT NULL,
      slettet_av_rolle TEXT DEFAULT '',
      slettet_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_bil_slettinger_at ON bil_slettinger(slettet_at DESC);
  `);
}

function migrateModulOppsett() {
  const row = db.prepare("SELECT value FROM innstillinger WHERE key = 'modul_oppsett'").get();
  if (!row) {
    db.prepare(`
      INSERT INTO innstillinger (key, value, updated_at)
      VALUES ('modul_oppsett', @value, datetime('now'))
    `).run({
      value: JSON.stringify(DEFAULT_INNSTILLINGER.modulOppsett)
    });
  }
}

function migrateEpostMaler() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS epost_maler (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      navn TEXT NOT NULL,
      emne TEXT DEFAULT '',
      innhold_html TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
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

function getEpostMaler() {
  return db.prepare(`
    SELECT * FROM epost_maler
    ORDER BY navn COLLATE NOCASE ASC, id ASC
  `).all().map(mapEpostMal).filter(Boolean);
}

function getEpostMalById(id) {
  return mapEpostMal(db.prepare('SELECT * FROM epost_maler WHERE id = ?').get(Number(id)));
}

function createEpostMal(data) {
  const navn = String(data.navn || '').trim();
  if (!navn) throw new Error('Malnavn er påkrevd.');
  const info = db.prepare(`
    INSERT INTO epost_maler (navn, emne, innhold_html, created_at, updated_at)
    VALUES (@navn, @emne, @innhold_html, datetime('now'), datetime('now'))
  `).run({
    navn,
    emne: String(data.emne || '').trim(),
    innhold_html: String(data.html || data.innholdHtml || '').trim()
  });
  return getEpostMalById(info.lastInsertRowid);
}

function updateEpostMal(id, data) {
  const existing = db.prepare('SELECT id FROM epost_maler WHERE id = ?').get(Number(id));
  if (!existing) return null;
  const navn = data.navn != null ? String(data.navn).trim() : undefined;
  if (navn === '') throw new Error('Malnavn er påkrevd.');
  db.prepare(`
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

function deleteEpostMal(id) {
  db.prepare('DELETE FROM epost_maler WHERE id = ?').run(Number(id));
}

function migrateEpostUtkast() {
  const exists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='epost_utkast'").get();
  if (!exists) {
    db.exec(`
      CREATE TABLE epost_utkast (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        konto_id INTEGER,
        til TEXT DEFAULT '',
        kopi TEXT DEFAULT '',
        blindkopi TEXT DEFAULT '',
        emne TEXT DEFAULT '',
        innhold_html TEXT DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    return;
  }
  migrateEpostUtkastFolder();
}

function migrateEpostUtkastFolder() {
  const meta = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='epost_utkast'").get();
  if (!meta?.sql || meta.sql.includes('AUTOINCREMENT')) return;

  db.exec(`
    CREATE TABLE epost_utkast_v2 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      konto_id INTEGER,
      til TEXT DEFAULT '',
      kopi TEXT DEFAULT '',
      blindkopi TEXT DEFAULT '',
      emne TEXT DEFAULT '',
      innhold_html TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.exec(`
    INSERT INTO epost_utkast_v2 (konto_id, til, kopi, blindkopi, emne, innhold_html, created_at, updated_at)
    SELECT konto_id, til, kopi, blindkopi, emne, innhold_html, updated_at, updated_at
    FROM epost_utkast
  `);
  db.exec('DROP TABLE epost_utkast');
  db.exec('ALTER TABLE epost_utkast_v2 RENAME TO epost_utkast');
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
    dato: formatDate(row.updated_at || row.created_at)
  };
}

function getEpostUtkastList() {
  return db.prepare(`
    SELECT u.*, k.navn AS konto_navn, k.epost AS konto_epost
    FROM epost_utkast u
    LEFT JOIN mail_kontoer k ON k.id = u.konto_id
    ORDER BY u.updated_at DESC, u.id DESC
  `).all().map(mapEpostUtkast).filter(Boolean);
}

function getEpostUtkastById(id) {
  const row = db.prepare(`
    SELECT u.*, k.navn AS konto_navn, k.epost AS konto_epost
    FROM epost_utkast u
    LEFT JOIN mail_kontoer k ON k.id = u.konto_id
    WHERE u.id = ?
  `).get(Number(id));
  return mapEpostUtkast(row);
}

function countEpostUtkast() {
  return db.prepare('SELECT COUNT(*) AS c FROM epost_utkast').get().c;
}

function saveEpostUtkast(data) {
  const id = data.id ? Number(data.id) : null;
  if (isEpostUtkastEmpty({
    til: data.to,
    emne: data.subject,
    innhold_html: data.html
  })) {
    if (id) deleteEpostUtkast(id);
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
    const existing = db.prepare('SELECT id FROM epost_utkast WHERE id = ?').get(id);
    if (!existing) return null;
    db.prepare(`
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

  const info = db.prepare(`
    INSERT INTO epost_utkast (
      konto_id, til, kopi, blindkopi, emne, innhold_html, created_at, updated_at
    ) VALUES (
      @konto_id, @til, @kopi, @blindkopi, @emne, @innhold_html, datetime('now'), datetime('now')
    )
  `).run(payload);
  return getEpostUtkastById(info.lastInsertRowid);
}

function deleteEpostUtkast(id) {
  if (!id) return;
  db.prepare('DELETE FROM epost_utkast WHERE id = ?').run(Number(id));
}

function migrateKalender() {
  const cols = db.prepare('PRAGMA table_info(kalender)').all().map(function (c) { return c.name; });
  if (!cols.includes('tid_slutt')) {
    db.exec("ALTER TABLE kalender ADD COLUMN tid_slutt TEXT DEFAULT ''");
  }
}

function migrateEposter() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS eposter (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id TEXT NOT NULL UNIQUE,
      thread_id TEXT DEFAULT '',
      in_reply_to TEXT DEFAULT '',
      retning TEXT NOT NULL DEFAULT 'inn',
      fra_navn TEXT DEFAULT '',
      fra_epost TEXT NOT NULL DEFAULT '',
      til_epost TEXT DEFAULT '',
      emne TEXT NOT NULL DEFAULT '',
      innhold TEXT DEFAULT '',
      innhold_html TEXT DEFAULT '',
      lest INTEGER NOT NULL DEFAULT 0,
      henvendelse_id INTEGER DEFAULT NULL,
      mottatt_dato TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  migrateEposterKonto();
}

function migrateEposterKonto() {
  const cols = db.prepare('PRAGMA table_info(eposter)').all().map(function (c) { return c.name; });
  if (cols.includes('konto_id')) return;

  db.exec(`
    CREATE TABLE eposter_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      konto_id INTEGER DEFAULT NULL,
      message_id TEXT NOT NULL,
      thread_id TEXT DEFAULT '',
      in_reply_to TEXT DEFAULT '',
      retning TEXT NOT NULL DEFAULT 'inn',
      fra_navn TEXT DEFAULT '',
      fra_epost TEXT NOT NULL DEFAULT '',
      til_epost TEXT DEFAULT '',
      emne TEXT NOT NULL DEFAULT '',
      innhold TEXT DEFAULT '',
      innhold_html TEXT DEFAULT '',
      lest INTEGER NOT NULL DEFAULT 0,
      henvendelse_id INTEGER DEFAULT NULL,
      mottatt_dato TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(konto_id, message_id)
    );

    INSERT INTO eposter_new (
      id, konto_id, message_id, thread_id, in_reply_to, retning,
      fra_navn, fra_epost, til_epost, emne, innhold, innhold_html,
      lest, henvendelse_id, mottatt_dato, created_at
    )
    SELECT
      id, NULL, message_id, thread_id, in_reply_to, retning,
      fra_navn, fra_epost, til_epost, emne, innhold, innhold_html,
      lest, henvendelse_id, mottatt_dato, created_at
    FROM eposter;

    DROP TABLE eposter;
    ALTER TABLE eposter_new RENAME TO eposter;
  `);
}

function migrateMailKontoer() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS mail_kontoer (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      navn TEXT NOT NULL,
      epost TEXT NOT NULL,
      imap_host TEXT NOT NULL DEFAULT '',
      imap_port INTEGER NOT NULL DEFAULT 993,
      imap_secure INTEGER NOT NULL DEFAULT 1,
      imap_user TEXT NOT NULL DEFAULT '',
      imap_pass TEXT NOT NULL DEFAULT '',
      smtp_host TEXT NOT NULL DEFAULT '',
      smtp_port INTEGER NOT NULL DEFAULT 587,
      smtp_secure INTEGER NOT NULL DEFAULT 0,
      smtp_user TEXT NOT NULL DEFAULT '',
      smtp_pass TEXT NOT NULL DEFAULT '',
      from_name TEXT DEFAULT 'X Bilsenter AS',
      aktiv INTEGER NOT NULL DEFAULT 1,
      standard INTEGER NOT NULL DEFAULT 0,
      last_sync TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  seedMailKontoFromEnv();
  migrateMailKontoSignatur();
}

function migrateMailKontoSignatur() {
  const cols = db.prepare('PRAGMA table_info(mail_kontoer)').all().map(function (c) { return c.name; });
  if (!cols.includes('signatur')) {
    db.exec("ALTER TABLE mail_kontoer ADD COLUMN signatur TEXT DEFAULT ''");
  }
}

function normalizeSmtpPortForStorage(port) {
  const value = Number(port || 587);
  if (value === 463) return 465;
  return value;
}

function migrateSmtpPortFix() {
  db.prepare('UPDATE mail_kontoer SET smtp_port = 465 WHERE smtp_port = 463').run();
}

function seedMailKontoFromEnv() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM mail_kontoer').get().c;
  if (count > 0) return;
  if (!process.env.IMAP_HOST && !process.env.SMTP_HOST && !process.env.IMAP_USER) return;

  db.prepare(`
    INSERT INTO mail_kontoer (
      navn, epost, imap_host, imap_port, imap_secure, imap_user, imap_pass,
      smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass, from_name, aktiv, standard
    ) VALUES (
      @navn, @epost, @imap_host, @imap_port, @imap_secure, @imap_user, @imap_pass,
      @smtp_host, @smtp_port, @smtp_secure, @smtp_user, @smtp_pass, @from_name, 1, 1
    )
  `).run({
    navn: 'Hovedkonto',
    epost: process.env.MAIL_FROM || process.env.IMAP_USER || process.env.SMTP_USER || '',
    imap_host: process.env.IMAP_HOST || '',
    imap_port: Number(process.env.IMAP_PORT || 993),
    imap_secure: process.env.IMAP_SECURE !== 'false' ? 1 : 0,
    imap_user: process.env.IMAP_USER || '',
    imap_pass: process.env.IMAP_PASS || '',
    smtp_host: process.env.SMTP_HOST || '',
    smtp_port: Number(process.env.SMTP_PORT || 587),
    smtp_secure: process.env.SMTP_SECURE === 'true' ? 1 : 0,
    smtp_user: process.env.SMTP_USER || '',
    smtp_pass: process.env.SMTP_PASS || '',
    from_name: process.env.MAIL_FROM_NAME || 'X Bilsenter AS'
  });
}

const PASS_MASK = '••••••••';

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

function getMailKontoer(includeSecrets) {
  return db.prepare('SELECT * FROM mail_kontoer ORDER BY standard DESC, navn ASC')
    .all()
    .map(function (row) { return mapMailKonto(row, includeSecrets); });
}

function getMailKontoById(id, includeSecrets) {
  const row = db.prepare('SELECT * FROM mail_kontoer WHERE id = ?').get(id);
  return mapMailKonto(row, includeSecrets);
}

function getDefaultMailKonto(includeSecrets) {
  let row = db.prepare('SELECT * FROM mail_kontoer WHERE aktiv = 1 AND standard = 1 LIMIT 1').get();
  if (!row) row = db.prepare('SELECT * FROM mail_kontoer WHERE aktiv = 1 ORDER BY id ASC LIMIT 1').get();
  return mapMailKonto(row, includeSecrets);
}

function createMailKonto(data) {
  const aktiv = data.aktiv !== false ? 1 : 0;
  const standard = data.standard ? 1 : 0;
  if (standard) {
    db.prepare('UPDATE mail_kontoer SET standard = 0').run();
  }

  const info = db.prepare(`
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

function updateMailKonto(id, data) {
  const existing = db.prepare('SELECT * FROM mail_kontoer WHERE id = ?').get(id);
  if (!existing) return null;

  if (data.standard) {
    db.prepare('UPDATE mail_kontoer SET standard = 0').run();
  }

  const imapPass = data.imapPass != null && data.imapPass !== PASS_MASK && data.imapPass !== ''
    ? data.imapPass
    : existing.imap_pass;
  const smtpPass = data.smtpPass != null && data.smtpPass !== PASS_MASK && data.smtpPass !== ''
    ? data.smtpPass
    : existing.smtp_pass;

  db.prepare(`
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

function cleanupOrphanEposter() {
  const kontoCount = db.prepare('SELECT COUNT(*) AS c FROM mail_kontoer').get().c;
  if (kontoCount === 0) {
    return db.prepare('DELETE FROM eposter').run().changes;
  }
  return db.prepare(`
    DELETE FROM eposter
    WHERE konto_id IS NULL
       OR konto_id NOT IN (SELECT id FROM mail_kontoer)
  `).run().changes;
}

function countUlestEpost() {
  return db.prepare(`
    SELECT COUNT(*) AS c
    FROM eposter e
    INNER JOIN mail_kontoer k ON k.id = e.konto_id
    WHERE e.retning = 'inn' AND e.lest = 0
  `).get().c;
}

function deleteMailKonto(id) {
  const row = db.prepare('SELECT id FROM mail_kontoer WHERE id = ?').get(id);
  if (!row) return false;
  db.prepare('DELETE FROM eposter WHERE konto_id = ?').run(id);
  db.prepare('DELETE FROM mail_kontoer WHERE id = ?').run(id);
  cleanupOrphanEposter();
  return true;
}

function setMailKontoLastSync(id, iso) {
  db.prepare('UPDATE mail_kontoer SET last_sync = @last_sync, updated_at = datetime(\'now\') WHERE id = @id')
    .run({ id, last_sync: iso });
}

const DEFAULT_INNSTILLINGER = {
  ansatte: ['Waleed', 'Ahmed', 'Sara', 'Mikael', 'Lena'],
  merker: MERKER,
  bilStatuser: [
    'Innkjøpt', 'Transport', 'Klargjøring', 'Lakkering',
    'Fotografering', 'Verksted', 'Tilstandsrapport',
    'Annonsert', 'Reservert', 'Utlevering', 'Solgt', 'Etteroppfølging'
  ],
  henvStatuser: ['Ny', 'Tildelt', 'Besvart', 'Venter på kunde', 'Avsluttet'],
  innbytteStatuser: ['Ny', 'Under vurdering', 'Tilbud sendt', 'Akseptert', 'Avslått'],
  kalTyper: [
    'Visning', 'Prøvekjøring', 'Utlevering', 'Verksted',
    'Fotografering', 'Klargjøring', 'Internt', 'Annet'
  ],
  modulOppsett: [
    { id: 'dashboard', label: 'Oversikt' },
    { id: 'biler', label: 'Biler' },
    { id: 'henvendelser', label: 'Henvendelser' },
    { id: 'innboks', label: 'Innboks' },
    { id: 'innbytte', label: 'Innbytte' },
    { id: 'selgbil', label: 'Selg bil' },
    { id: 'kalender', label: 'Kalender' },
    { id: 'oppgaver', label: 'Oppgaver' },
    { id: 'vegvesen', label: 'Vegvesen-oppslag' },
    { id: 'innstillinger', label: 'Innstillinger' }
  ]
};

const SETTINGS_KEYS = {
  ansatte: 'ansatte',
  merker: 'merker',
  bilStatuser: 'bil_statuser',
  henvStatuser: 'henv_statuser',
  innbytteStatuser: 'innbytte_statuser',
  kalTyper: 'kal_typer'
};

function seedInnstillinger() {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO innstillinger (key, value)
    VALUES (@key, @value)
  `);

  Object.entries(SETTINGS_KEYS).forEach(function ([prop, key]) {
    insert.run({
      key,
      value: JSON.stringify(DEFAULT_INNSTILLINGER[prop] || [])
    });
  });
}

function getInnstillinger() {
  const rows = db.prepare('SELECT key, value FROM innstillinger').all();
  const byKey = {};
  rows.forEach(function (row) { byKey[row.key] = row.value; });

  return {
    ansatte: parseJson(byKey.ansatte, DEFAULT_INNSTILLINGER.ansatte),
    merker: normalizeMerkerList(parseJson(byKey.merker, null), DEFAULT_INNSTILLINGER.merker),
    bilStatuser: parseJson(byKey.bil_statuser, DEFAULT_INNSTILLINGER.bilStatuser),
    henvStatuser: parseJson(byKey.henv_statuser, DEFAULT_INNSTILLINGER.henvStatuser),
    innbytteStatuser: parseJson(byKey.innbytte_statuser, DEFAULT_INNSTILLINGER.innbytteStatuser),
    kalTyper: parseJson(byKey.kal_typer, DEFAULT_INNSTILLINGER.kalTyper),
    modulOppsett: normalizeModulOppsett(parseJson(byKey.modul_oppsett, DEFAULT_INNSTILLINGER.modulOppsett))
  };
}

function saveInnstillinger(partial) {
  const update = db.prepare(`
    UPDATE innstillinger
    SET value = @value, updated_at = datetime('now')
    WHERE key = @key
  `);

  Object.entries(SETTINGS_KEYS).forEach(function ([prop, key]) {
    if (!Array.isArray(partial[prop])) return;
    const cleaned = partial[prop]
      .map(function (item) { return String(item || '').trim(); })
      .filter(Boolean);
    if (!cleaned.length) return;
    update.run({ key, value: JSON.stringify(cleaned) });
  });

  if (Array.isArray(partial.modulOppsett)) {
    update.run({
      key: 'modul_oppsett',
      value: JSON.stringify(normalizeModulOppsett(partial.modulOppsett))
    });
  }

  return getInnstillinger();
}

function seedIfEmpty() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM biler').get().c;
  if (count > 0) return;

  const insertBil = db.prepare(`
    INSERT INTO biler (reg, merke, modell, aar, km, innkjop, salg, farge, status, ansvarlig, frist, notater, eu_kontroll, forsikring, sjekkliste, logg)
    VALUES (@reg, @merke, @modell, @aar, @km, @innkjop, @salg, @farge, @status, @ansvarlig, @frist, @notater, @eu_kontroll, @forsikring, @sjekkliste, @logg)
  `);

  const demoBiler = [
    {
      reg: 'AB12345', merke: 'BMW', modell: '520d', aar: 2021, km: 62000,
      innkjop: 350000, salg: 429000, farge: 'Sort', status: 'Annonsert', ansvarlig: 'Waleed',
      frist: '2026-06-10', notater: 'God stand, nylig service.',
      eu_kontroll: '2027-03-15', forsikring: 'If Skadeforsikring',
      sjekkliste: JSON.stringify([
        { t: 'Vasket innvendig', f: true }, { t: 'Polert', f: true },
        { t: 'Fotografert', f: true }, { t: 'FINN-annonse', f: true },
        { t: 'Tilstandsrapport', f: false }
      ]),
      logg: JSON.stringify([{ tekst: 'Mottatt fra forhandler i Oslo', dato: '2026-05-20 09:00', av: 'Waleed' }])
    },
    {
      reg: 'CD67890', merke: 'Audi', modell: 'A4 2.0 TDI', aar: 2020, km: 88000,
      innkjop: 290000, salg: 369000, farge: 'Hvit', status: 'Klargjøring', ansvarlig: 'Ahmed',
      frist: '2026-06-05', notater: 'Trenger polish og dekkskift',
      eu_kontroll: '2026-11-20', forsikring: 'Gjensidige',
      sjekkliste: JSON.stringify([
        { t: 'Vasket', f: true }, { t: 'Polert', f: false }, { t: 'Fotografert', f: false }
      ]),
      logg: JSON.stringify([{ tekst: 'Mottatt fra privat selger', dato: '2026-05-28 11:00', av: 'Ahmed' }])
    }
  ];

  demoBiler.forEach(function (b) { insertBil.run(b); });
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('nb-NO', {
    timeZone: 'Europe/Oslo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  }).replace(',', '');
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
    kommentarer: parseJson(row.kommentarer, []),
    dato: formatDate(row.created_at),
    kilde: row.kilde,
    bilRef: row.bil_ref
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
    kommentarer: parseJson(row.kommentarer, []),
    utstyr: parseJson(row.utstyr, []),
    bilder: parseJson(row.bilder, []),
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
    kommentarer: parseJson(row.kommentarer, []),
    utstyr: parseJson(row.utstyr, []),
    bilder: parseJson(row.bilder, []),
    kundeId: row.kunde_id || null,
    raw: row
  };
}

function mapBil(row) {
  return {
    id: row.id,
    reg: row.reg,
    merke: row.merke,
    modell: row.modell,
    aar: row.aar,
    km: row.km,
    innkjop: row.innkjop,
    salg: row.salg,
    farge: formatSvvFargeNavn(row.farge) || '',
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
    kommentarer: parseJson(row.kommentarer, []),
    dokumenter: parseJson(row.dokumenter, []),
    okonomi: parseJson(row.okonomi, {}),
    tilstandsrapport: normalizeBilTilstandsrapport(parseJson(row.tilstandsrapport, null)),
    arsprovekjennemerke: normalizeBilArsprovekjennemerke(parseJson(row.arsprovekjennemerke, null)),
    sjekkliste: parseJson(row.sjekkliste, []),
    sjekklister: parseJson(row.sjekklister, {}),
    logg: parseJson(row.logg, []),
    svvData: normalizeSvvDataFarge(parseJson(row.svv_data, null)),
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
    notat: row.notat
  };
}

function mapEpost(row) {
  const sortDato = row.mottatt_dato || row.created_at || '';
  return {
    id: row.id,
    kontoId: row.konto_id || null,
    kontoNavn: row.konto_navn || '',
    kontoEpost: row.konto_epost || '',
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
    henvendelseId: row.henvendelse_id,
    sortDato,
    dato: formatDate(sortDato)
  };
}

const PERMISSION_DEFS = [
  { id: 'dashboard', label: 'Oversikt' },
  { id: 'biler', label: 'Biler' },
  { id: 'kunder', label: 'Kunder' },
  { id: 'henvendelser', label: 'Henvendelser' },
  { id: 'innboks', label: 'Innboks' },
  { id: 'innbytte', label: 'Innbytte' },
  { id: 'selgbil', label: 'Selg bil' },
  { id: 'kalender', label: 'Kalender' },
  { id: 'innkjopskalkyle', label: 'Innkjøpskalkyle' },
  { id: 'oppgaver', label: 'Oppgaver' },
  { id: 'vegvesen', label: 'Vegvesen-oppslag' },
  { id: 'innstillinger', label: 'Innstillinger' },
  { id: 'brukere', label: 'Brukerstyring' }
];

const ALL_PERMISSION_IDS = PERMISSION_DEFS.map(function (p) { return p.id; });

const ROLE_TEMPLATES = {
  'Daglig leder': ALL_PERMISSION_IDS,
  Innkjøpssjef: ['dashboard', 'biler', 'kunder', 'henvendelser', 'innbytte', 'selgbil', 'innkjopskalkyle', 'kalender', 'vegvesen'],
  Selger: ['dashboard', 'biler', 'kunder', 'henvendelser', 'innboks', 'innbytte', 'selgbil', 'kalender', 'vegvesen'],
  Klargjører: ['dashboard', 'biler', 'oppgaver', 'vegvesen'],
  Verksted: ['dashboard', 'biler', 'oppgaver', 'vegvesen'],
  'Kun leser': ['dashboard', 'biler', 'kunder', 'henvendelser', 'innbytte', 'selgbil', 'kalender']
};

const LEGACY_ROLE_ALIASES = {
  Admin: 'Daglig leder',
  Regnskap: 'Innkjøpssjef'
};

function resolveRoleKey(role) {
  const key = String(role || '').trim();
  return LEGACY_ROLE_ALIASES[key] || key;
}

function resolveRoleTemplate(role) {
  return ROLE_TEMPLATES[resolveRoleKey(role)] || ROLE_TEMPLATES.Selger;
}

function migrateUsers() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT DEFAULT '',
      role TEXT NOT NULL DEFAULT 'Selger',
      permissions TEXT NOT NULL DEFAULT '[]',
      aktiv INTEGER NOT NULL DEFAULT 1,
      is_admin INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const count = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  const adminCount = countAdminUsers();
  if (count > 0 && adminCount > 0) return;
  if (count === 0 || adminCount === 0) seedDefaultAdminUser();
}

function seedDefaultAdminUser() {
  const bcrypt = require('bcryptjs');
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'admin123';
  db.prepare(`
    INSERT INTO users (username, password_hash, name, email, role, permissions, aktiv, is_admin)
    VALUES (@username, @password_hash, @name, @email, @role, @permissions, 1, 1)
  `).run({
    username,
    password_hash: bcrypt.hashSync(password, 10),
    name: 'Administrator',
    email: '',
    role: 'Daglig leder',
    permissions: JSON.stringify(ALL_PERMISSION_IDS)
  });
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

function getUserById(id, includeHash) {
  return mapUser(db.prepare('SELECT * FROM users WHERE id = ?').get(Number(id)), includeHash);
}

function getUserByUsername(username, includeHash) {
  const name = String(username || '').trim();
  if (!name) return null;
  return mapUser(
    db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(name),
    includeHash
  );
}

function getUsers() {
  return db.prepare(`
    SELECT id, username, name, email, role, permissions, aktiv, is_admin, created_at, updated_at
    FROM users
    ORDER BY name COLLATE NOCASE ASC, id ASC
  `).all().map(function (row) { return mapUser(row); }).filter(Boolean);
}

function countAdminUsers() {
  return db.prepare('SELECT COUNT(*) AS c FROM users WHERE is_admin = 1 AND aktiv = 1').get().c;
}

function normalizePermissions(list) {
  const allowed = new Set(ALL_PERMISSION_IDS);
  return Array.from(new Set((list || []).filter(function (p) { return allowed.has(p); })));
}

function createUser(data, passwordHash) {
  const username = String(data.username || '').trim();
  const name = String(data.name || '').trim();
  if (!username) throw new Error('Brukernavn er påkrevd.');
  if (!name) throw new Error('Navn er påkrevd.');
  if (!passwordHash) throw new Error('Passord er påkrevd.');
  if (getUserByUsername(username)) throw new Error('Brukernavnet finnes allerede.');

  const role = String(data.role || 'Selger').trim() || 'Selger';
  const permissions = normalizePermissions(
    data.permissions && data.permissions.length
      ? data.permissions
      : resolveRoleTemplate(role)
  );
  const isAdmin = resolveRoleKey(role) === 'Daglig leder' ? true : !!data.isAdmin;

  const info = db.prepare(`
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

function updateUser(id, data, passwordHash) {
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(id));
  if (!existing) return null;

  const username = data.username != null ? String(data.username).trim() : undefined;
  if (username === '') throw new Error('Brukernavn er påkrevd.');
  if (username) {
    const clash = db.prepare(`
      SELECT id FROM users WHERE username = ? COLLATE NOCASE AND id != ?
    `).get(username, Number(id));
    if (clash) throw new Error('Brukernavnet finnes allerede.');
  }

  let permissions = null;
  if (data.permissions != null) {
    permissions = JSON.stringify(normalizePermissions(data.permissions));
  } else if (data.role != null) {
    const role = String(data.role).trim();
    permissions = JSON.stringify(normalizePermissions(resolveRoleTemplate(role) || parseJson(existing.permissions, [])));
  }

  if (data.isAdmin === false && existing.is_admin && countAdminUsers() <= 1) {
    throw new Error('Kan ikke fjerne siste aktive administrator.');
  }
  if (data.aktiv === false && existing.is_admin && countAdminUsers() <= 1) {
    throw new Error('Kan ikke deaktivere siste aktive administrator.');
  }

  let isAdminValue = data.isAdmin == null ? null : (data.isAdmin ? 1 : 0);
  if (data.role != null && resolveRoleKey(String(data.role).trim()) === 'Daglig leder') {
    isAdminValue = 1;
  }

  db.prepare(`
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
    is_admin: isAdminValue
  });

  return getUserById(id);
}

function deleteUser(id, currentUserId) {
  const targetId = Number(id);
  if (targetId === Number(currentUserId)) {
    throw new Error('Du kan ikke slette din egen bruker.');
  }

  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId);
  if (!existing) return false;
  if (existing.is_admin && countAdminUsers() <= 1) {
    throw new Error('Kan ikke slette siste aktive administrator.');
  }

  db.prepare('DELETE FROM users WHERE id = ?').run(targetId);
  return true;
}

function getPermissionDefs() {
  return PERMISSION_DEFS;
}

function getRoleTemplates() {
  return ROLE_TEMPLATES;
}

initDb();

module.exports = {
  db,
  UPLOADS_DIR,
  parseJson,
  mapHenv,
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
  normalizeBilTilstandsrapport,
  DEFAULT_BIL_TILSTANDSRAPPORT,
  normalizeBilArsprovekjennemerke,
  DEFAULT_BIL_ARSPROVEKJENNEMERKE
};
