'use strict';

const dbDriver = require('./database');
const { prepare, exec: execAsync, isPostgres } = dbDriver;

const SPECIAL_USE_MAP = {
  '\\All': 'archive',
  '\\Archive': 'archive',
  '\\Drafts': 'drafts',
  '\\Flagged': 'custom',
  '\\Inbox': 'inbox',
  '\\Junk': 'junk',
  '\\Sent': 'sent',
  '\\Trash': 'trash'
};

const STANDARD_LABELS = {
  inbox: 'Innboks',
  sent: 'Sendt',
  drafts: 'Utkast',
  trash: 'Søppel',
  junk: 'Søppelpost',
  archive: 'Arkiv'
};

const LOCAL_VIRTUAL_FOLDERS = [
  { type: 'sent', navn: 'Sendt', imapPath: '__local__/sent' },
  { type: 'drafts', navn: 'Utkast', imapPath: '__local__/drafts' },
  { type: 'trash', navn: 'Søppel', imapPath: '__local__/trash' }
];

function isLocalVirtualPath(imapPath) {
  return String(imapPath || '').startsWith('__local__/');
}

const PATH_TYPE_PATTERNS = [
  { type: 'sent', re: /(^|[/.])(sent|sendt|sendte|utboks|sent items|sent mail|sent messages|elements envoy[eé]s|g[ée]sendt[e]?|g[ée]sendte elemente)($|[/.])/i },
  { type: 'drafts', re: /(^|[/.])(drafts|draft|kladder|utkast|brouillons|entw[üu]rfe)($|[/.])/i },
  { type: 'trash', re: /(^|[/.])(trash|deleted|bin|s[øo]ppel|papirkurv|papierkorb|deleted items|deleted messages)($|[/.])/i },
  { type: 'junk', re: /(^|[/.])(junk|spam|s[øo]ppelpost|bulk mail|bulk|u[øo]nsket)($|[/.])/i },
  { type: 'archive', re: /(^|[/.])(archive|arkiv)($|[/.])/i }
];

function displayNameFromPath(path) {
  const parts = String(path || '').split(/[./]/);
  return parts[parts.length - 1] || path;
}

function normalizeFolderToken(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\u200e/g, '')
    .replace(/[_-]+/g, ' ')
    .trim();
}

function mapSpecialUseFlag(flag) {
  return SPECIAL_USE_MAP[String(flag || '').trim()] || null;
}

function specialUseFromMailbox(mailbox) {
  const raw = mailbox?.specialUse;
  if (!raw) return null;
  if (typeof raw === 'string') return mapSpecialUseFlag(raw);
  if (typeof raw.forEach === 'function') {
    let found = null;
    raw.forEach(function (flag) {
      if (!found) found = mapSpecialUseFlag(flag);
    });
    return found;
  }
  return mapSpecialUseFlag(String(raw));
}

function detectMappeType(mailbox) {
  const path = String(mailbox.path || '').trim();
  const name = String(mailbox.name || displayNameFromPath(path)).trim();
  const pathNorm = normalizeFolderToken(path);
  const nameNorm = normalizeFolderToken(name);

  const fromSpecialUse = specialUseFromMailbox(mailbox);
  if (fromSpecialUse) return fromSpecialUse;

  if (mailbox.flags && typeof mailbox.flags.forEach === 'function') {
    let fromFlags = null;
    mailbox.flags.forEach(function (flag) {
      if (!fromFlags) fromFlags = mapSpecialUseFlag(flag);
    });
    if (fromFlags) return fromFlags;
  }

  if (pathNorm === 'inbox' || nameNorm === 'inbox' || nameNorm === 'innboks') {
    return 'inbox';
  }

  const haystack = `${path} ${name}`.replace(/[_-]+/g, ' ');
  for (const pattern of PATH_TYPE_PATTERNS) {
    if (pattern.re.test(haystack)) return pattern.type;
  }

  for (const pattern of PATH_TYPE_PATTERNS) {
    if (pattern.re.test(nameNorm) || pattern.re.test(pathNorm)) return pattern.type;
  }

  return 'custom';
}

function displayNavnForMappe(mappeType, rawName) {
  if (mappeType && mappeType !== 'custom' && STANDARD_LABELS[mappeType]) {
    return STANDARD_LABELS[mappeType];
  }
  return String(rawName || '').trim() || 'Mappe';
}

function isSelectableMailbox(box) {
  if (!box || !box.flags || typeof box.flags.has !== 'function') return true;
  if (box.flags.has('\\Noselect')) return false;
  if (box.flags.has('\\NonExistent')) return false;
  return true;
}

function mapMailMappe(row) {
  if (!row) return null;
  return {
    id: row.id,
    kontoId: row.konto_id,
    imapPath: row.imap_path,
    navn: row.navn,
    mappeType: row.mappe_type || 'custom',
    parentId: row.parent_id || null,
    syncEnabled: row.sync_enabled !== 0 && row.sync_enabled !== false,
    unreadCount: Number(row.unread_count || 0),
    totalCount: Number(row.total_count || 0),
    updatedAt: row.updated_at || null
  };
}

function mapEpostVedlegg(row) {
  if (!row) return null;
  return {
    id: row.id,
    epostId: row.epost_id,
    filnavn: row.filnavn,
    contentType: row.content_type || 'application/octet-stream',
    sizeBytes: Number(row.size_bytes || 0),
    path: row.lagring_path,
    contentId: row.content_id || ''
  };
}

async function ensureMailFoldersSchema() {
  if (isPostgres) {
    await execAsync(`
      CREATE TABLE IF NOT EXISTS public.mail_mapper (
        id BIGSERIAL PRIMARY KEY,
        konto_id BIGINT NOT NULL REFERENCES public.mail_kontoer(id) ON DELETE CASCADE,
        imap_path TEXT NOT NULL,
        navn TEXT NOT NULL,
        mappe_type TEXT NOT NULL DEFAULT 'custom',
        parent_id BIGINT REFERENCES public.mail_mapper(id) ON DELETE SET NULL,
        sync_enabled BOOLEAN NOT NULL DEFAULT TRUE,
        unread_count INTEGER NOT NULL DEFAULT 0,
        total_count INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (konto_id, imap_path)
      );
      CREATE INDEX IF NOT EXISTS idx_mail_mapper_konto ON public.mail_mapper (konto_id);
      CREATE TABLE IF NOT EXISTS public.epost_vedlegg (
        id BIGSERIAL PRIMARY KEY,
        epost_id BIGINT NOT NULL REFERENCES public.eposter(id) ON DELETE CASCADE,
        filnavn TEXT NOT NULL,
        content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
        size_bytes BIGINT NOT NULL DEFAULT 0,
        lagring_path TEXT NOT NULL,
        content_id TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_epost_vedlegg_epost ON public.epost_vedlegg (epost_id);
      ALTER TABLE public.eposter ADD COLUMN IF NOT EXISTS mappe_id BIGINT REFERENCES public.mail_mapper(id) ON DELETE SET NULL;
      ALTER TABLE public.eposter ADD COLUMN IF NOT EXISTS imap_uid BIGINT;
      ALTER TABLE public.eposter ADD COLUMN IF NOT EXISTS flagged BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE public.eposter ADD COLUMN IF NOT EXISTS slettet BOOLEAN NOT NULL DEFAULT FALSE;
      CREATE INDEX IF NOT EXISTS idx_eposter_mappe ON public.eposter (mappe_id, mottatt_dato DESC);
      CREATE INDEX IF NOT EXISTS idx_eposter_thread ON public.eposter (konto_id, thread_id);
      CREATE INDEX IF NOT EXISTS idx_eposter_inn_ulest_dashboard
        ON public.eposter (mottatt_dato DESC, id DESC)
        WHERE retning = 'inn' AND lest = false AND slettet = false;
    `);
    return;
  }

  await execAsync(`
    CREATE TABLE IF NOT EXISTS mail_mapper (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      konto_id INTEGER NOT NULL REFERENCES mail_kontoer(id) ON DELETE CASCADE,
      imap_path TEXT NOT NULL,
      navn TEXT NOT NULL,
      mappe_type TEXT NOT NULL DEFAULT 'custom',
      parent_id INTEGER REFERENCES mail_mapper(id) ON DELETE SET NULL,
      sync_enabled INTEGER NOT NULL DEFAULT 1,
      unread_count INTEGER NOT NULL DEFAULT 0,
      total_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (konto_id, imap_path)
    );
    CREATE TABLE IF NOT EXISTS epost_vedlegg (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      epost_id INTEGER NOT NULL REFERENCES eposter(id) ON DELETE CASCADE,
      filnavn TEXT NOT NULL,
      content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
      size_bytes INTEGER NOT NULL DEFAULT 0,
      lagring_path TEXT NOT NULL,
      content_id TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const cols = (await prepare('PRAGMA table_info(eposter)').all()).map(function (c) { return c.name; });
  const addCol = async function (name, ddl) {
    if (!cols.includes(name)) await execAsync(ddl);
  };
  await addCol('mappe_id', 'ALTER TABLE eposter ADD COLUMN mappe_id INTEGER REFERENCES mail_mapper(id) ON DELETE SET NULL');
  await addCol('imap_uid', 'ALTER TABLE eposter ADD COLUMN imap_uid INTEGER');
  await addCol('flagged', 'ALTER TABLE eposter ADD COLUMN flagged INTEGER NOT NULL DEFAULT 0');
  await addCol('slettet', 'ALTER TABLE eposter ADD COLUMN slettet INTEGER NOT NULL DEFAULT 0');
  if (!cols.includes('kunde_id')) await addCol('kunde_id', 'ALTER TABLE eposter ADD COLUMN kunde_id INTEGER');
  if (!cols.includes('status')) await addCol('status', "ALTER TABLE eposter ADD COLUMN status TEXT NOT NULL DEFAULT ''");
  if (!cols.includes('ansvarlig')) await addCol('ansvarlig', "ALTER TABLE eposter ADD COLUMN ansvarlig TEXT NOT NULL DEFAULT ''");
}

async function getMailMapperForKonto(kontoId) {
  const rows = await prepare(`
    SELECT * FROM mail_mapper
    WHERE konto_id = ?
    ORDER BY
      CASE mappe_type
        WHEN 'inbox' THEN 1
        WHEN 'sent' THEN 2
        WHEN 'drafts' THEN 3
        WHEN 'archive' THEN 4
        WHEN 'junk' THEN 5
        WHEN 'trash' THEN 6
        ELSE 7
      END,
      LOWER(navn)
  `).all(Number(kontoId));
  return rows.map(mapMailMappe).filter(Boolean);
}

async function getMailMappeById(id) {
  return mapMailMappe(await prepare('SELECT * FROM mail_mapper WHERE id = ?').get(Number(id)));
}

async function getMailMappeByPath(kontoId, imapPath) {
  return mapMailMappe(await prepare(`
    SELECT * FROM mail_mapper WHERE konto_id = ? AND imap_path = ?
  `).get(Number(kontoId), String(imapPath)));
}

async function upsertMailMappe(data) {
  const existing = await getMailMappeByPath(data.kontoId, data.imapPath);
  const detectedType = data.mappeType || 'custom';
  const existingType = existing?.mappeType || 'custom';
  const nextType = detectedType !== 'custom'
    ? detectedType
    : (existingType !== 'custom' ? existingType : 'custom');
  const nextNavn = displayNavnForMappe(nextType, data.navn);

  if (existing) {
    await prepare(`
      UPDATE mail_mapper SET
        navn = @navn,
        mappe_type = @mappe_type,
        sync_enabled = @sync_enabled,
        updated_at = datetime('now')
      WHERE id = @id
    `).run({
      id: existing.id,
      navn: nextNavn,
      mappe_type: nextType,
      sync_enabled: data.syncEnabled === false ? 0 : 1
    });
    return getMailMappeById(existing.id);
  }

  const info = await prepare(`
    INSERT INTO mail_mapper (
      konto_id, imap_path, navn, mappe_type, parent_id, sync_enabled, created_at, updated_at
    ) VALUES (
      @konto_id, @imap_path, @navn, @mappe_type, @parent_id, @sync_enabled, datetime('now'), datetime('now')
    )
  `).run({
    konto_id: data.kontoId,
    imap_path: data.imapPath,
    navn: nextNavn,
    mappe_type: nextType,
    parent_id: data.parentId || null,
    sync_enabled: data.syncEnabled === false ? 0 : 1
  });

  return getMailMappeById(info.lastInsertRowid);
}

async function applyImapStatusToMappe(mappeId, status) {
  if (!mappeId || !status) return;
  await prepare(`
    UPDATE mail_mapper SET
      total_count = @total_count,
      unread_count = @unread_count,
      updated_at = datetime('now')
    WHERE id = @id
  `).run({
    id: Number(mappeId),
    total_count: Number(status.messages || 0),
    unread_count: Number(status.unseen || 0)
  });
}

async function createMailMappeRecord(kontoId, navn, imapPath, mappeType) {
  return upsertMailMappe({
    kontoId,
    imapPath,
    navn,
    mappeType: mappeType || 'custom',
    syncEnabled: true
  });
}

async function ensureStandardVirtualFolders(kontoId, discoveredTypes) {
  const types = discoveredTypes || new Set();
  for (const folder of LOCAL_VIRTUAL_FOLDERS) {
    if (types.has(folder.type)) continue;
    const existing = await prepare(`
      SELECT id FROM mail_mapper WHERE konto_id = ? AND mappe_type = ?
    `).get(Number(kontoId), folder.type);
    if (existing) continue;
    await upsertMailMappe({
      kontoId,
      imapPath: folder.imapPath,
      navn: folder.navn,
      mappeType: folder.type,
      syncEnabled: false
    });
  }
}

async function updateMappeCounts(mappeId) {
  const mappe = await getMailMappeById(mappeId);
  if (!mappe) return;

  let stats;
  if (mappe.mappeType === 'inbox') {
    stats = await prepare(`
      SELECT
        COUNT(*) AS total_count,
        SUM(CASE WHEN lest = 0 THEN 1 ELSE 0 END) AS unread_count
      FROM eposter
      WHERE konto_id = ? AND slettet = 0 AND retning = 'inn'
    `).get(Number(mappe.kontoId));
  } else if (mappe.mappeType === 'sent') {
    stats = await prepare(`
      SELECT COUNT(*) AS total_count, 0 AS unread_count
      FROM eposter
      WHERE konto_id = ? AND slettet = 0 AND retning = 'ut'
    `).get(Number(mappe.kontoId));
  } else {
    stats = await prepare(`
      SELECT
        COUNT(*) AS total_count,
        SUM(CASE WHEN retning = 'inn' AND lest = 0 AND slettet = 0 THEN 1 ELSE 0 END) AS unread_count
      FROM eposter
      WHERE mappe_id = ? AND slettet = 0
    `).get(Number(mappeId));
  }

  await prepare(`
    UPDATE mail_mapper SET
      total_count = @total_count,
      unread_count = @unread_count,
      updated_at = datetime('now')
    WHERE id = @id
  `).run({
    id: Number(mappeId),
    total_count: Number(stats?.total_count || 0),
    unread_count: Number(stats?.unread_count || 0)
  });
}

async function updateAllMappeCountsForKonto(kontoId) {
  await ensureStandardVirtualFolders(kontoId);
  const mapper = await getMailMapperForKonto(kontoId);
  for (const mappe of mapper) {
    await updateMappeCounts(mappe.id);
  }
}

async function getEpostVedlegg(epostId) {
  const rows = await prepare(`
    SELECT * FROM epost_vedlegg WHERE epost_id = ? ORDER BY id ASC
  `).all(Number(epostId));
  return rows.map(mapEpostVedlegg).filter(Boolean);
}

async function saveEpostVedlegg(epostId, data) {
  const info = await prepare(`
    INSERT INTO epost_vedlegg (
      epost_id, filnavn, content_type, size_bytes, lagring_path, content_id, created_at
    ) VALUES (
      @epost_id, @filnavn, @content_type, @size_bytes, @lagring_path, @content_id, datetime('now')
    )
  `).run({
    epost_id: Number(epostId),
    filnavn: data.filnavn,
    content_type: data.contentType || 'application/octet-stream',
    size_bytes: Number(data.sizeBytes || 0),
    lagring_path: data.lagringPath,
    content_id: data.contentId || ''
  });
  return mapEpostVedlegg(await prepare('SELECT * FROM epost_vedlegg WHERE id = ?').get(info.lastInsertRowid));
}

async function deleteEpostVedleggForEpost(epostId) {
  await prepare('DELETE FROM epost_vedlegg WHERE epost_id = ?').run(Number(epostId));
}

async function getEpostVedleggById(id) {
  return mapEpostVedlegg(await prepare('SELECT * FROM epost_vedlegg WHERE id = ?').get(Number(id)));
}

function retningFromMappeType(mappeType) {
  if (mappeType === 'sent' || mappeType === 'drafts') return 'ut';
  return 'inn';
}

module.exports = {
  SPECIAL_USE_MAP,
  STANDARD_LABELS,
  LOCAL_VIRTUAL_FOLDERS,
  detectMappeType,
  displayNavnForMappe,
  isSelectableMailbox,
  isLocalVirtualPath,
  ensureMailFoldersSchema,
  ensureStandardVirtualFolders,
  getMailMapperForKonto,
  getMailMappeById,
  getMailMappeByPath,
  upsertMailMappe,
  applyImapStatusToMappe,
  createMailMappeRecord,
  updateMappeCounts,
  updateAllMappeCountsForKonto,
  getEpostVedlegg,
  saveEpostVedlegg,
  deleteEpostVedleggForEpost,
  getEpostVedleggById,
  mapMailMappe,
  mapEpostVedlegg,
  retningFromMappeType
};
