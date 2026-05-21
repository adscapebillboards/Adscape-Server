require('dotenv').config();
let u = process.env.DATABASE_URL || '';
u = u.trim().replace(/^["']|["']$/g, '');
console.log('Raw DATABASE_URL (first 60 chars):', u.substring(0, 60));
try {
  const url = new URL(u);
  url.searchParams.set('connection_limit', '5');
  url.searchParams.set('pool_timeout', '10');
  console.log('URL parsed OK');
  console.log('  host:', url.hostname);
  console.log('  pathname:', url.pathname);
  console.log('  params:', url.searchParams.toString());
} catch (e) {
  console.error('URL parse failed:', e.message);
}
