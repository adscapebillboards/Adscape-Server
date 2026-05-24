const fs = require('fs');
const path = require('path');

const STORE_PATH = path.join(__dirname, '..', 'config', 'invoice-template-mjml.json');

function getDefaultTemplate() {
  return '<mjml><mj-body><mj-section><mj-column><mj-text font-size="28px" font-weight="700">GST Invoice</mj-text><mj-text>Replace this with your full invoice MJML template.</mj-text></mj-column></mj-section></mj-body></mjml>';
}

function readInvoiceTemplateMjml() {
  try {
    if (!fs.existsSync(STORE_PATH)) {
      return getDefaultTemplate();
    }
    const raw = fs.readFileSync(STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (typeof parsed?.mjml === 'string' && parsed.mjml.trim()) return parsed.mjml;
    return getDefaultTemplate();
  } catch (_) {
    return getDefaultTemplate();
  }
}

function writeInvoiceTemplateMjml(mjml) {
  const payload = {
    mjml: String(mjml || ''),
    updatedAt: new Date().toISOString()
  };
  fs.writeFileSync(STORE_PATH, JSON.stringify(payload, null, 2), 'utf8');
  return payload;
}

module.exports = {
  readInvoiceTemplateMjml,
  writeInvoiceTemplateMjml,
  getDefaultTemplate
};
