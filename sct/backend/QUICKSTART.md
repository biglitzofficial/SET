# 🚀 Quick Start Guide - Sri Chendur Traders Backend

## Step 1: Set up Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project or select existing one
3. Enable **Cloud Firestore** database
4. Go to Project Settings → Service Accounts
5. Click "Generate New Private Key" and download the JSON file

## Step 2: Configure Backend

### Option A: Using Service Account File (Recommended for Development)

1. Rename the downloaded JSON file to `firebase-service-account.json`
2. Move it to the `backend/` folder
3. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
4. Edit `.env` and set at minimum:
   ```env
   PORT=5000
   JWT_SECRET=your-super-secret-key-here
   CLIENT_URL=http://localhost:3000
   ```

### Option B: Using Environment Variables (For Production)

1. Copy `.env.example` to `.env`
2. Fill in all Firebase credentials from your service account JSON:
   ```env
   FIREBASE_PROJECT_ID=your-project-id
   FIREBASE_PRIVATE_KEY_ID=your-private-key-id
   FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour-Private-Key-Here\n-----END PRIVATE KEY-----\n"
   FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
   FIREBASE_CLIENT_ID=your-client-id
   ```

## Step 3: Seed Initial Data (Optional)

```bash
node scripts/seedDatabase.js
```

This will create:

- ✅ 2 default users (admin/staff)
- ✅ Sample customers
- ✅ Sample chit groups
- ✅ Bank accounts
- ✅ Default settings

**Default Credentials:**

- Admin: `admin` / `password`
- Staff: `staff` / `password`

## Step 4: Start the Server

**Development (with auto-reload):**

```bash
npm run dev
```

**Production:**

```bash
npm start
```

Server will be available at: `http://localhost:5000`

## Step 5: Test the API

### Health Check

```bash
curl http://localhost:5000/api/health
```

### Login

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"password"}'
```

Copy the `token` from the response and use it for authenticated requests:

### Get Customers

```bash
curl http://localhost:5000/api/customers \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

## 🔥 Firestore Collections Created

After seeding, you'll have these collections:

- `users` - Staff users with auth
- `customers` - Customer registry
- `invoices` - Billing records
- `payments` - Voucher entries
- `liabilities` - Loans/debt
- `investments` - Savings/investments
- `chitGroups` - Chit fund groups
- `bankAccounts` - Bank account config
- `settings` - App settings
- `auditLogs` - Change tracking

## 📊 Next Steps

1. **Security Rules**: Set up Firestore security rules in Firebase Console
2. **Indexes**: Create composite indexes if needed for complex queries
3. **Production**: Change default passwords and JWT secret
4. **Frontend**: Update frontend to connect to this backend API

## 🔧 Troubleshooting

### "Firebase initialization error"

- Check if your service account JSON is correct
- Verify environment variables are properly set
- Make sure Firestore is enabled in Firebase Console

### "CORS error"

- Update `CLIENT_URL` in `.env` to match your frontend URL
- Check that frontend is making requests to correct backend URL

### Port already in use

- Change `PORT` in `.env` to a different port
- Or kill the process using port 5000:

  ```bash
  # Windows
  netstat -ano | findstr :5000
  taskkill /PID <PID> /F

  # Mac/Linux
  lsof -ti:5000 | xargs kill
  ```

## 📝 API Documentation

See [backend/README.md](./README.md) for complete API documentation.

## 🎯 Project Structure

```
backend/
├── config/          # Firebase configuration
├── middleware/      # Auth middleware
├── routes/          # API endpoints
│   ├── auth.js
│   ├── customers.js
│   ├── invoices.js
│   ├── payments.js
│   ├── liabilities.js
│   ├── investments.js
│   ├── chitGroups.js
│   ├── settings.js
│   └── reports.js
├── scripts/         # Database seeding
├── server.js        # Main entry point
└── package.json
```
