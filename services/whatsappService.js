const logger = require('../config/logger');
const axios = require('axios');

const sendAdminNewCampaignWhatsapp = async (campaignName, userName) => {
  const webhookUrl = "https://api.convobox.in/api/templates/webhooks/2496074127455715/1959971401556479";
  const superAdminNo = "9994770276";

  try {
    const payload = {
      receiver: superAdminNo,
      values: {
        "Body_{{1}}": campaignName || "Untitled Campaign",
        "Body_{{2}}": userName || "Unknown User"
      }
    };

    const response = await axios.post(webhookUrl, payload, {
      headers: {
        "Content-Type": "application/json"
      },
      timeout: 5000 // Add a 5 second timeout so it doesn't hang indefinitely
    });

    logger.info(`WhatsApp notification sent for new campaign: ${campaignName}`);
  } catch (error) {
    logger.error("Error sending WhatsApp notification:", error.response?.data || error.message);
  }
};

module.exports = {
  sendAdminNewCampaignWhatsapp
};
