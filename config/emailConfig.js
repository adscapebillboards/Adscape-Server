// Email notification configuration
module.exports = {
  // Enable/disable email notifications globally
  enabled:'true', // Default to true unless explicitly set to 'false'
  
  // Email service configuration
  service: 'gmail',
  user:  'adscapebillboards@gmail.com',
  pass: 'fxyb wytt komo msdc',
  
  // Notification types configuration
  notifications: {
    campaignCreated: {
      enabled:  'true', // Default to true
      recipients: 'superadmin' // Who receives this notification
    },
    campaignCreatedUser: {
      enabled:  'true', // Default to true
      recipients: 'user' // Who receives this notification
    },
    campaignNameUpdated: {
      enabled:  'true', // Default to true
      recipients: 'superadmin' // Who receives this notification
    },
    billboardApproved: {
      enabled: 'true', // Default to true
      recipients: 'user' // Who receives this notification
    },
    billboardRejected: {
      enabled:'true', // Default to true
      recipients: 'user' // Who receives this notification
    },
    publisherAccountCreated: {
      enabled: 'true', // Default to true
      recipients: 'superadmin' // Who receives this notification
    },
    billboardVerificationRequest: {
      enabled:  'true', // Default to true
      recipients: 'superadmin' // Who receives this notification
    }
  },
  
  // Email template settings
  templates: {
    companyName: 'Adscape',
    supportEmail:  'adscapebillboards@gmail.com',
    adminPanelUrl: 'https://www.adscapebillboards.com'
  }
};
