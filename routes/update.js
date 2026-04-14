const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();

const CONFIG_PATH = path.join(__dirname, '..', 'config', 'update-manifest.json');

function safeReadManifest() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

function compareVersions(left, right) {
  const leftParts = String(left || '0.0.0').split('.').map((part) => Number(part) || 0);
  const rightParts = String(right || '0.0.0').split('.').map((part) => Number(part) || 0);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const a = leftParts[index] || 0;
    const b = rightParts[index] || 0;
    if (a > b) return 1;
    if (a < b) return -1;
  }

  return 0;
}

router.get('/update', (req, res) => {
  const manifest = safeReadManifest();
  if (!manifest) {
    return res.status(500).json({
      error: 'update_manifest_unavailable',
      message: 'Update manifest could not be loaded'
    });
  }

  const platform = String(req.query.platform || '').toLowerCase();
  const arch = String(req.query.arch || 'x86_64').toLowerCase();
  const channel = String(req.query.channel || 'stable').toLowerCase();
  const currentVersion = String(req.query.currentVersion || '0.0.0');

  const release =
    manifest.channels?.[channel]?.platforms?.[platform]?.[arch] ||
    manifest.channels?.[channel]?.platforms?.[platform]?.default;

  if (!release) {
    return res.status(404).json({
      error: 'release_not_found',
      message: `No OTA release configured for platform=${platform}, arch=${arch}, channel=${channel}`
    });
  }

  const updateAvailable = compareVersions(release.version, currentVersion) > 0;

  return res.json({
    updateAvailable,
    currentVersion,
    serverTime: new Date().toISOString(),
    update: {
      version: release.version,
      url: release.url,
      checksumSha256: release.checksumSha256,
      packageType: release.packageType,
      releaseNotes: release.releaseNotes || '',
      channel,
      mandatory: Boolean(release.mandatory),
      silent: Boolean(release.silent),
      preservePaths: Array.isArray(release.preservePaths) ? release.preservePaths : [],
      binaryTargets: Array.isArray(release.binaryTargets) ? release.binaryTargets : []
    }
  });
});

module.exports = router;
