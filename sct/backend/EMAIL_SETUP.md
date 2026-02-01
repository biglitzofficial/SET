# 📧 Email Setup Guide for Password Reset

## Gmail SMTP Configuration

### Step 1: Enable 2-Factor Authentication

1. Go to your Google Account: https://myaccount.google.com/
2. Click on **Security** in the left sidebar
3. Under "Signing in to Google", find **2-Step Verification**
4. Click **Get Started** and follow the setup process
5. You **must** enable 2FA before you can create App Passwords

### Step 2: Generate App Password

1. After enabling 2FA, go to: https://myaccount.google.com/apppasswords
2. You may need to sign in again
3. Under "Select app", choose **Mail**
4. Under "Select device", choose **Other (Custom name)**
5. Enter a name like: **Sri Chendur Traders Backend**
6. Click **Generate**
7. **Copy the 16-character password** (it will look like: `abcd efgh ijkl mnop`)
8. **Important:** This password is shown only once! Save it securely.

### Step 3: Update Backend Configuration

1. Open your `.env` file in the backend folder
2. Add or update these lines:

```env
# Email Configuration
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=abcdefghijklmnop
```

**Replace:**

- `your-email@gmail.com` with your actual Gmail address
- `abcdefghijklmnop` with the 16-character App Password (remove spaces)

### Step 4: Test the Configuration

Restart your backend server:

```bash
cd backend
npm run dev
```

Look for this message in the console:

```
✅ Email service initialized
```

If you see:

```
⚠️  Email not configured
```

Then check your `.env` file again.

### Step 5: Test Password Reset

1. Go to the login page
2. Click "Forgot Password?"
3. Enter an email address that exists in your system (e.g., admin@srichendur.com)
4. You should receive an email with a 6-digit code

## Troubleshooting

### "Less secure app access" - Outdated Method

Gmail no longer supports "less secure apps". You **must** use App Passwords with 2FA enabled.

### Email not sending

1. Check that 2FA is enabled on your Google account
2. Verify you used an App Password (not your regular Gmail password)
3. Check that EMAIL_USER and EMAIL_PASS are set correctly in `.env`
4. Make sure there are no spaces in the App Password
5. Restart your backend server after changing `.env`

### Wrong credentials error

- Double-check your EMAIL_USER (must be full email: user@gmail.com)
- Regenerate the App Password and try again
- Make sure you copied the entire 16-character password

### Development Mode

If email is not configured, the system will:

- Print the reset code to the backend console
- Show the reset code in the UI (development mode only)
- Still work for testing without email

## Security Notes

1. **Never commit your `.env` file to Git**
2. The `.env` file should be in `.gitignore`
3. Use different App Passwords for different environments (dev/prod)
4. You can revoke App Passwords anytime from Google Account settings
5. In production, consider using a dedicated email service like:
   - SendGrid (99% delivery rate)
   - AWS SES (Simple Email Service)
   - Mailgun
   - Postmark

## Using a Different Email Provider

### Microsoft/Outlook

```env
EMAIL_HOST=smtp-mail.outlook.com
EMAIL_PORT=587
EMAIL_USER=your-email@outlook.com
EMAIL_PASS=your-password
```

### Custom SMTP Server

Update `backend/config/email.js`:

```javascript
transporter = nodemailer.createTransport({
  host: "smtp.your-domain.com",
  port: 587,
  secure: false, // true for 465
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});
```

## Production Recommendations

For production environments, consider:

1. **Use a transactional email service** (SendGrid, AWS SES)
2. **Add email templates** with your branding
3. **Implement email queue** for better reliability
4. **Add retry logic** for failed emails
5. **Monitor email delivery rates**
6. **Set up SPF/DKIM records** for better deliverability

## Quick Test Email Function

Add this to test your email configuration:

```javascript
// In backend/server.js
import { testEmailConnection } from "./config/email.js";

// After server starts
testEmailConnection().then((result) => {
  console.log("Email test:", result);
});
```
