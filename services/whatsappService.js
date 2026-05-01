const logger = require('../config/logger');

const sendAdminNewCampaignWhatsapp = async (campaignName, userName) => {
  const webhookUrl = "https://api.convobox.in/api/templates/webhooks/2496074127455715/1959971401556479";
  const superAdminNo = "9443932288";

  try {
    const payload = {
      receiver: superAdminNo,
      values: {
        "Body_{{1}}": campaignName || "Untitled Campaign",
        "Body_{{2}}": userName || "Unknown User"
      }
    };

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`WhatsApp notification failed: ${response.status} ${response.statusText}`, errorText);
    } else {
      logger.info(`WhatsApp notification sent for new campaign: ${campaignName}`);
    }
  } catch (error) {
    logger.error("Error sending WhatsApp notification:", error);
  }
};

module.exports = {
  sendAdminNewCampaignWhatsapp
};
