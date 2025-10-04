const nodemailer = require('nodemailer');
const logger = require('../config/logger');
const emailConfig = require('../config/emailConfig');
const SuperAdminEmailService = require('./superadminEmailService');
const EmailNotificationLogger = require('./emailNotificationLogger');

// Email transporter configuration
const transporter = nodemailer.createTransport({
  service: emailConfig.service,
  auth: {
    user: emailConfig.user,
    pass: emailConfig.pass,
  },
  // Add timeout configuration to prevent timeouts
  connectionTimeout: 30000, // 30 seconds
  greetingTimeout: 30000,   // 30 seconds
  socketTimeout: 30000,     // 30 seconds
});

// Email templates
const emailTemplates = {
  // Campaign creation notification to superadmin
campaignCreated: (campaignData) => ({
  subject: `🎯 New Campaign "${campaignData.campaignName}" - Action Required`,
  html: `
    <div style="font-family: 'Segoe UI', Roboto, Arial, sans-serif; max-width: 640px; margin: 0 auto; background-color: #f4f6fb; padding: 40px;">
      <div style="background: #ffffff; border-radius: 14px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
        
        <!-- Header -->
        <div style="background: linear-gradient(90deg, #0061ff, #60efff); padding: 24px; text-align: center; color: #fff;">
          <h2 style="margin: 0; font-size: 22px; font-weight: 600;">📢 New Campaign Created</h2>
          <p style="margin: 6px 0 0; font-size: 14px; opacity: 0.9;">Review & approve to proceed</p>
        </div>
        
        <!-- Campaign Info -->
        <div style="padding: 28px;">
          <h3 style="color: #1e293b; margin: 0 0 16px; font-size: 17px;">Campaign Details</h3>
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 18px 20px; border-radius: 10px;">
            <p style="margin: 6px 0; font-size: 14px;"><strong>ID:</strong> ${campaignData.id}</p>
            <p style="margin: 6px 0; font-size: 14px;"><strong>User:</strong> ${campaignData.userName}</p>
            <p style="margin: 6px 0; font-size: 14px;"><strong>Campaign Name:</strong> <span style="color: #0061ff; font-weight: 600;">${campaignData.campaignName}</span></p>
            <p style="margin: 6px 0; font-size: 14px;"><strong>Total Amount:</strong> ₹${campaignData.totalAmount}</p>
            <p style="margin: 6px 0; font-size: 14px;"><strong>Start Date:</strong> ${new Date(campaignData.startDate).toLocaleDateString()}</p>
            <p style="margin: 6px 0; font-size: 14px;"><strong>End Date:</strong> ${new Date(campaignData.endDate).toLocaleDateString()}</p>
            <p style="margin: 6px 0; font-size: 14px;"><strong>Billboards:</strong> ${campaignData.billboards?.length || 0}</p>
            <p style="margin: 6px 0; font-size: 14px;"><strong>Status:</strong> <span style="color: #e67e22; font-weight: 600;">${campaignData.status}</span></p>
          </div>
        </div>

        <!-- Next Steps -->
        <div style="background-color: #fff8e6; padding: 16px 20px; border-radius: 10px; border-left: 5px solid #f59e0b; margin: 0 28px 24px;">
          <p style="margin: 0; font-size: 14px; color: #92400e;">
            ⚠️ <strong>Action Required:</strong> This campaign is pending review. Please approve or reject it in the admin panel.
          </p>
        </div>

        <!-- CTA -->
        <div style="text-align: center; margin-bottom: 30px;">
          <a href="${emailConfig.templates.adminPanelUrl}" 
             style="display: inline-block; background: linear-gradient(90deg, #7c3aed, #4f46e5); color: #fff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 14px;">
            Review Campaign
          </a>
        </div>
        
        <!-- Footer -->
        <div style="padding: 20px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #f1f5f9;">
          This is an automated notification from <strong>${emailConfig.templates.companyName}</strong>.
        </div>
      </div>
    </div>
  `
}),




  // Campaign billboard approval notification to user
 billboardApproved: (campaignData, billboardData) => ({
  subject: '✅ Campaign Billboard Approved Successfully!',
  html: `
    <div style="font-family: 'Segoe UI', Roboto, Arial, sans-serif; max-width: 640px; margin: 0 auto; background-color: #f4f6fb; padding: 40px;">
      
      <!-- Header -->
      <div style="background: linear-gradient(90deg, #22c55e, #15803d); padding: 24px; border-radius: 14px 14px 0 0; text-align: center; color: #fff;">
        <h2 style="margin: 0; font-size: 22px; font-weight: 600;">🎉 Billboard Approved!</h2>
        <p style="margin: 6px 0 0; font-size: 14px; opacity: 0.9;">Your campaign is now live-ready</p>
      </div>

      <!-- Main Content -->
      <div style="background: #ffffff; padding: 30px; border-radius: 0 0 14px 14px; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
        
        <!-- Campaign Info -->
        <div style="background-color: #ecfdf5; padding: 20px; border-radius: 10px; margin-bottom: 20px; border: 1px solid #a7f3d0;">
          <h3 style="color: #047857; margin-top: 0; font-size: 16px;">Campaign Information</h3>
          <p style="margin: 6px 0;"><strong>Campaign Name:</strong> ${campaignData.campaignName || 'Auto Campaign'}</p>
          <p style="margin: 6px 0;"><strong>Campaign ID:</strong> ${campaignData.id}</p>
          <p style="margin: 6px 0;"><strong>Status:</strong> <span style="color: #16a34a; font-weight: 600;">${campaignData.status}</span></p>
        </div>
        
        <!-- Billboard Info -->
        <div style="background-color: #f8f9ff; padding: 20px; border-radius: 10px; margin-bottom: 20px; border: 1px solid #eef1ff;">
          <h3 style="color: #4f46e5; margin-top: 0; font-size: 16px;">Billboard Details</h3>
          <p style="margin: 6px 0;"><strong>Location:</strong> ${billboardData?.location || 'N/A'}</p>
          <p style="margin: 6px 0;"><strong>City:</strong> ${billboardData?.city || 'N/A'}</p>
          <p style="margin: 6px 0;"><strong>Price Per Day:</strong> ₹${billboardData?.pricePerDay || 'N/A'}</p>
          <p style="margin: 6px 0;"><strong>Total Price:</strong> ₹${billboardData?.totalPrice || 'N/A'}</p>
          <p style="margin: 6px 0;"><strong>Start Date:</strong> ${billboardData?.bookingDetails?.startDate ? new Date(billboardData.bookingDetails.startDate).toLocaleDateString() : 'N/A'}</p>
          <p style="margin: 6px 0;"><strong>End Date:</strong> ${billboardData?.bookingDetails?.endDate ? new Date(billboardData.bookingDetails.endDate).toLocaleDateString() : 'N/A'}</p>
        </div>

        <!-- Next Steps -->
        <div style="background-color: #eff6ff; padding: 15px 20px; border-radius: 10px; border-left: 5px solid #3b82f6; margin-bottom: 20px;">
          <p style="margin: 0; color: #1e3a8a; font-size: 14px;">
            <strong>📺 Next Steps:</strong> Your billboard is now approved and scheduled for display. 
            You can monitor and track performance anytime in your dashboard.
          </p>
        </div>

        <!-- CTA -->
        <div style="text-align: center; margin-top: 25px;">
          <a href="${emailConfig.templates.dashboardUrl}/campaigns/${campaignData.id}" 
             style="display: inline-block; background: linear-gradient(90deg, #7c3aed, #4f46e5); color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 14px;">
             View Campaign
          </a>
        </div>

        <!-- Footer -->
        <div style="text-align: center; margin-top: 25px;">
          <p style="color: #94a3b8; font-size: 13px; line-height: 1.5;">
            Thank you for choosing <strong>${emailConfig.templates.companyName}</strong> 🚀
          </p>
        </div>
      </div>
    </div>
  `
}),


  // Campaign billboard rejection notification to user
 billboardRejected: (campaignData, billboardData, rejectionReason) => ({
  subject: '❌ Campaign Billboard Rejected - Action Required',
  html: `
    <div style="font-family: 'Segoe UI', Roboto, Arial, sans-serif; max-width: 640px; margin: 0 auto; background-color: #f4f6fb; padding: 40px;">
      
      <!-- Header -->
      <div style="background: linear-gradient(90deg, #ef4444, #b91c1c); padding: 24px; border-radius: 14px 14px 0 0; text-align: center; color: #fff;">
        <h2 style="margin: 0; font-size: 22px; font-weight: 600;">⚠️ Billboard Rejected</h2>
        <p style="margin: 6px 0 0; font-size: 14px; opacity: 0.9;">Action Required</p>
      </div>

      <!-- Main Content -->
      <div style="background: #ffffff; padding: 30px; border-radius: 0 0 14px 14px; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
        
        <!-- Campaign Info -->
        <div style="background-color: #fdecea; padding: 20px; border-radius: 10px; margin-bottom: 20px; border: 1px solid #f5c6cb;">
          <h3 style="color: #b91c1c; margin-top: 0; font-size: 16px;">Campaign Information</h3>
          <p style="margin: 6px 0;"><strong>Campaign Name:</strong> ${campaignData.campaignName || 'Auto Campaign'}</p>
          <p style="margin: 6px 0;"><strong>Campaign ID:</strong> ${campaignData.id}</p>
          <p style="margin: 6px 0;"><strong>Status:</strong> <span style="color: #dc2626; font-weight: 600;">${campaignData.status}</span></p>
        </div>
        
        <!-- Billboard Info -->
        <div style="background-color: #f8f9ff; padding: 20px; border-radius: 10px; margin-bottom: 20px; border: 1px solid #eef1ff;">
          <h3 style="color: #4f46e5; margin-top: 0; font-size: 16px;">Billboard Details</h3>
          <p style="margin: 6px 0;"><strong>Location:</strong> ${billboardData?.location || 'N/A'}</p>
          <p style="margin: 6px 0;"><strong>City:</strong> ${billboardData?.city || 'N/A'}</p>
          <p style="margin: 6px 0;"><strong>Price Per Day:</strong> ₹${billboardData?.pricePerDay || 'N/A'}</p>
          <p style="margin: 6px 0;"><strong>Total Price:</strong> ₹${billboardData?.totalPrice || 'N/A'}</p>
        </div>

        <!-- Rejection Reason -->
        <div style="background-color: #fff8e6; padding: 15px 20px; border-radius: 10px; border-left: 5px solid #facc15; margin-bottom: 20px;">
          <p style="margin: 0; color: #92400e; font-size: 14px;">
            <strong>❌ Rejection Reason:</strong> ${rejectionReason || 'No specific reason provided'}
          </p>
        </div>
        
        <!-- Next Steps -->
        <div style="background-color: #ecfdf5; padding: 15px 20px; border-radius: 10px; border-left: 5px solid #10b981; margin-bottom: 20px;">
          <p style="margin: 0; color: #065f46; font-size: 14px;">
            <strong>🔧 Next Steps:</strong> Please review the rejection reason and update your campaign. 
            You can resubmit your billboard once the issues are resolved.
          </p>
        </div>
        
        <!-- CTA -->
        <div style="text-align: center; margin-top: 25px;">
          <a href="${emailConfig.templates.dashboardUrl}/campaigns/${campaignData.id}" 
             style="display: inline-block; background: linear-gradient(90deg, #7c3aed, #4f46e5); color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 14px;">
             Review Campaign
          </a>
        </div>

        <!-- Footer -->
        <div style="text-align: center; margin-top: 25px;">
          <p style="color: #94a3b8; font-size: 13px; line-height: 1.5;">
            If you have any questions, please contact <strong>${emailConfig.templates.companyName}</strong> support.
          </p>
        </div>
      </div>
    </div>
  `
}),


  // Publisher account creation notification to superadmin
  publisherAccountCreated: (publisherData) => ({
  subject: '👤 New Publisher Account Created - Review Required',
  html: `
    <div style="font-family: 'Segoe UI', Roboto, Arial, sans-serif; max-width: 640px; margin: 0 auto; background-color: #f4f6fb; padding: 40px;">
      
      <!-- Header -->
      <div style="background: linear-gradient(90deg, #7c3aed, #4f46e5); padding: 24px; border-radius: 14px 14px 0 0; text-align: center; color: #fff;">
        <h2 style="margin: 0; font-size: 22px; font-weight: 600;">📝 New Publisher Registration</h2>
        <p style="margin: 6px 0 0; font-size: 14px; opacity: 0.9;">Review Required</p>
      </div>

      <!-- Main Content -->
      <div style="background: #ffffff; padding: 30px; border-radius: 0 0 14px 14px; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
        
        <!-- Publisher Details -->
        <div style="background-color: #f8f9ff; padding: 20px; border-radius: 10px; margin-bottom: 20px; border: 1px solid #eef1ff;">
          <h3 style="color: #4f46e5; margin-top: 0; margin-bottom: 15px; font-size: 16px;">Publisher Details</h3>
          <p style="margin: 6px 0;"><strong>Name:</strong> ${publisherData.name || 'N/A'}</p>
          <p style="margin: 6px 0;"><strong>Email:</strong> ${publisherData.email || 'N/A'}</p>
          <p style="margin: 6px 0;"><strong>Phone:</strong> ${publisherData.phone || 'N/A'}</p>
          <p style="margin: 6px 0;"><strong>Business Name:</strong> ${publisherData.businessName || 'N/A'}</p>
          <p style="margin: 6px 0;"><strong>Registration Date:</strong> ${new Date().toLocaleDateString()}</p>
        </div>
        
        <!-- Action Required -->
        <div style="background-color: #fff8e6; padding: 15px 20px; border-radius: 10px; border-left: 5px solid #facc15; margin-bottom: 20px;">
          <p style="margin: 0; color: #92400e; font-size: 14px;">
            <strong>⚠️ Action Required:</strong> A new publisher has registered. Please review their account and approve/reject as needed.
          </p>
        </div>
        
        <!-- Footer -->
        <div style="text-align: center; margin-top: 25px;">
          <p style="color: #94a3b8; font-size: 13px; line-height: 1.5;">
            This is an automated notification from the <strong>${emailConfig.templates.companyName}</strong> system.
          </p>
        </div>
      </div>
    </div>
  `
}),


  // Billboard verification request notification to superadmin
  billboardVerificationRequest: (billboardData) => ({
  subject: '🖼️ New Billboard Verification Request',
  html: `
    <div style="font-family: 'Segoe UI', Roboto, Arial, sans-serif; max-width: 640px; margin: 0 auto; background-color: #f4f6fb; padding: 40px;">
      
      <!-- Header -->
      <div style="background: linear-gradient(90deg, #7c3aed, #4f46e5); padding: 24px; border-radius: 14px 14px 0 0; text-align: center; color: #fff;">
        <h2 style="margin: 0; font-size: 22px; font-weight: 600;">📋 Billboard Verification Request</h2>
        <p style="margin: 6px 0 0; font-size: 14px; opacity: 0.9;">Action Required</p>
      </div>

      <!-- Main Content -->
      <div style="background: #ffffff; padding: 30px; border-radius: 0 0 14px 14px; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
        
        <!-- Billboard Details -->
        <div style="background-color: #f8f9ff; padding: 20px; border-radius: 10px; margin-bottom: 20px; border: 1px solid #eef1ff;">
          <h3 style="color: #4f46e5; margin-top: 0; margin-bottom: 15px; font-size: 16px;">Billboard Details</h3>
          <p style="margin: 6px 0;"><strong>Location:</strong> ${billboardData.location || 'N/A'}</p>
          <p style="margin: 6px 0;"><strong>City:</strong> ${billboardData.city || 'N/A'}</p>
          <p style="margin: 6px 0;"><strong>Publisher:</strong> ${billboardData.publisherName || 'N/A'}</p>
          <p style="margin: 6px 0;"><strong>Price Per Day:</strong> ₹${billboardData.pricePerDay || 'N/A'}</p>
          <p style="margin: 6px 0;"><strong>Request Date:</strong> ${new Date().toLocaleDateString()}</p>
        </div>
        
        <!-- Action Required -->
        <div style="background-color: #fff8e6; padding: 15px 20px; border-radius: 10px; border-left: 5px solid #facc15; margin-bottom: 20px;">
          <p style="margin: 0; color: #92400e; font-size: 14px;">
            <strong>⚠️ Action Required:</strong> A new billboard verification request has been submitted. Please review and approve/reject.
          </p>
        </div>
        
        <!-- Footer -->
        <div style="text-align: center; margin-top: 25px;">
          <p style="color: #94a3b8; font-size: 13px; line-height: 1.5;">
            This is an automated notification from the <strong>${emailConfig.templates.companyName}</strong> system.
          </p>
        </div>
      </div>
    </div>
  `
}),


  // Campaign creation confirmation to user
campaignCreatedUser: (campaignData) => ({
  subject: `🎉 Campaign "${campaignData.campaignName}" Created Successfully!`,
  html: `
    <div style="font-family: 'Segoe UI', Roboto, Arial, sans-serif; max-width: 640px; margin: 0 auto; background-color: #f4f6fb; padding: 40px;">
      
      <!-- Header -->
      <div style="background: linear-gradient(90deg, #7c3aed, #4f46e5); padding: 24px; border-radius: 14px 14px 0 0; text-align: center; color: #fff;">
        <h2 style="margin: 0; font-size: 22px; font-weight: 600;">🎯 Campaign Confirmation</h2>
        <p style="margin: 6px 0 0; font-size: 14px; opacity: 0.9;">Created Successfully</p>
      </div>

      <!-- Main Content -->
      <div style="background: #ffffff; padding: 30px; border-radius: 0 0 14px 14px; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
        
        <!-- Campaign Details -->
        <div style="background-color: #f8f9ff; padding: 20px; border-radius: 10px; margin-bottom: 20px; border: 1px solid #eef1ff;">
          <h3 style="color: #4f46e5; margin-top: 0; margin-bottom: 15px; font-size: 16px;">Campaign Details</h3>
          <p style="margin: 6px 0;"><strong>Campaign ID:</strong> ${campaignData.id}</p>
          <p style="margin: 6px 0;"><strong>Campaign Name:</strong> <span style="color: #9333ea; font-weight: 600;">${campaignData.campaignName}</span></p>
          <p style="margin: 6px 0;"><strong>Total Amount:</strong> ₹${campaignData.totalAmount}</p>
          <p style="margin: 6px 0;"><strong>Start Date:</strong> ${new Date(campaignData.startDate).toLocaleDateString()}</p>
          <p style="margin: 6px 0;"><strong>End Date:</strong> ${new Date(campaignData.endDate).toLocaleDateString()}</p>
          <p style="margin: 6px 0;"><strong>Billboards:</strong> ${campaignData.billboards?.length || 0}</p>
          <p style="margin: 6px 0;"><strong>Status:</strong> <span style="color: #9333ea; font-weight: 600;">${campaignData.status}</span></p>
        </div>
        
        <!-- Next Steps -->
        <div style="background-color: #ecfdf5; padding: 15px 20px; border-radius: 10px; border-left: 5px solid #10b981; margin-bottom: 20px;">
          <p style="margin: 0; color: #065f46; font-size: 14px;">
            <strong>📋 Next Steps:</strong> Your campaign "${campaignData.campaignName}" has been created and is now under review. 
            You will receive notifications when your billboards are approved or rejected.
          </p>
        </div>
        
        <!-- Tip -->
        <div style="background-color: #fff8e6; padding: 15px 20px; border-radius: 10px; border-left: 5px solid #facc15; margin-bottom: 20px;">
          <p style="margin: 0; color: #92400e; font-size: 14px;">
            <strong>💡 Tip:</strong> You can track your campaign status in your dashboard and make changes if needed.
          </p>
        </div>
        
        <!-- Footer -->
        <div style="text-align: center; margin-top: 25px;">
          <p style="color: #94a3b8; font-size: 13px; line-height: 1.5;">
            Thank you for choosing <strong>${emailConfig.templates.companyName}</strong>!
          </p>
        </div>
      </div>
    </div>
  `
}),


  // Campaign name updated notification to superadmin
 campaignNameUpdated: (campaignData) => ({
  subject: '📝 Campaign Name Updated - Review Required',
  html: `
    <div style="font-family: 'Segoe UI', Roboto, Arial, sans-serif; max-width: 640px; margin: 0 auto; background-color: #f4f6fb; padding: 40px;">
      
      <!-- Header -->
      <div style="background: linear-gradient(90deg, #7c3aed, #4f46e5); padding: 24px; border-radius: 14px 14px 0 0; text-align: center; color: #fff;">
        <h2 style="margin: 0; font-size: 22px; font-weight: 600;">📝 Campaign Name Updated</h2>
        <p style="margin: 6px 0 0; font-size: 14px; opacity: 0.9;">Review Required</p>
      </div>

      <!-- Main Content -->
      <div style="background: #ffffff; padding: 30px; border-radius: 0 0 14px 14px; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
        
        <!-- Campaign Details -->
        <div style="background-color: #f8f9ff; padding: 20px; border-radius: 10px; margin-bottom: 20px; border: 1px solid #eef1ff;">
          <h3 style="color: #4f46e5; margin-top: 0; margin-bottom: 15px; font-size: 16px;">Updated Campaign Details</h3>
          <p style="margin: 6px 0;"><strong>Campaign ID:</strong> ${campaignData.id}</p>
          <p style="margin: 6px 0;"><strong>User:</strong> ${campaignData.userName}</p>
          <p style="margin: 6px 0;"><strong>New Campaign Name:</strong> <span style="color: #9333ea; font-weight: 600;">${campaignData.campaignName}</span></p>
          <p style="margin: 6px 0;"><strong>Total Amount:</strong> ₹${campaignData.totalAmount}</p>
          <p style="margin: 6px 0;"><strong>Start Date:</strong> ${new Date(campaignData.startDate).toLocaleDateString()}</p>
          <p style="margin: 6px 0;"><strong>End Date:</strong> ${new Date(campaignData.endDate).toLocaleDateString()}</p>
          <p style="margin: 6px 0;"><strong>Billboards:</strong> ${campaignData.billboards?.length || 0}</p>
          <p style="margin: 6px 0;"><strong>Status:</strong> <span style="color: #9333ea; font-weight: 600;">${campaignData.status}</span></p>
        </div>
        
        <!-- Action Required -->
        <div style="background-color: #fff8e6; padding: 15px 20px; border-radius: 10px; border-left: 5px solid #facc15; margin-bottom: 20px;">
          <p style="margin: 0; color: #92400e; font-size: 14px;">
            <strong>⚠️ Action Required:</strong> A campaign name has been updated. Please review the campaign details and approve/reject individual billboards.
          </p>
        </div>
        
        <!-- Footer -->
        <div style="text-align: center; margin-top: 25px;">
          <p style="color: #94a3b8; font-size: 13px; line-height: 1.5;">
            This is an automated notification from the <strong>${emailConfig.templates.companyName}</strong> system.
          </p>
        </div>
      </div>
    </div>
  `
})

};

class EmailService {
  // Check if email notifications are globally enabled
  static isEnabled() {
    return emailConfig.enabled === 'true';
  }

  // Check if specific notification type is enabled
  static isNotificationEnabled(notificationType) {
    return emailConfig.notifications[notificationType]?.enabled === 'true';
  }

  // Get email configuration
  static getConfig() {
    return {
      enabled: emailConfig.enabled,
      service: emailConfig.service,
      user: emailConfig.user,
      notifications: emailConfig.notifications
    };
  }

  // Send email notification
  static async sendEmail(to, template, data) {
    // Check if email notifications are enabled
    if (!this.isEnabled()) {
      logger.info(`Email notifications are disabled. Skipping email to ${to}`);
      // Log as disabled
      await EmailNotificationLogger.logNotification({
        notificationType: template,
        recipientEmail: to,
        subject: `[DISABLED] ${template}`,
        data: data
      });
      return { success: false, error: 'Email notifications are disabled' };
    }

    let logEntry = null;
    try {
      const emailContent = emailTemplates[template](data);
      
      // Log the notification attempt
      logEntry = await EmailNotificationLogger.logNotification({
        notificationType: template,
        recipientEmail: to,
        subject: emailContent.subject,
        data: data
      });
      
      const mailOptions = {
        from: `"${emailConfig.templates.companyName}" <${emailConfig.user}>`,
        to: to,
        subject: emailContent.subject,
        html: emailContent.html
      };

      // Add timeout to prevent hanging
      const sendMailPromise = transporter.sendMail(mailOptions);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Email send timeout')), 15000); // 15 second timeout
      });
      
      const info = await Promise.race([sendMailPromise, timeoutPromise]);
      logger.info(`Email sent successfully to ${to}:`, info.messageId);
      
      // Mark as sent
      if (logEntry && logEntry.id) {
        await EmailNotificationLogger.markAsSent(logEntry.id, info.messageId);
      }
      
      return { success: true, messageId: info.messageId };
    } catch (error) {
      logger.error(`Error sending email to ${to}:`, error);
      
      // Mark as failed
      if (logEntry && logEntry.id) {
        await EmailNotificationLogger.markAsFailed(logEntry.id, error.message);
      }
      
      return { success: false, error: error.message };
    }
  }

  // Send campaign creation notification to superadmin
  static async notifyCampaignCreated(campaignData) {
    if (!this.isNotificationEnabled('campaignCreated')) {
      logger.info('Campaign creation notifications disabled. Skipping notification.');
      return;
    }

    try {
      // Get superadmin emails for campaign notifications
      const superadminEmails = await SuperAdminEmailService.getEmailsForNotificationType('campaignCreated');

      if (superadminEmails.length === 0) {
        logger.warn('No active superadmin emails found for campaign notification');
        return;
      }

      for (const emailData of superadminEmails) {
        await this.sendEmail(emailData.email, 'campaignCreated', campaignData);
      }

      logger.info(`Campaign creation notification sent to ${superadminEmails.length} superadmin emails`);
    } catch (error) {
      logger.error('Error sending campaign creation notification:', error);
    }
  }

  // Send billboard approval notification to user
  static async notifyBillboardApproved(campaignData, billboardData) {
    if (!this.isNotificationEnabled('billboardApproved')) {
      logger.info('Billboard approval notifications disabled. Skipping notification.');
      return;
    }

    try {
      // Debug: Log campaign data to see what's available
      logger.info('🔍 Campaign data for billboard approval notification:', {
        campaignId: campaignData.id,
        userName: campaignData.userName,
        campaignName: campaignData.campaignName,
        hasUserName: !!campaignData.userName,
        campaignDataKeys: Object.keys(campaignData)
      });

      const userEmail = campaignData.userName;
      if (!userEmail) {
        logger.warn('No user email found for billboard approval notification');
        return;
      }

      await this.sendEmail(userEmail, 'billboardApproved', campaignData, billboardData);
      logger.info(`Billboard approval notification sent to user: ${userEmail}`);
    } catch (error) {
      logger.error('Error sending billboard approval notification:', error);
    }
  }

  // Send billboard rejection notification to user
  static async notifyBillboardRejected(campaignData, billboardData, rejectionReason) {
    if (!this.isNotificationEnabled('billboardRejected')) {
      logger.info('Billboard rejection notifications disabled. Skipping notification.');
      return;
    }

    try {
      // Debug: Log campaign data to see what's available
      logger.info('🔍 Campaign data for billboard rejection notification:', {
        campaignId: campaignData.id,
        userName: campaignData.userName,
        campaignName: campaignData.campaignName,
        hasUserName: !!campaignData.userName,
        campaignDataKeys: Object.keys(campaignData)
      });

      const userEmail = campaignData.userName;
      if (!userEmail) {
        logger.warn('No user email found for billboard rejection notification');
        return;
      }

      await this.sendEmail(userEmail, 'billboardRejected', campaignData, billboardData, rejectionReason);
      logger.info(`Billboard rejection notification sent to user: ${userEmail}`);
    } catch (error) {
      logger.error('Error sending billboard rejection notification:', error);
    }
  }

  // Send publisher account creation notification to superadmin
  static async notifyPublisherAccountCreated(publisherData) {
    if (!this.isNotificationEnabled('publisherAccountCreated')) {
      logger.info('Publisher account creation notifications disabled. Skipping notification.');
      return;
    }

    try {
      // Get superadmin emails for publisher notifications
      const superadminEmails = await SuperAdminEmailService.getEmailsForNotificationType('publisherAccountCreated');

      if (superadminEmails.length === 0) {
        logger.warn('No active superadmin emails found for publisher notification');
        return;
      }

      for (const emailData of superadminEmails) {
        await this.sendEmail(emailData.email, 'publisherAccountCreated', publisherData);
      }

      logger.info(`Publisher account creation notification sent to ${superadminEmails.length} superadmin emails`);
    } catch (error) {
      logger.error('Error sending publisher account creation notification:', error);
    }
  }

  // Send billboard verification request notification to superadmin
  static async notifyBillboardVerificationRequest(billboardData) {
    if (!this.isNotificationEnabled('billboardVerificationRequest')) {
      logger.info('Billboard verification request notifications disabled. Skipping notification.');
      return;
    }

    try {
      // Get superadmin emails for billboard verification notifications
      const superadminEmails = await SuperAdminEmailService.getEmailsForNotificationType('billboardVerificationRequest');

      if (superadminEmails.length === 0) {
        logger.warn('No active superadmin emails found for billboard verification notification');
        return;
      }

      for (const emailData of superadminEmails) {
        await this.sendEmail(emailData.email, 'billboardVerificationRequest', billboardData);
      }

      logger.info(`Billboard verification request notification sent to ${superadminEmails.length} superadmin emails`);
    } catch (error) {
      logger.error('Error sending billboard verification request notification:', error);
    }
  }

  // Send campaign creation confirmation to user
  static async notifyCampaignCreatedUser(campaignData) {
    if (!this.isNotificationEnabled('campaignCreatedUser')) {
      logger.info('Campaign creation user notifications disabled. Skipping notification.');
      return;
    }

    try {
      const userEmail = campaignData.userName;
      if (!userEmail) {
        logger.warn('No user email found for campaign creation confirmation');
        return;
      }

      await this.sendEmail(userEmail, 'campaignCreatedUser', campaignData);
      logger.info(`Campaign creation confirmation sent to user: ${userEmail}`);
    } catch (error) {
      logger.error('Error sending campaign creation confirmation to user:', error);
    }
  }

  // Send campaign name updated notification to superadmin
  static async notifyCampaignNameUpdated(campaignData) {
    if (!this.isNotificationEnabled('campaignNameUpdated')) {
      logger.info('Campaign name update notifications disabled. Skipping notification.');
      return;
    }

    try {
      // Get superadmin emails for campaign notifications
      const superadminEmails = await SuperAdminEmailService.getEmailsForNotificationType('campaignCreated');

      if (superadminEmails.length === 0) {
        logger.warn('No active superadmin emails found for campaign name update notification');
        return;
      }

      for (const emailData of superadminEmails) {
        await this.sendEmail(emailData.email, 'campaignNameUpdated', campaignData);
      }

      logger.info(`Campaign name update notification sent to ${superadminEmails.length} superadmin emails`);
    } catch (error) {
      logger.error('Error sending campaign name update notification:', error);
    }
  }
}

module.exports = EmailService;
