const { sendAdminNewCampaignWhatsapp } = require('./services/whatsappService');
sendAdminNewCampaignWhatsapp("Test Campaign", "Test User")
  .then(() => console.log("Done"))
  .catch(e => console.error("Error", e));
