'use strict';

const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const fs = require('fs');

const {
  db,
  UPLOADS_DIR,
  mapHenv,
  mapInnbytte,
  mapBil,
  mapKal,
  mapEpost,
  getInnstillinger,
  saveInnstillinger,
  getMailKontoer,
  getMailKontoById,
  createMailKonto,
  updateMailKonto,
  deleteMailKonto,
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
  getUserById,
  getUserByUsername,
  getUsers,
  createUser,
  updateUser,
  deleteUser,
  getPermissionDefs,
  getRoleTemplates,
  PASS_MASK
} = require('./db');

const { lookupVehicleFull } = require('./vegvesen');
const { getMailStatus, syncInbox, sendMail, testMailKonto } = require('./mail');
const { isSupabaseEnabled } = require('./supabase');

const app = express();
const PORT = process.env.PORT || 8090;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const INGEST_SECRET = process.env.INGEST_SECRET || '';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const PUBLIC_SITE_ORIGIN = process.env.PUBLIC_SITE_ORIGIN || 'http://localhost:8080';
const isProd = process.env.NODE_ENV === 'production';
const clientDist = path.join(__dirname, '..', 'client', 'dist');

app.use(cors({
  origin: isProd
    ? [PUBLIC_SITE_ORIGIN, `http://localhost:${PORT}`]
    : true,
  credentials: true
}));

app.use(express.json({ limit: '25mb' }));

const upload = multer({
  storage: multer.diskStorage({
    destination: function (_req, _file, cb) {
      cb(null, UPLOADS_DIR);
    },
    filename: function (_req, file, cb) {
      const safe = String(file.originalname || 'fil').replace(/[^\w.\-]+/g, '_');
      cb(null, Date.now() + '-' + safe);
    }
  }),
  limits: { fileSize: 8 * 1024 * 1024, files: 12 }
});

function touch(table, id) {
  db.prepare(`UPDATE ${table} SET updated_at = datetime('now') WHERE id = ?`).run(id);
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return res.status(401).json({ ok: false, error: 'Ikke innlogget.' });

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ ok: false, error: 'Ugyldig eller utløpt sesjon.' });
  }
}

function hasPermission(user, permission) {
  if (!user) return false;
  if (user.isAdmin) return true;
  return Array.isArray(user.permissions) && user.permissions.includes(permission);
}

function requirePermission(permission) {
  return function (req, res, next) {
    if (hasPermission(req.user, permission)) return next();
    return res.status(403).json({ ok: false, error: 'Ingen tilgang.' });
  };
}

function formatUserResponse(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    email: user.email || '',
    role: user.role,
    permissions: user.permissions || [],
    isAdmin: !!user.isAdmin,
    aktiv: user.aktiv !== false
  };
}

function signToken(user) {
  return jwt.sign({
    sub: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    permissions: user.permissions || [],
    isAdmin: !!user.isAdmin
  }, JWT_SECRET, { expiresIn: '7d' });
}

function requireIngest(req, res, next) {
  const key = req.headers['x-ingest-key'] || req.headers['x-api-key'] || '';
  if (!INGEST_SECRET || key !== INGEST_SECRET) {
    return res.status(403).json({ ok: false, error: 'Ugyldig ingest-nøkkel.' });
  }
  next();
}

// ─── Auth ───
app.post('/api/auth/login', async function (req, res) {
  const { username, password } = req.body || {};
  const user = getUserByUsername(username, true);
  if (!user || !user.aktiv) {
    return res.status(401).json({ ok: false, error: 'Feil brukernavn eller passord.' });
  }

  try {
    const ok = await bcrypt.compare(String(password || ''), user.passwordHash);
    if (!ok) {
      return res.status(401).json({ ok: false, error: 'Feil brukernavn eller passord.' });
    }
  } catch {
    return res.status(401).json({ ok: false, error: 'Feil brukernavn eller passord.' });
  }

  const safeUser = getUserById(user.id);
  const token = signToken(safeUser);
  res.json({ ok: true, token, user: formatUserResponse(safeUser) });
});

app.get('/api/auth/me', requireAuth, function (req, res) {
  const user = getUserById(req.user.sub);
  if (!user || !user.aktiv) {
    return res.status(401).json({ ok: false, error: 'Ugyldig sesjon.' });
  }
  res.json({ ok: true, user: formatUserResponse(user) });
});

// ─── Brukere ───
app.get('/api/brukere/meta', requireAuth, requirePermission('brukere'), function (_req, res) {
  res.json({
    ok: true,
    permissions: getPermissionDefs(),
    roleTemplates: getRoleTemplates()
  });
});

app.get('/api/brukere', requireAuth, requirePermission('brukere'), function (_req, res) {
  res.json({ ok: true, items: getUsers() });
});

app.post('/api/brukere', requireAuth, requirePermission('brukere'), async function (req, res) {
  try {
    const password = String(req.body?.password || '');
    if (password.length < 6) {
      return res.status(400).json({ ok: false, error: 'Passord må være minst 6 tegn.' });
    }
    const hash = await bcrypt.hash(password, 10);
    const item = createUser(req.body || {}, hash);
    res.status(201).json({ ok: true, item: formatUserResponse(item) });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message || 'Kunne ikke opprette bruker.' });
  }
});

app.patch('/api/brukere/:id', requireAuth, requirePermission('brukere'), async function (req, res) {
  try {
    let hash = null;
    if (req.body?.password) {
      const password = String(req.body.password);
      if (password.length < 6) {
        return res.status(400).json({ ok: false, error: 'Passord må være minst 6 tegn.' });
      }
      hash = await bcrypt.hash(password, 10);
    }
    const item = updateUser(Number(req.params.id), req.body || {}, hash);
    if (!item) return res.status(404).json({ ok: false, error: 'Bruker ikke funnet.' });
    res.json({ ok: true, item: formatUserResponse(item) });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message || 'Kunne ikke oppdatere bruker.' });
  }
});

app.delete('/api/brukere/:id', requireAuth, requirePermission('brukere'), function (req, res) {
  try {
    const ok = deleteUser(Number(req.params.id), req.user.sub);
    if (!ok) return res.status(404).json({ ok: false, error: 'Bruker ikke funnet.' });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message || 'Kunne ikke slette bruker.' });
  }
});

// ─── Dashboard ───
app.get('/api/dashboard', requireAuth, function (_req, res) {
  const nyeHenv = db.prepare("SELECT COUNT(*) AS c FROM henvendelser WHERE status = 'Ny'").get().c;
  const nyeInnbytte = db.prepare("SELECT COUNT(*) AS c FROM innbytte WHERE status = 'Ny'").get().c;
  const paaLager = db.prepare("SELECT COUNT(*) AS c FROM biler WHERE status NOT IN ('Solgt')").get().c;
  const reservert = db.prepare("SELECT COUNT(*) AS c FROM biler WHERE status = 'Reservert'").get().c;
  const idag = new Date().toISOString().slice(0, 10);
  const iDagKal = db.prepare('SELECT COUNT(*) AS c FROM kalender WHERE dato = ?').get(idag).c;

  const biler = db.prepare('SELECT sjekkliste FROM biler WHERE status NOT IN (\'Solgt\')').all();
  let aapneOppgaver = 0;
  biler.forEach(function (b) {
    try {
      const list = JSON.parse(b.sjekkliste || '[]');
      aapneOppgaver += list.filter(function (x) { return !x.f; }).length;
    } catch (_e) { /* ignore */ }
  });

  res.json({
    ok: true,
    stats: {
      nyeHenv,
      nyeInnbytte,
      paaLager,
      reservert,
      iDagKal,
      aapneOppgaver,
      ulestEpost: countUlestEpost()
    }
  });
});

// ─── Ingest (fra nettside) ───
app.post('/api/ingest/henvendelse', requireIngest, function (req, res) {
  const b = req.body || {};
  if (!b.navn || !b.epost || !b.emne) {
    return res.status(400).json({ ok: false, error: 'Navn, e-post og emne er påkrevd.' });
  }

  const info = db.prepare(`
    INSERT INTO henvendelser (navn, epost, tlf, emne, melding, kilde, bil_ref)
    VALUES (@navn, @epost, @tlf, @emne, @melding, @kilde, @bil_ref)
  `).run({
    navn: b.navn,
    epost: b.epost,
    tlf: b.tlf || '',
    emne: b.emne,
    melding: b.melding || '',
    kilde: b.kilde || 'Nettside',
    bil_ref: b.bilRef || ''
  });

  res.status(201).json({ ok: true, id: info.lastInsertRowid });
});

app.post('/api/ingest/innbytte', requireIngest, upload.array('bilder', 12), function (req, res) {
  const b = req.body || {};
  if (!b.regnr || !b.navn || !b.epost || !b.mobil) {
    return res.status(400).json({ ok: false, error: 'Registreringsnummer, navn, e-post og mobil er påkrevd.' });
  }

  let utstyr = b.utstyr;
  if (typeof utstyr === 'string') {
    try { utstyr = JSON.parse(utstyr); } catch { utstyr = utstyr ? [utstyr] : []; }
  }
  if (!Array.isArray(utstyr)) utstyr = [];

  let bilderMeta = b.bilder;
  if (typeof bilderMeta === 'string') {
    try { bilderMeta = JSON.parse(bilderMeta); } catch { bilderMeta = []; }
  }

  const savedFiles = (req.files || []).map(function (f) {
    return { name: f.originalname, path: '/uploads/' + f.filename, size: f.size, type: f.mimetype };
  });

  if (Array.isArray(bilderMeta) && bilderMeta.length && !savedFiles.length) {
    bilderMeta.forEach(function (file, i) {
      if (!file || !file.data) return;
      const match = String(file.data).match(/^data:([^;]+);base64,(.+)$/);
      if (!match) return;
      const ext = (match[1].split('/')[1] || 'jpg').replace('jpeg', 'jpg');
      const filename = Date.now() + '-' + i + '.' + ext;
      fs.writeFileSync(path.join(UPLOADS_DIR, filename), Buffer.from(match[2], 'base64'));
      savedFiles.push({ name: file.name || filename, path: '/uploads/' + filename, type: match[1] });
    });
  }

  const info = db.prepare(`
    INSERT INTO innbytte (
      navn, epost, tlf, regnr, merke, modell, arsmodell, drivstoff, farge, kjoretoy_type,
      hjuldrift, effekt_hk, siste_eu_kontroll, neste_eu_kontroll, kilometerstand,
      servicehistorikk, siste_service, utstyr, sommerdekk, vinterdekk, forventning,
      kommentar, finn_kode, bilder
    ) VALUES (
      @navn, @epost, @tlf, @regnr, @merke, @modell, @arsmodell, @drivstoff, @farge, @kjoretoy_type,
      @hjuldrift, @effekt_hk, @siste_eu_kontroll, @neste_eu_kontroll, @kilometerstand,
      @servicehistorikk, @siste_service, @utstyr, @sommerdekk, @vinterdekk, @forventning,
      @kommentar, @finn_kode, @bilder
    )
  `).run({
    navn: b.navn,
    epost: b.epost,
    tlf: b.mobil || b.tlf || '',
    regnr: String(b.regnr).toUpperCase(),
    merke: b.merke || '',
    modell: b.modell || '',
    arsmodell: b.arsmodell || '',
    drivstoff: b.drivstoff || '',
    farge: b.farge || '',
    kjoretoy_type: b.kjoretoyType || '',
    hjuldrift: b.hjuldrift || '',
    effekt_hk: b.effektHk != null ? String(b.effektHk) : '',
    siste_eu_kontroll: b.sisteEuKontroll || '',
    neste_eu_kontroll: b.nesteEuKontroll || '',
    kilometerstand: b.kilometerstand || '',
    servicehistorikk: b.servicehistorikk || '',
    siste_service: b.sisteService || '',
    utstyr: JSON.stringify(utstyr),
    sommerdekk: b.sommerdekk || '',
    vinterdekk: b.vinterdekk || '',
    forventning: b.forventning || '',
    kommentar: b.kommentar || '',
    finn_kode: b.finnKode || '',
    bilder: JSON.stringify(savedFiles)
  });

  res.status(201).json({ ok: true, id: info.lastInsertRowid });
});

// JSON innbytte (same as website uses today)
app.post('/api/ingest/innbytte/json', requireIngest, function (req, res) {
  req.body = req.body || {};
  const files = Array.isArray(req.body.bilder) ? req.body.bilder : [];
  const savedFiles = [];

  files.forEach(function (file, i) {
    if (!file || !file.data) return;
    const match = String(file.data).match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return;
    const ext = (match[1].split('/')[1] || 'jpg').replace('jpeg', 'jpg');
    const filename = Date.now() + '-' + i + '.' + ext;
    fs.writeFileSync(path.join(UPLOADS_DIR, filename), Buffer.from(match[2], 'base64'));
    savedFiles.push({ name: file.name || filename, path: '/uploads/' + filename, type: match[1] });
  });

  req.body.bilder = savedFiles;
  req.body.mobil = req.body.mobil || req.body.tlf;

  const b = req.body;
  if (!b.regnr || !b.navn || !b.epost || !b.mobil) {
    return res.status(400).json({ ok: false, error: 'Registreringsnummer, navn, e-post og mobil er påkrevd.' });
  }

  const utstyr = Array.isArray(b.utstyr) ? b.utstyr : [];

  const info = db.prepare(`
    INSERT INTO innbytte (
      navn, epost, tlf, regnr, merke, modell, arsmodell, drivstoff, farge, kjoretoy_type,
      hjuldrift, effekt_hk, siste_eu_kontroll, neste_eu_kontroll, kilometerstand,
      servicehistorikk, siste_service, utstyr, sommerdekk, vinterdekk, forventning,
      kommentar, finn_kode, bilder
    ) VALUES (
      @navn, @epost, @tlf, @regnr, @merke, @modell, @arsmodell, @drivstoff, @farge, @kjoretoy_type,
      @hjuldrift, @effekt_hk, @siste_eu_kontroll, @neste_eu_kontroll, @kilometerstand,
      @servicehistorikk, @siste_service, @utstyr, @sommerdekk, @vinterdekk, @forventning,
      @kommentar, @finn_kode, @bilder
    )
  `).run({
    navn: b.navn,
    epost: b.epost,
    tlf: b.mobil,
    regnr: String(b.regnr).toUpperCase(),
    merke: b.merke || '',
    modell: b.modell || '',
    arsmodell: b.arsmodell || '',
    drivstoff: b.drivstoff || '',
    farge: b.farge || '',
    kjoretoy_type: b.kjoretoyType || '',
    hjuldrift: b.hjuldrift || '',
    effekt_hk: b.effektHk != null ? String(b.effektHk) : '',
    siste_eu_kontroll: b.sisteEuKontroll || '',
    neste_eu_kontroll: b.nesteEuKontroll || '',
    kilometerstand: b.kilometerstand || '',
    servicehistorikk: b.servicehistorikk || '',
    siste_service: b.sisteService || '',
    utstyr: JSON.stringify(utstyr),
    sommerdekk: b.sommerdekk || '',
    vinterdekk: b.vinterdekk || '',
    forventning: b.forventning || '',
    kommentar: b.kommentar || '',
    finn_kode: b.finnKode || '',
    bilder: JSON.stringify(savedFiles)
  });

  res.status(201).json({ ok: true, id: info.lastInsertRowid });
});

// ─── Henvendelser ───
app.get('/api/henvendelser', requireAuth, function (_req, res) {
  const rows = db.prepare('SELECT * FROM henvendelser ORDER BY created_at DESC').all();
  res.json({ ok: true, items: rows.map(mapHenv) });
});

app.patch('/api/henvendelser/:id', requireAuth, function (req, res) {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM henvendelser WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ ok: false, error: 'Ikke funnet.' });

  const b = req.body || {};
  db.prepare(`
    UPDATE henvendelser SET
      status = COALESCE(@status, status),
      ansvarlig = COALESCE(@ansvarlig, ansvarlig),
      svar = COALESCE(@svar, svar),
      kommentarer = COALESCE(@kommentarer, kommentarer),
      updated_at = datetime('now')
    WHERE id = @id
  `).run({
    id,
    status: b.status ?? null,
    ansvarlig: b.ansvarlig ?? null,
    svar: b.svar ?? null,
    kommentarer: b.kommentarer != null ? JSON.stringify(b.kommentarer) : null
  });

  res.json({ ok: true, item: mapHenv(db.prepare('SELECT * FROM henvendelser WHERE id = ?').get(id)) });
});

app.post('/api/henvendelser/:id/send-svar', requireAuth, async function (req, res) {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM henvendelser WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ ok: false, error: 'Ikke funnet.' });

  const text = String((req.body || {}).svar || '').trim();
  if (!text) return res.status(400).json({ ok: false, error: 'Svar kan ikke være tomt.' });
  if (!row.epost) return res.status(400).json({ ok: false, error: 'Henvendelsen har ingen e-postadresse.' });

  try {
    const subject = String(row.emne || '').startsWith('Re:')
      ? row.emne
      : `Re: ${row.emne || 'Henvendelse'}`;

    await sendMail({
      to: row.epost,
      toName: row.navn,
      subject,
      text,
      henvendelseId: id,
      kontoId: (req.body || {}).kontoId || null
    });

    db.prepare(`
      UPDATE henvendelser SET
        svar = @svar,
        status = 'Besvart',
        updated_at = datetime('now')
      WHERE id = @id
    `).run({ id, svar: text });

    res.json({ ok: true, item: mapHenv(db.prepare('SELECT * FROM henvendelser WHERE id = ?').get(id)) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Kunne ikke sende e-post.' });
  }
});

// ─── Innboks ───
app.get('/api/mail/status', requireAuth, function (_req, res) {
  res.json({ ok: true, status: getMailStatus() });
});

app.get('/api/innboks/utkast', requireAuth, function (_req, res) {
  res.json({
    ok: true,
    items: getEpostUtkastList(),
    count: countEpostUtkast(),
    status: getMailStatus()
  });
});

app.get('/api/innboks/utkast/:id', requireAuth, function (req, res) {
  const item = getEpostUtkastById(Number(req.params.id));
  if (!item) return res.status(404).json({ ok: false, error: 'Utkast ikke funnet.' });
  res.json({ ok: true, item });
});

app.put('/api/innboks/utkast', requireAuth, function (req, res) {
  try {
    const item = saveEpostUtkast(req.body || {});
    res.json({ ok: true, item, count: countEpostUtkast(), status: getMailStatus() });
  } catch (err) {
    console.error('[innboks/utkast PUT]', err);
    res.status(500).json({ ok: false, error: err.message || 'Kunne ikke lagre utkast.' });
  }
});

app.delete('/api/innboks/utkast/:id', requireAuth, function (req, res) {
  deleteEpostUtkast(Number(req.params.id));
  res.json({ ok: true, count: countEpostUtkast(), status: getMailStatus() });
});

app.get('/api/innboks', requireAuth, function (_req, res) {
  const rows = db.prepare(`
    SELECT e.*, k.navn AS konto_navn, k.epost AS konto_epost
    FROM eposter e
    INNER JOIN mail_kontoer k ON k.id = e.konto_id
    ORDER BY e.mottatt_dato DESC, e.id DESC
  `).all();
  res.json({ ok: true, items: rows.map(mapEpost), status: getMailStatus() });
});

app.patch('/api/innboks/:id', requireAuth, function (req, res) {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM eposter WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ ok: false, error: 'Ikke funnet.' });

  const b = req.body || {};
  if (b.lest != null) {
    db.prepare('UPDATE eposter SET lest = @lest WHERE id = @id').run({
      id,
      lest: b.lest ? 1 : 0
    });
  }

  if (b.henvendelseId != null) {
    db.prepare('UPDATE eposter SET henvendelse_id = @henvendelse_id WHERE id = @id').run({
      id,
      henvendelse_id: b.henvendelseId || null
    });
  }

  res.json({ ok: true, item: mapEpost(db.prepare(`
    SELECT e.*, k.navn AS konto_navn, k.epost AS konto_epost
    FROM eposter e
    LEFT JOIN mail_kontoer k ON k.id = e.konto_id
    WHERE e.id = ?
  `).get(id)) });
});

app.post('/api/innboks/sync', requireAuth, async function (req, res) {
  try {
    const kontoId = req.body?.kontoId || req.query?.kontoId || null;
    const result = await syncInbox(kontoId ? Number(kontoId) : null);
    res.json({ ok: true, ...result, status: getMailStatus() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Synkronisering feilet.' });
  }
});

function handleSendEpost(req, res) {
  const b = req.body || {};
  const to = String(b.to || '').trim();
  const subject = String(b.subject || b.emne || '').trim();
  const text = String(b.text || b.innhold || '').trim();
  const html = String(b.html || '').trim();

  if (!to || !subject || (!text && !html)) {
    return res.status(400).json({ ok: false, error: 'Mottaker, emne og melding er påkrevd.' });
  }

  (async function () {
    try {
      let inReplyTo = b.inReplyTo || null;
      let references = b.references || null;
      if (b.replyToId) {
        const original = db.prepare('SELECT * FROM eposter WHERE id = ?').get(Number(b.replyToId));
        if (original) {
          inReplyTo = original.message_id;
          references = [original.message_id, original.in_reply_to].filter(Boolean);
          if (!b.kontoId && original.konto_id) b.kontoId = original.konto_id;
        }
      }

      const attachments = (req.files || []).map(function (file) {
        return {
          filename: file.originalname,
          path: file.path,
          contentType: file.mimetype
        };
      });

      const sent = await sendMail({
        to,
        toName: b.toName || '',
        cc: b.cc || b.kopi || '',
        bcc: b.bcc || b.blindkopi || '',
        subject,
        text,
        html,
        replyQuoteHtml: b.replyQuoteHtml || '',
        inReplyTo,
        references,
        henvendelseId: b.henvendelseId || null,
        kontoId: b.kontoId || null,
        attachments
      });

      const item = mapEpost(db.prepare(`
        SELECT e.*, k.navn AS konto_navn, k.epost AS konto_epost
        FROM eposter e
        LEFT JOIN mail_kontoer k ON k.id = e.konto_id
        WHERE e.id = ?
      `).get(sent.rowId));
      if (b.draftId) deleteEpostUtkast(Number(b.draftId));
      res.status(201).json({ ok: true, item });
    } catch (err) {
      console.error('[innboks/send]', err);
      res.status(500).json({ ok: false, error: err.message || 'Kunne ikke sende e-post.' });
    }
  })();
}

app.post('/api/innboks/send', requireAuth, function (req, res, next) {
  const ct = String(req.headers['content-type'] || '');
  if (ct.includes('multipart/form-data')) {
    return upload.array('vedlegg', 10)(req, res, function (err) {
      if (err) {
        return res.status(400).json({ ok: false, error: err.message || 'Opplasting av vedlegg feilet.' });
      }
      handleSendEpost(req, res);
    });
  }
  next();
}, function (req, res) {
  handleSendEpost(req, res);
});

app.post('/api/innboks/:id/oppret-henvendelse', requireAuth, function (req, res) {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM eposter WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ ok: false, error: 'Ikke funnet.' });
  if (row.henvendelse_id) {
    return res.status(400).json({ ok: false, error: 'E-posten er allerede koblet til en henvendelse.' });
  }

  const info = db.prepare(`
    INSERT INTO henvendelser (navn, epost, tlf, emne, melding, kilde, bil_ref)
    VALUES (@navn, @epost, @tlf, @emne, @melding, 'E-post', @bil_ref)
  `).run({
    navn: row.fra_navn || row.fra_epost,
    epost: row.fra_epost,
    tlf: '',
    emne: row.emne,
    melding: row.innhold || row.innhold_html || '',
    bil_ref: (req.body || {}).bilRef || ''
  });

  db.prepare('UPDATE eposter SET henvendelse_id = @henvendelse_id WHERE id = @id').run({
    id,
    henvendelse_id: info.lastInsertRowid
  });

  res.status(201).json({
    ok: true,
    henvendelse: mapHenv(db.prepare('SELECT * FROM henvendelser WHERE id = ?').get(info.lastInsertRowid)),
    epost: mapEpost(db.prepare(`
      SELECT e.*, k.navn AS konto_navn, k.epost AS konto_epost
      FROM eposter e
      LEFT JOIN mail_kontoer k ON k.id = e.konto_id
      WHERE e.id = ?
    `).get(id))
  });
});

// ─── Mailkontoer ───
app.post('/api/mail/upload-bilde', requireAuth, upload.single('bilde'), function (req, res) {
  if (!req.file) return res.status(400).json({ ok: false, error: 'Ingen bilde valgt.' });
  const url = '/uploads/' + req.file.filename;
  const base = process.env.ADMIN_PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
  res.json({ ok: true, url, absoluteUrl: base + url, name: req.file.originalname });
});

app.get('/api/mail/kontoer', requireAuth, function (_req, res) {
  res.json({ ok: true, items: getMailKontoer(false), status: getMailStatus() });
});

app.post('/api/mail/kontoer', requireAuth, function (req, res) {
  try {
    const b = req.body || {};
    if (!b.navn || !b.epost) {
      return res.status(400).json({ ok: false, error: 'Navn og e-post er påkrevd.' });
    }
    const item = createMailKonto(b);
    res.status(201).json({ ok: true, item, status: getMailStatus() });
  } catch (err) {
    console.error('[mail/kontoer POST]', err);
    res.status(500).json({ ok: false, error: err.message || 'Kunne ikke opprette mailkonto.' });
  }
});

app.patch('/api/mail/kontoer/:id', requireAuth, function (req, res) {
  try {
    const id = Number(req.params.id);
    const existing = getMailKontoById(id, true);
    if (!existing) return res.status(404).json({ ok: false, error: 'Ikke funnet.' });

    const b = { ...(req.body || {}) };
    if (b.imapPass === PASS_MASK) delete b.imapPass;
    if (b.smtpPass === PASS_MASK) delete b.smtpPass;

    const item = updateMailKonto(id, b);
    res.json({ ok: true, item, status: getMailStatus() });
  } catch (err) {
    console.error('[mail/kontoer PATCH]', err);
    res.status(500).json({ ok: false, error: err.message || 'Kunne ikke oppdatere mailkonto.' });
  }
});

app.delete('/api/mail/kontoer/:id', requireAuth, function (req, res) {
  const ok = deleteMailKonto(Number(req.params.id));
  if (!ok) return res.status(404).json({ ok: false, error: 'Ikke funnet.' });
  res.json({ ok: true, status: getMailStatus() });
});

app.post('/api/mail/kontoer/:id/test', requireAuth, async function (req, res) {
  try {
    const result = await testMailKonto(Number(req.params.id));
    res.json({ ok: true, result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Tilkobling feilet.' });
  }
});

app.get('/api/mail/maler', requireAuth, function (_req, res) {
  res.json({ ok: true, items: getEpostMaler() });
});

app.post('/api/mail/maler', requireAuth, function (req, res) {
  try {
    const item = createEpostMal(req.body || {});
    res.status(201).json({ ok: true, item });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message || 'Kunne ikke opprette mal.' });
  }
});

app.patch('/api/mail/maler/:id', requireAuth, function (req, res) {
  try {
    const item = updateEpostMal(Number(req.params.id), req.body || {});
    if (!item) return res.status(404).json({ ok: false, error: 'Mal ikke funnet.' });
    res.json({ ok: true, item });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message || 'Kunne ikke oppdatere mal.' });
  }
});

app.delete('/api/mail/maler/:id', requireAuth, function (req, res) {
  deleteEpostMal(Number(req.params.id));
  res.json({ ok: true });
});

// ─── Innbytte ───
app.get('/api/innbytte', requireAuth, function (_req, res) {
  const rows = db.prepare('SELECT * FROM innbytte ORDER BY created_at DESC').all();
  res.json({ ok: true, items: rows.map(mapInnbytte) });
});

app.patch('/api/innbytte/:id', requireAuth, function (req, res) {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM innbytte WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ ok: false, error: 'Ikke funnet.' });

  const b = req.body || {};
  db.prepare(`
    UPDATE innbytte SET
      status = COALESCE(@status, status),
      ansvarlig = COALESCE(@ansvarlig, ansvarlig),
      tilbud = COALESCE(@tilbud, tilbud),
      kommentarer = COALESCE(@kommentarer, kommentarer),
      updated_at = datetime('now')
    WHERE id = @id
  `).run({
    id,
    status: b.status ?? null,
    ansvarlig: b.ansvarlig ?? null,
    tilbud: b.tilbud != null ? String(b.tilbud) : null,
    kommentarer: b.kommentarer != null ? JSON.stringify(b.kommentarer) : null
  });

  res.json({ ok: true, item: mapInnbytte(db.prepare('SELECT * FROM innbytte WHERE id = ?').get(id)) });
});

// ─── Biler ───
app.get('/api/biler', requireAuth, function (_req, res) {
  const rows = db.prepare('SELECT * FROM biler ORDER BY id DESC').all();
  res.json({ ok: true, items: rows.map(mapBil) });
});

app.post('/api/biler', requireAuth, function (req, res) {
  const b = req.body || {};
  if (!b.reg || !b.modell) {
    return res.status(400).json({ ok: false, error: 'Reg.nr og modell er påkrevd.' });
  }

  const info = db.prepare(`
    INSERT INTO biler (reg, merke, modell, aar, km, innkjop, salg, farge, status, ansvarlig, frist, notater, eu_kontroll, forsikring, sjekkliste, logg, svv_data)
    VALUES (@reg, @merke, @modell, @aar, @km, @innkjop, @salg, @farge, @status, @ansvarlig, @frist, @notater, @eu_kontroll, @forsikring, @sjekkliste, @logg, @svv_data)
  `).run({
    reg: String(b.reg).toUpperCase(),
    merke: b.merke || 'Annet',
    modell: b.modell,
    aar: Number(b.aar) || 0,
    km: Number(b.km) || 0,
    innkjop: Number(b.innkjop) || 0,
    salg: Number(b.salg) || 0,
    farge: b.farge || '',
    status: b.status || 'Innkjøpt',
    ansvarlig: b.ansvarlig || '',
    frist: b.frist || '',
    notater: b.notater || '',
    eu_kontroll: b.euKontroll || '',
    forsikring: b.forsikring || '',
    sjekkliste: JSON.stringify(b.sjekkliste || []),
    logg: JSON.stringify(b.logg || []),
    svv_data: b.svvData ? JSON.stringify(b.svvData) : null
  });

  res.status(201).json({ ok: true, item: mapBil(db.prepare('SELECT * FROM biler WHERE id = ?').get(info.lastInsertRowid)) });
});

app.patch('/api/biler/:id', requireAuth, function (req, res) {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM biler WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ ok: false, error: 'Ikke funnet.' });

  const b = req.body || {};
  db.prepare(`
    UPDATE biler SET
      reg = COALESCE(@reg, reg),
      merke = COALESCE(@merke, merke),
      modell = COALESCE(@modell, modell),
      aar = COALESCE(@aar, aar),
      km = COALESCE(@km, km),
      innkjop = COALESCE(@innkjop, innkjop),
      salg = COALESCE(@salg, salg),
      farge = COALESCE(@farge, farge),
      status = COALESCE(@status, status),
      ansvarlig = COALESCE(@ansvarlig, ansvarlig),
      frist = COALESCE(@frist, frist),
      notater = COALESCE(@notater, notater),
      eu_kontroll = COALESCE(@eu_kontroll, eu_kontroll),
      forsikring = COALESCE(@forsikring, forsikring),
      sjekkliste = COALESCE(@sjekkliste, sjekkliste),
      logg = COALESCE(@logg, logg),
      svv_data = COALESCE(@svv_data, svv_data),
      updated_at = datetime('now')
    WHERE id = @id
  `).run({
    id,
    reg: b.reg != null ? String(b.reg).toUpperCase() : null,
    merke: b.merke ?? null,
    modell: b.modell ?? null,
    aar: b.aar != null ? Number(b.aar) : null,
    km: b.km != null ? Number(b.km) : null,
    innkjop: b.innkjop != null ? Number(b.innkjop) : null,
    salg: b.salg != null ? Number(b.salg) : null,
    farge: b.farge ?? null,
    status: b.status ?? null,
    ansvarlig: b.ansvarlig ?? null,
    frist: b.frist ?? null,
    notater: b.notater ?? null,
    eu_kontroll: b.euKontroll ?? null,
    forsikring: b.forsikring ?? null,
    sjekkliste: b.sjekkliste != null ? JSON.stringify(b.sjekkliste) : null,
    logg: b.logg != null ? JSON.stringify(b.logg) : null,
    svv_data: b.svvData != null ? JSON.stringify(b.svvData) : null
  });

  res.json({ ok: true, item: mapBil(db.prepare('SELECT * FROM biler WHERE id = ?').get(id)) });
});

// ─── Kalender ───
app.get('/api/kalender', requireAuth, function (_req, res) {
  const rows = db.prepare('SELECT * FROM kalender ORDER BY dato ASC, tid ASC').all();
  res.json({ ok: true, items: rows.map(mapKal) });
});

app.post('/api/kalender', requireAuth, function (req, res) {
  const b = req.body || {};
  if (!b.tittel || !b.dato) {
    return res.status(400).json({ ok: false, error: 'Tittel og dato er påkrevd.' });
  }

  const info = db.prepare(`
    INSERT INTO kalender (tittel, type, dato, tid, tid_slutt, ansvarlig, bil_ref, notat)
    VALUES (@tittel, @type, @dato, @tid, @tid_slutt, @ansvarlig, @bil_ref, @notat)
  `).run({
    tittel: b.tittel,
    type: b.type || 'Annet',
    dato: b.dato,
    tid: b.tid || '10:00',
    tid_slutt: b.tidSlutt || '',
    ansvarlig: b.ansvarlig || '',
    bil_ref: b.bilRef || '',
    notat: b.notat || ''
  });

  res.status(201).json({ ok: true, item: mapKal(db.prepare('SELECT * FROM kalender WHERE id = ?').get(info.lastInsertRowid)) });
});

app.patch('/api/kalender/:id', requireAuth, function (req, res) {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM kalender WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ ok: false, error: 'Ikke funnet.' });

  const b = req.body || {};
  if (b.tittel != null && !String(b.tittel).trim()) {
    return res.status(400).json({ ok: false, error: 'Tittel kan ikke være tom.' });
  }

  db.prepare(`
    UPDATE kalender SET
      tittel = COALESCE(@tittel, tittel),
      type = COALESCE(@type, type),
      dato = COALESCE(@dato, dato),
      tid = COALESCE(@tid, tid),
      tid_slutt = COALESCE(@tid_slutt, tid_slutt),
      ansvarlig = COALESCE(@ansvarlig, ansvarlig),
      bil_ref = COALESCE(@bil_ref, bil_ref),
      notat = COALESCE(@notat, notat)
    WHERE id = @id
  `).run({
    id,
    tittel: b.tittel ?? null,
    type: b.type ?? null,
    dato: b.dato ?? null,
    tid: b.tid ?? null,
    tid_slutt: b.tidSlutt ?? null,
    ansvarlig: b.ansvarlig ?? null,
    bil_ref: b.bilRef ?? null,
    notat: b.notat ?? null
  });

  res.json({ ok: true, item: mapKal(db.prepare('SELECT * FROM kalender WHERE id = ?').get(id)) });
});

// ─── Innstillinger ───
app.get('/api/innstillinger', requireAuth, requirePermission('innstillinger'), function (_req, res) {
  res.json({ ok: true, settings: getInnstillinger() });
});

app.patch('/api/innstillinger', requireAuth, requirePermission('innstillinger'), function (req, res) {
  const body = req.body || {};
  const settings = saveInnstillinger(body);
  res.json({ ok: true, settings });
});

// ─── Vegvesen ───
app.get('/api/kjoretoy', requireAuth, async function (req, res) {
  const regnr = req.query.regnr || req.query.reg;
  if (!regnr) return res.status(400).json({ ok: false, error: 'Registreringsnummer mangler.' });

  const apiKey = process.env.VEGVESEN_API_KEY || '';

  try {
    const result = await lookupVehicleFull(regnr, apiKey);
    res.json({ ok: true, vehicle: result.parsed, raw: result.raw, sections: result.sections });
  } catch (err) {
    const statusMap = {
      MISSING_API_KEY: 400,
      INVALID_REGNR: 400,
      NOT_FOUND: 404,
      FORBIDDEN: 403,
      UPSTREAM_ERROR: 502
    };
    res.status(statusMap[err.code] || 502).json({
      ok: false,
      error: err.message,
      code: err.code || 'UPSTREAM_ERROR'
    });
  }
});

app.use('/uploads', express.static(UPLOADS_DIR));

if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', function (req, res, next) {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.listen(PORT, function () {
  console.log('X Bilsenter Admin API: http://localhost:' + PORT);
  if (isSupabaseEnabled()) {
    console.log('Database: Supabase (USE_SUPABASE=true) – fase 2 backend kobling gjenstår, SQLite brukes fortsatt i kode');
  } else {
    console.log('Database: SQLite (server/data/xbilsenter.db)');
  }
  if (fs.existsSync(clientDist)) {
    console.log('Admin panel: http://localhost:' + PORT);
  } else {
    console.log('Admin panel: kjør "npm run dev" i client/ (http://localhost:5173)');
  }
  if (!INGEST_SECRET) {
    console.warn('Advarsel: INGEST_SECRET er ikke satt – ingest-endepunkter er deaktivert.');
  }
});
