'use strict';

const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const { prepare, isPostgres } = require('./db');
const {
  detectMappeType,
  displayNavnForMappe,
  isSelectableMailbox,
  upsertMailMappe,
  getMailMapperForKonto,
  getMailMappeByPath,
  updateAllMappeCountsForKonto,
  applyImapStatusToMappe,
  saveEpostVedlegg,
  getEpostVedlegg,
  retningFromMappeType,
  ensureStandardVirtualFolders
} = require('./mail-folders');
const { saveBuffer, makeFilename } = require('./storage');
const { accountImapReady } = require('./mail-utils');

const MAX_ATTACHMENT_BYTES = Number(process.env.MAIL_MAX_ATTACHMENT_BYTES || 8 * 1024 * 1024);
const MAX_ATTACHMENTS_PER_MAIL = Number(process.env.MAIL_MAX_ATTACHMENTS || 15);
const SYNC_DAYS = Number(process.env.MAIL_SYNC_DAYS || 90);
const SYNC_MAX_PER_FOLDER = Number(process.env.MAIL_SYNC_MAX_PER_FOLDER || 200);
const FOLDER_DISCOVERY_TTL_MS = Number(process.env.MAIL_FOLDER_DISCOVERY_TTL_MS || 900000);

let backgroundTimer = null;
let backgroundRunning = false;

function createImapClient(konto) {
  return new ImapFlow({
    host: konto.imapHost,
    port: Number(konto.imapPort || 993),
    secure: konto.imapSecure !== false,
    auth: {
      user: konto.imapUser,
      pass: konto.imapPass
    },
    logger: false
  });
}

function normalizeMessageId(value) {
  return String(value || '').trim().replace(/^<|>$/g, '');
}

function displayNameFromPath(path) {
  return displayNavnForMappe('custom', String(path || '').split(/[./]/).pop() || path);
}

async function listAllMailboxes(client) {
  try {
    return await client.list({
      statusQuery: { messages: true, unseen: true }
    });
  } catch (err) {
    console.warn('[mail-sync] LIST+STATUS feilet, prøver enkel LIST:', err.message);
    return await client.list();
  }
}

async function discoverFolders(client, kontoId) {
  const listed = await listAllMailboxes(client);
  const mapper = [];
  const seenPaths = new Set();

  for (const box of listed) {
    if (!isSelectableMailbox(box)) continue;
    const imapPath = String(box.path || '').trim();
    if (!imapPath || seenPaths.has(imapPath.toLowerCase())) continue;
    seenPaths.add(imapPath.toLowerCase());

    const mappeType = detectMappeType(box);
    const navn = displayNavnForMappe(mappeType, box.name || imapPath);
    const saved = await upsertMailMappe({
      kontoId,
      imapPath,
      navn,
      mappeType,
      syncEnabled: true
    });
    if (saved) {
      if (box.status) await applyImapStatusToMappe(saved.id, box.status);
      mapper.push(saved);
    }
  }

  const hasInbox = mapper.some(function (m) { return m.mappeType === 'inbox'; });
  if (!hasInbox) {
    const saved = await upsertMailMappe({
      kontoId,
      imapPath: 'INBOX',
      navn: 'Innboks',
      mappeType: 'inbox',
      syncEnabled: true
    });
    if (saved) mapper.unshift(saved);
  }

  await ensureStandardVirtualFolders(kontoId, new Set(mapper.map(function (m) { return m.mappeType; })));
  return getMailMapperForKonto(kontoId);
}

async function saveParsedAttachments(epostId, parsed) {
  const existing = await getEpostVedlegg(epostId);
  if (existing.length >= MAX_ATTACHMENTS_PER_MAIL) return;

  const attachments = Array.isArray(parsed.attachments) ? parsed.attachments : [];
  let saved = existing.length;

  for (const att of attachments) {
    if (saved >= MAX_ATTACHMENTS_PER_MAIL) break;
    const content = att.content;
    if (!content || !Buffer.isBuffer(content)) continue;
    if (content.length > MAX_ATTACHMENT_BYTES) continue;

    const filnavn = String(att.filename || att.cid || 'vedlegg').trim() || 'vedlegg';
    const duplicate = existing.some(function (item) {
      return item.filnavn === filnavn && item.sizeBytes === content.length;
    });
    if (duplicate) continue;

    const filename = makeFilename(filnavn);
    const lagringPath = await saveBuffer(filename, content, att.contentType);
    await saveEpostVedlegg(epostId, {
      filnavn,
      contentType: att.contentType || 'application/octet-stream',
      sizeBytes: content.length,
      lagringPath,
      contentId: String(att.cid || '')
    });
    saved += 1;
  }
}

async function upsertSyncedMessage(konto, mappe, msg, parsed) {
  const messageId = normalizeMessageId(parsed.messageId) || `uid-${konto.id}-${mappe.id}-${msg.uid}@local`;
  const inReplyTo = normalizeMessageId(parsed.inReplyTo);
  const references = String(parsed.references || '').split(/\s+/).map(normalizeMessageId).filter(Boolean);
  const threadId = inReplyTo || references[0] || messageId;
  const from = parsed.from?.value?.[0];
  const to = parsed.to?.value?.[0];
  const seen = msg.flags?.has('\\Seen');
  const flagged = msg.flags?.has('\\Flagged');
  const retning = retningFromMappeType(mappe.mappeType);

  const existing = await prepare(`
    SELECT id FROM eposter WHERE konto_id = ? AND message_id = ?
  `).get(konto.id, messageId);

  if (existing) {
    await prepare(`
      UPDATE eposter SET
        mappe_id = @mappe_id,
        imap_uid = @imap_uid,
        thread_id = @thread_id,
        in_reply_to = @in_reply_to,
        retning = @retning,
        fra_navn = @fra_navn,
        fra_epost = @fra_epost,
        til_epost = @til_epost,
        emne = @emne,
        innhold = @innhold,
        innhold_html = @innhold_html,
        lest = @lest,
        flagged = @flagged,
        mottatt_dato = @mottatt_dato,
        slettet = 0
      WHERE id = @id
    `).run({
      id: existing.id,
      mappe_id: mappe.id,
      imap_uid: msg.uid,
      thread_id: threadId,
      in_reply_to: inReplyTo,
      retning,
      fra_navn: from?.name || '',
      fra_epost: from?.address || '',
      til_epost: to?.address || konto.epost || konto.imapUser || '',
      emne: parsed.subject || '(Uten emne)',
      innhold: parsed.text || '',
      innhold_html: parsed.html || '',
      lest: seen ? 1 : 0,
      flagged: flagged ? 1 : 0,
      mottatt_dato: (parsed.date || new Date()).toISOString()
    });
    await saveParsedAttachments(existing.id, parsed);
    return { id: existing.id, created: false };
  }

  const info = await prepare(`
    INSERT INTO eposter (
      konto_id, mappe_id, imap_uid, message_id, thread_id, in_reply_to, retning,
      fra_navn, fra_epost, til_epost, emne, innhold, innhold_html,
      lest, flagged, henvendelse_id, mottatt_dato
    ) VALUES (
      @konto_id, @mappe_id, @imap_uid, @message_id, @thread_id, @in_reply_to, @retning,
      @fra_navn, @fra_epost, @til_epost, @emne, @innhold, @innhold_html,
      @lest, @flagged, NULL, @mottatt_dato
    )
  `).run({
    konto_id: konto.id,
    mappe_id: mappe.id,
    imap_uid: msg.uid,
    message_id: messageId,
    thread_id: threadId,
    in_reply_to: inReplyTo,
    retning,
    fra_navn: from?.name || '',
    fra_epost: from?.address || '',
    til_epost: to?.address || konto.epost || konto.imapUser || '',
    emne: parsed.subject || '(Uten emne)',
    innhold: parsed.text || '',
    innhold_html: parsed.html || '',
    lest: seen ? 1 : 0,
    flagged: flagged ? 1 : 0,
    mottatt_dato: (parsed.date || new Date()).toISOString()
  });

  const rowId = info.lastInsertRowid;
  if (retning === 'inn') {
    const { linkInboundEpostToKunde } = require('./db');
    await linkInboundEpostToKunde(rowId, from?.name || '', from?.address || '');
  }
  await saveParsedAttachments(rowId, parsed);
  return { id: rowId, created: true };
}

async function getSyncedUidMap(kontoId, mappeId) {
  const rows = await prepare(`
    SELECT id, imap_uid, lest, flagged FROM eposter
    WHERE konto_id = ? AND mappe_id = ? AND imap_uid IS NOT NULL AND slettet = 0
  `).all(kontoId, mappeId);

  const map = new Map();
  for (const row of rows) {
    map.set(Number(row.imap_uid), row);
  }
  return map;
}

async function refreshKnownMessageFlags(client, knownUids, uidMap) {
  let updated = 0;

  for await (const msg of client.fetch(knownUids, { flags: true }, { uid: true })) {
    const row = uidMap.get(Number(msg.uid));
    if (!row) continue;

    const lest = msg.flags?.has('\\Seen') ? 1 : 0;
    const flagged = msg.flags?.has('\\Flagged') ? 1 : 0;
    if (Number(row.lest) === lest && Number(row.flagged) === flagged) continue;

    await prepare('UPDATE eposter SET lest = ?, flagged = ? WHERE id = ?').run(lest, flagged, row.id);
    updated += 1;
  }

  return updated;
}

async function syncFolderMessages(client, konto, mappe) {
  if (!mappe.syncEnabled) return { mappeId: mappe.id, imported: 0, updated: 0 };

  let imported = 0;
  let updated = 0;
  const lock = await client.getMailboxLock(mappe.imapPath);

  try {
    const since = new Date();
    since.setDate(since.getDate() - SYNC_DAYS);
    const uids = await client.search({ since }, { uid: true });
    const fetchUids = uids.slice(-SYNC_MAX_PER_FOLDER);

    if (!fetchUids.length) return { mappeId: mappe.id, imported: 0, updated: 0 };

    // Meldinger som allerede er lagret trenger ikke nedlasting og parsing på nytt –
    // kun flagg (lest/flagget) kan ha endret seg på serveren.
    const uidMap = await getSyncedUidMap(konto.id, mappe.id);
    const newUids = [];
    const knownUids = [];
    for (const uid of fetchUids) {
      if (uidMap.has(Number(uid))) knownUids.push(uid);
      else newUids.push(uid);
    }

    if (newUids.length) {
      for await (const msg of client.fetch(newUids, {
        envelope: true,
        source: true,
        flags: true
      }, { uid: true })) {
        const parsed = await simpleParser(msg.source);
        const result = await upsertSyncedMessage(konto, mappe, msg, parsed);
        if (result.created) imported += 1;
        else updated += 1;
      }
    }

    if (knownUids.length) {
      updated += await refreshKnownMessageFlags(client, knownUids, uidMap);
    }
  } finally {
    lock.release();
  }

  return { mappeId: mappe.id, mappeNavn: mappe.navn, imported, updated };
}

const DISCOVERY_KEY_PREFIX = 'mail_folder_discovery_';

async function foldersNeedDiscovery(kontoId, knownFolderCount) {
  if (!knownFolderCount) return true;
  if (FOLDER_DISCOVERY_TTL_MS <= 0) return true;

  const row = await prepare('SELECT value FROM innstillinger WHERE key = ?')
    .get(DISCOVERY_KEY_PREFIX + kontoId);
  const lastRun = Number(row?.value || 0);
  return !lastRun || Date.now() - lastRun > FOLDER_DISCOVERY_TTL_MS;
}

async function markFoldersDiscovered(kontoId) {
  const key = DISCOVERY_KEY_PREFIX + kontoId;
  await prepare('DELETE FROM innstillinger WHERE key = ?').run(key);
  await prepare(`
    INSERT INTO innstillinger (key, value, updated_at)
    VALUES (?, ?, ${isPostgres ? 'NOW()' : "datetime('now')"})
  `).run(key, String(Date.now()));
}

async function syncAccountFull(konto) {
  const client = createImapClient(konto);
  await client.connect();

  try {
    let mapper = await getMailMapperForKonto(konto.id);

    // Mappestrukturen endres sjelden – full LIST + oppdatering av hver mappe
    // koster mange databasekall, så den kjøres bare periodisk.
    if (await foldersNeedDiscovery(konto.id, mapper.length)) {
      await discoverFolders(client, konto.id);
      mapper = await getMailMapperForKonto(konto.id);
      await markFoldersDiscovered(konto.id).catch(function () { /* ikke kritisk */ });
    }

    const results = [];

    for (const mappe of mapper) {
      if (!mappe.syncEnabled) continue;
      try {
        results.push(await syncFolderMessages(client, konto, mappe));
      } catch (err) {
        console.warn(`[mail-sync] Mappe ${mappe.imapPath} feilet:`, err.message, err.responseText || '');
        results.push({ mappeId: mappe.id, mappeNavn: mappe.navn, error: err.message });
      }
    }

    const imported = results.reduce(function (sum, item) { return sum + (item.imported || 0); }, 0);
    const updated = results.reduce(function (sum, item) { return sum + (item.updated || 0); }, 0);

    if (imported || updated) {
      await backfillEpostMappeIds(konto.id);
      await updateAllMappeCountsForKonto(konto.id);
    }

    const { setMailKontoLastSync } = require('./db');
    await setMailKontoLastSync(konto.id, new Date().toISOString());

    return {
      kontoId: konto.id,
      kontoNavn: konto.navn,
      imported,
      updated,
      folders: results
    };
  } finally {
    await client.logout().catch(function () { /* ignore */ });
  }
}

async function syncAllAccounts(kontoId) {
  const { getMailKontoer } = require('./db');
  const accounts = (await getMailKontoer(true)).filter(function (k) {
    if (!k.aktiv || !accountImapReady(k)) return false;
    if (kontoId) return k.id === Number(kontoId);
    return true;
  });

  if (!accounts.length) {
    throw new Error('Ingen aktive mailkontoer med IMAP er konfigurert.');
  }

  // Hver konto har egen IMAP-tilkobling, så de kan synkes parallelt.
  // En konto som feiler skal ikke stoppe de andre.
  const results = await Promise.all(accounts.map(async function (konto) {
    try {
      return await syncAccountFull(konto);
    } catch (err) {
      console.warn(`[mail-sync] Konto ${konto.id} feilet:`, err.message);
      return {
        kontoId: konto.id,
        kontoNavn: konto.navn,
        imported: 0,
        updated: 0,
        error: err.message
      };
    }
  }));

  const imported = results.reduce(function (sum, item) { return sum + (item.imported || 0); }, 0);
  const updated = results.reduce(function (sum, item) { return sum + (item.updated || 0); }, 0);

  const total = (await prepare(`
    SELECT COUNT(*) AS c
    FROM eposter e
    INNER JOIN mail_kontoer k ON k.id = e.konto_id
    WHERE e.slettet = 0
  `).get()).c;

  return { imported, updated, accounts: results, total };
}

async function createImapFolder(konto, folderName, parentPath) {
  if (!accountImapReady(konto)) throw new Error('IMAP er ikke konfigurert.');
  const cleanName = String(folderName || '').trim().replace(/[./\\]/g, '_');
  if (!cleanName) throw new Error('Mappenavn er påkrevd.');

  const imapPath = parentPath ? `${parentPath}.${cleanName}` : cleanName;
  const client = createImapClient(konto);
  await client.connect();
  try {
    await client.mailboxCreate(imapPath);
    const mappe = await upsertMailMappe({
      kontoId: konto.id,
      imapPath,
      navn: cleanName,
      mappeType: 'custom',
      syncEnabled: true
    });
    return mappe;
  } finally {
    await client.logout().catch(function () { /* ignore */ });
  }
}

async function moveMessageOnServer(konto, mappe, epostRow, targetMappe) {
  if (!epostRow.imap_uid || !mappe?.imapPath || !targetMappe?.imapPath) {
    throw new Error('Kan ikke flytte – meldingen mangler IMAP-referanse.');
  }
  const client = createImapClient(konto);
  await client.connect();
  try {
    const lock = await client.getMailboxLock(mappe.imapPath);
    try {
      await client.messageMove(epostRow.imap_uid, targetMappe.imapPath, { uid: true });
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(function () { /* ignore */ });
  }

  await prepare(`
    UPDATE eposter SET mappe_id = ?, imap_uid = NULL
    WHERE id = ?
  `).run(targetMappe.id, epostRow.id);
}

async function setMessageSeenOnServer(konto, mappe, epostRow, seen) {
  if (!epostRow.imap_uid || !mappe?.imapPath) return;
  const client = createImapClient(konto);
  await client.connect();
  try {
    const lock = await client.getMailboxLock(mappe.imapPath);
    try {
      if (seen) {
        await client.messageFlagsAdd(epostRow.imap_uid, ['\\Seen'], { uid: true });
      } else {
        await client.messageFlagsRemove(epostRow.imap_uid, ['\\Seen'], { uid: true });
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(function () { /* ignore */ });
  }
}

async function deleteMessageOnServer(konto, mappe, epostRow) {
  const trash = (await getMailMapperForKonto(konto.id)).find(function (m) { return m.mappeType === 'trash'; });
  if (trash && mappe?.imapPath && epostRow.imap_uid && trash.imapPath !== mappe.imapPath) {
    await moveMessageOnServer(konto, mappe, epostRow, trash);
    await prepare('UPDATE eposter SET slettet = 1 WHERE id = ?').run(epostRow.id);
    return;
  }

  if (epostRow.imap_uid && mappe?.imapPath) {
    const client = createImapClient(konto);
    await client.connect();
    try {
      const lock = await client.getMailboxLock(mappe.imapPath);
      try {
        await client.messageDelete(epostRow.imap_uid, { uid: true });
      } finally {
        lock.release();
      }
    } finally {
      await client.logout().catch(function () { /* ignore */ });
    }
  }

  await prepare('UPDATE eposter SET slettet = 1 WHERE id = ?').run(epostRow.id);
}

async function getSentMappeForKonto(kontoId) {
  const mapper = await getMailMapperForKonto(kontoId);
  return mapper.find(function (m) { return m.mappeType === 'sent'; }) || null;
}

async function refreshFoldersFromImap(kontoId) {
  const { getMailKontoById } = require('./db');
  const konto = await getMailKontoById(Number(kontoId), true);
  if (!konto || !accountImapReady(konto)) {
    return getMailMapperForKonto(kontoId);
  }

  const client = createImapClient(konto);
  await client.connect();
  try {
    await discoverFolders(client, konto.id);
    await backfillEpostMappeIds(konto.id);
    await updateAllMappeCountsForKonto(konto.id);
  } finally {
    await client.logout().catch(function () { /* ignore */ });
  }

  return getMailMapperForKonto(kontoId);
}

async function backfillEpostMappeIds(kontoId) {
  const mapper = await getMailMapperForKonto(kontoId);
  const inbox = mapper.find(function (m) { return m.mappeType === 'inbox'; });
  const sent = mapper.find(function (m) { return m.mappeType === 'sent'; });

  if (inbox) {
    await prepare(`
      UPDATE eposter SET mappe_id = ?
      WHERE konto_id = ? AND mappe_id IS NULL AND retning = 'inn' AND slettet = 0
    `).run(inbox.id, Number(kontoId));
  }

  if (sent) {
    await prepare(`
      UPDATE eposter SET mappe_id = ?
      WHERE konto_id = ? AND mappe_id IS NULL AND retning = 'ut' AND slettet = 0
    `).run(sent.id, Number(kontoId));
  }
}

function startBackgroundMailSync() {
  const interval = Number(process.env.MAIL_SYNC_INTERVAL_MS || 180000);
  if (interval <= 0 || backgroundTimer) return;

  backgroundTimer = setInterval(async function () {
    if (backgroundRunning) return;
    backgroundRunning = true;
    try {
      await syncAllAccounts(null);
    } catch (err) {
      console.warn('[mail-sync] Bakgrunnssync feilet:', err.message);
    } finally {
      backgroundRunning = false;
    }
  }, interval);

  if (typeof backgroundTimer.unref === 'function') backgroundTimer.unref();
  console.log('[mail-sync] Bakgrunnssync aktiv (hvert ' + Math.round(interval / 1000) + ' s)');
}

module.exports = {
  syncAllAccounts,
  syncAccountFull,
  discoverFolders,
  refreshFoldersFromImap,
  backfillEpostMappeIds,
  createImapFolder,
  moveMessageOnServer,
  setMessageSeenOnServer,
  deleteMessageOnServer,
  getSentMappeForKonto,
  startBackgroundMailSync,
};
