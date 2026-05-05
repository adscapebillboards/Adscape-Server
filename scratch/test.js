const { getBillboardSlots } = require('../controllers/availabilityController');
const prisma = require('../db/db');
const req = { 
  params: { billboardId: '1777558547368' }, 
  query: { start: '2026-05-04', end: '2026-05-10' } 
};
const res = { 
  json: (data) => console.log(JSON.stringify(data, null, 2)), 
  status: (code) => { console.log('Status:', code); return res; }
};
getBillboardSlots(req, res)
  .catch(console.error)
  .finally(() => prisma.$disconnect());
