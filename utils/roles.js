const SUPERADMIN_ROLES = ['superadmin', 'developer'];

function normalizeRole(role) {
  return String(role || '').trim().toLowerCase();
}

function isSuperAdminRole(role) {
  return SUPERADMIN_ROLES.includes(normalizeRole(role));
}

function expandAllowedRoles(allowedRoles = []) {
  const normalized = allowedRoles.map(normalizeRole);
  return normalized.includes('superadmin')
    ? Array.from(new Set([...normalized, 'developer']))
    : normalized;
}

module.exports = {
  SUPERADMIN_ROLES,
  normalizeRole,
  isSuperAdminRole,
  expandAllowedRoles
};
