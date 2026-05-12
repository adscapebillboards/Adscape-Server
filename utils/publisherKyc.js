function getPermissionsObject(publisher) {
  const perms = publisher?.permissions;
  if (!perms) return {};
  if (typeof perms === 'object') return perms;
  try {
    return JSON.parse(perms);
  } catch {
    return {};
  }
}

function isPublisherKycComplete(publisher) {
  const perms = getPermissionsObject(publisher);
  if (perms.kycCompleted === true) return true;

  const business = publisher?.businessInfo || {};
  const required = ['companyName', 'businessType', 'address', 'city', 'state', 'pincode'];
  const hasRequired = required.every((k) => {
    const v = business?.[k];
    return typeof v === 'string' ? v.trim().length > 0 : Boolean(v);
  });

  const docs = business?.documents || {};
  const hasLicense = typeof docs?.businessLicense === 'string' && docs.businessLicense.trim().length > 0;

  return hasRequired && hasLicense;
}

module.exports = {
  getPermissionsObject,
  isPublisherKycComplete,
};

