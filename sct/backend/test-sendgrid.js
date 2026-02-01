import sgMail from '@sendgrid/mail';
import dotenv from 'dotenv';

dotenv.config();

const testSendGrid = async () => {
  console.log('Testing SendGrid configuration...\n');
  
  if (!process.env.SENDGRID_API_KEY) {
    console.error('❌ SENDGRID_API_KEY not found in .env');
    process.exit(1);
  }
  
  console.log('✅ API Key found:', process.env.SENDGRID_API_KEY.substring(0, 15) + '...');
  
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  
  const msg = {
    to: 'admin@srichendur.com', // Change to your actual email
    from: process.env.SENDGRID_FROM_EMAIL || 'noreply@srichendur.com',
    subject: 'Test Email from Sri Chendur Traders',
    text: 'If you receive this, SendGrid is working!',
    html: '<strong>If you receive this, SendGrid is working!</strong>',
  };
  
  try {
    console.log('\n📧 Sending test email to:', msg.to);
    console.log('📧 From:', msg.from);
    
    const response = await sgMail.send(msg);
    console.log('\n✅ Email sent successfully!');
    console.log('Response:', response[0].statusCode);
  } catch (error) {
    console.error('\n❌ Failed to send email:');
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Response body:', error.response.body);
    }
  }
};

testSendGrid();
