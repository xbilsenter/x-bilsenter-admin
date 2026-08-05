'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SERVER_DIR = path.join(ROOT, 'server');

require(path.join(SERVER_DIR, 'node_modules', 'dotenv')).config({ path: path.join(ROOT, '.env') });

const {
  UPLOADS_DIR,
  isRemoteStorageEnabled,
  ensureBucket,
  uploadLocalFile
} = require(path.join(SERVER_DIR, 'storage'));

async function main() {
  if (!isRemoteStorageEnabled()) {
    console.error('Supabase Storage er ikke aktivert.');
    console.error('Sett USE_SUPABASE=true og SUPABASE_STORAGE_BUCKET=uploads i .env');
    process.exit(1);
  }

  await ensureBucket();
  console.log('Bucket klar:', process.env.SUPABASE_STORAGE_BUCKET);

  if (!fs.existsSync(UPLOADS_DIR)) {
    console.log('Ingen lokale filer å migrere.');
    return;
  }

  const files = fs.readdirSync(UPLOADS_DIR).filter(function (name) {
    return fs.statSync(path.join(UPLOADS_DIR, name)).isFile();
  });

  if (!files.length) {
    console.log('Ingen lokale filer å migrere.');
    return;
  }

  let uploaded = 0;
  for (const filename of files) {
    const abs = path.join(UPLOADS_DIR, filename);
    try {
      const uploadPath = await uploadLocalFile(abs, filename);
      uploaded += 1;
      console.log('Lastet opp:', uploadPath);
    } catch (err) {
      console.error('Feil for', filename + ':', err.message);
    }
  }

  console.log(`Ferdig. ${uploaded}/${files.length} filer lastet opp til Supabase Storage.`);
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
