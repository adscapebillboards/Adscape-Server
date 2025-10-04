const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const DATABASE_URL =
  // "postgresql://adscape_user:GfYobxNJofTLXCxPlKCbQw3bWGqLLvlS@dpg-d37pikffte5s73bfpg3g-a.oregon-postgres.render.com/adscape";
// const DATABASE_URL =
  "postgresql://avnadmin:AVNS_07USf4r803Jrdm6vAva@billboard-srinnivassh-7657.l.aivencloud.com:16921/defaultdb?sslmode=require";

// Typed global to store Prisma instance
const globalForPrisma = global;

if (!globalForPrisma.prisma) {
  globalForPrisma.prisma = new PrismaClient({
    datasources: {
      db: { url: DATABASE_URL },
    },
  });
}

const prisma = globalForPrisma.prisma;

module.exports = prisma;
