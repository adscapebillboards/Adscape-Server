const fs = require('fs');
const path = require('path');

const STORE_PATH = path.join(__dirname, '..', 'config', 'apk-releases.json');

function ensureStoreDir() {
  const dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readApkReleases() {
  try {
    ensureStoreDir();
    if (!fs.existsSync(STORE_PATH)) return [];
    const raw = fs.readFileSync(STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeApkReleases(items) {
  ensureStoreDir();
  fs.writeFileSync(STORE_PATH, JSON.stringify(items, null, 2), 'utf8');
}

module.exports = { readApkReleases, writeApkReleases };

