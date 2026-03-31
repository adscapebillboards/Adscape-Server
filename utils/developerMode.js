const prisma = require('../db/db');

function normalizePermissions(permissions) {
  if (permissions && typeof permissions === 'object' && !Array.isArray(permissions)) {
    return permissions;
  }
  return {};
}

function readDeveloperMode(permissions) {
  const safe = normalizePermissions(permissions);
  return Boolean(
    safe.developerMode === true ||
    safe.system?.developerMode === true
  );
}

async function getDeveloperMode() {
  const superadmin = await prisma.publisher.findFirst({
    where: {
      role: 'superadmin',
      status: 'active'
    },
    orderBy: {
      id: 'asc'
    },
    select: {
      permissions: true
    }
  });

  return readDeveloperMode(superadmin?.permissions);
}

async function setDeveloperMode(enabled) {
  const superadmins = await prisma.publisher.findMany({
    where: {
      role: 'superadmin'
    },
    select: {
      id: true,
      permissions: true
    }
  });

  for (const admin of superadmins) {
    const current = normalizePermissions(admin.permissions);
    await prisma.publisher.update({
      where: { id: admin.id },
      data: {
        permissions: {
          ...current,
          developerMode: enabled,
          system: {
            ...(current.system && typeof current.system === 'object' ? current.system : {}),
            developerMode: enabled
          }
        }
      }
    });
  }

  return enabled;
}

module.exports = {
  getDeveloperMode,
  setDeveloperMode,
  readDeveloperMode
};
