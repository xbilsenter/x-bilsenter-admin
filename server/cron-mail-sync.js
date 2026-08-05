'use strict';

const { syncAllAccounts } = require('./mail-sync');
const { prepare, isPostgres } = require('./db');

const LOCK_KEY = 'mail_sync_lock';
const LOCK_TTL_MS = Number(process.env.MAIL_SYNC_LOCK_TTL_MS || 120000);

function verifyCronRequest(req) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const auth = String(req.headers.authorization || '');
  return auth === `Bearer ${expected}`;
}

async function acquireLock() {
  const now = Date.now();
  const row = await prepare('SELECT value FROM innstillinger WHERE key = ?').get(LOCK_KEY);
  if (row?.value) {
    try {
      const parsed = JSON.parse(row.value);
      if (parsed?.until && Number(parsed.until) > now) {
        return false;
      }
    } catch {
      /* ignore */
    }
  }

  const payload = JSON.stringify({ until: now + LOCK_TTL_MS, startedAt: new Date().toISOString() });
  await prepare('DELETE FROM innstillinger WHERE key = ?').run(LOCK_KEY);
  await prepare(`
    INSERT INTO innstillinger (key, value, updated_at)
    VALUES (?, ?, ${isPostgres ? 'NOW()' : "datetime('now')"})
  `).run(LOCK_KEY, payload);
  return true;
}

async function releaseLock() {
  await prepare('DELETE FROM innstillinger WHERE key = ?').run(LOCK_KEY);
}

async function runMailSyncCron(req, res) {
  if (!verifyCronRequest(req)) {
    return res.status(401).json({ ok: false, error: 'Unauthorized cron request.' });
  }

  const locked = await acquireLock();
  if (!locked) {
    return res.status(409).json({ ok: false, error: 'Mail sync already running.' });
  }

  try {
    const result = await syncAllAccounts(null);
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    console.error('[cron/mail-sync]', err.message || err);
    return res.status(500).json({ ok: false, error: err.message || 'Mail sync failed.' });
  } finally {
    await releaseLock().catch(function () { /* ignore */ });
  }
}

module.exports = {
  runMailSyncCron
};
