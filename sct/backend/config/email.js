import nodemailer from 'nodemailer';
import sgMail from '@sendgrid/mail';

// Create reusable transporter
let transporter = null;
let useSendGrid = false;

const initializeEmailTransporter = () => {
  if (transporter) return transporter;

  // Option 1: SendGrid (Easiest - just API key)
  if (process.env.SENDGRID_API_KEY) {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    useSendGrid = true;
    console.log('✅ Email service initialized (SendGrid)');
    return 'sendgrid';
  }

  // Option 2: Gmail SMTP
  if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
    console.log('✅ Email service initialized (Gmail)');
    return transporter;
  }

  console.warn('⚠️  Email not configured. Set SENDGRID_API_KEY or EMAIL_USER/EMAIL_PASS in .env');
  return null;
};

// Send password reset email
export const sendPasswordResetEmail = async (toEmail, resetCode, userName = 'User') => {
  const emailTransporter = initializeEmailTransporter();
  
  if (!emailTransporter) {
    console.log(`Development Mode: Reset code for ${toEmail}: ${resetCode}`);
    return { success: false, devMode: true, code: resetCode };
  }

  const emailHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .code-box { background: white; border: 2px dashed #667eea; padding: 20px; text-align: center; margin: 20px 0; border-radius: 8px; }
          .code { font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #667eea; }
          .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #999; }
          .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔐 Password Reset Request</h1>
          </div>
          <div class="content">
            <p>Hi <strong>${userName}</strong>,</p>
            <p>You requested to reset your password for <strong>Sri Chendur Traders Finance System</strong>.</p>
            
            <div class="code-box">
              <p style="margin: 0; font-size: 14px; color: #666;">Your verification code is:</p>
              <div class="code">${resetCode}</div>
            </div>

            <div class="warning">
              <strong>⏰ Important:</strong> This code will expire in <strong>15 minutes</strong>.
            </div>

            <p><strong>What to do next:</strong></p>
            <ol>
              <li>Go back to the login page</li>
              <li>Enter this 6-digit code</li>
              <li>Create your new password</li>
            </ol>

            <p style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd;">
              <strong>Didn't request this?</strong><br>
              If you didn't request a password reset, please ignore this email or contact your administrator. Your password will remain unchanged.
            </p>
          </div>
          <div class="footer">
            <p>© 2026 Sri Chendur Traders | Finance Operating System</p>
            <p>This is an automated message, please do not reply to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `;

  try {
    if (useSendGrid) {
      // SendGrid method
      const msg = {
        to: toEmail,
        from: process.env.SENDGRID_FROM_EMAIL || 'noreply@srichendur.com',
        subject: 'Password Reset Request - Sri Chendur Traders',
        html: emailHTML,
      };
      await sgMail.send(msg);
    } else {
      // Nodemailer method
      const mailOptions = {
        from: `"Sri Chendur Traders" <${process.env.EMAIL_USER}>`,
        to: toEmail,
        subject: 'Password Reset Request - Sri Chendur Traders',
        html: emailHTML,
      };
      await emailTransporter.sendMail(mailOptions);
    }
    
    console.log(`✅ Password reset email sent to ${toEmail}`);
    return { success: true };
  } catch (error) {
    console.error('❌ Failed to send email:', error.message);
    throw new Error('Failed to send reset email. Please try again later.');
  }
};

// Test email configuration
export const testEmailConnection = async () => {
  const emailTransporter = initializeEmailTransporter();
  
  if (!emailTransporter) {
    return { success: false, message: 'Email not configured' };
  }

  if (useSendGrid) {
    return { success: true, message: 'SendGrid email service is ready' };
  }

  try {
    await emailTransporter.verify();
    return { success: true, message: 'Email service is ready' };
  } catch (error) {
    return { success: false, message: error.message };
  }
};
