const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'error-logs.jsonl');

const ensureDir = async () => {
  await fs.promises.mkdir(LOG_DIR, { recursive: true });
};

const safeJsonStringify = (value) => {
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({ __stringify_error: true, value: String(value) });
  }
};

const append = async (entry) => {
  try {
    await ensureDir();
    const line = `${safeJsonStringify(entry)}\n`;
    await fs.promises.appendFile(LOG_FILE, line, 'utf8');
  } catch {
    // never throw from fallback logger
  }
};

const readLatest = async (limit = 200) => {
  try {
    const raw = await fs.promises.readFile(LOG_FILE, 'utf8');
    const lines = raw.split('\n').filter(Boolean);
    const slice = lines.slice(Math.max(0, lines.length - limit));
    const items = [];
    for (const line of slice.reverse()) {
      try {
        items.push(JSON.parse(line));
      } catch {
        // skip bad lines
      }
    }
    return items;
  } catch {
    return [];
  }
};

module.exports = {
  append,
  readLatest,
  LOG_FILE,
};

