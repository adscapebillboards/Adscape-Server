const nodemailer = require('nodemailer');
const logger = require('../config/logger');

// Email sending
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'srinnivassh@gmail.com',
    pass: 'jjcg edwl picz rrqw',
  },
});

const sendEmail = (req, res) => {
  const { name, email, phone, company, message } = req.body;

  const mailOptions = {
    from: `"${name}" <${email}>`,
    to: 'sabharishhari@gmail.com',
    subject: 'New Contact Form Submission',
    html: `
      <h3>Contact Details</h3>
      <p><strong>Name:</strong> ${name}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Phone:</strong> ${phone}</p>
      <p><strong>Company:</strong> ${company}</p>
      <p><strong>Message:</strong> ${message}</p>
    `,
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      logger.error('Error sending email:', error);
      res.status(500).json({ success: false, message: 'Failed to send email' });
    } else {
      logger.info('Email sent:', info.response);
      res.status(200).json({ success: true, message: 'Email sent successfully' });
    }
  });
};

module.exports = {
  sendEmail
}; 