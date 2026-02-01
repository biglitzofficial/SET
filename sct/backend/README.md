# Sri Chendur Traders - Backend API

Backend API server for Sri Chendur Traders Finance OS built with Node.js, Express, and Firebase Firestore.

## 🚀 Setup

### Prerequisites

- Node.js (v16 or higher)
- Firebase project with Firestore enabled
- Firebase service account credentials

### Installation

1. Install dependencies:

```bash
npm install
```

2. Configure Firebase:

**Option A: Using environment variables**

- Copy `.env.example` to `.env`
- Fill in your Firebase credentials

**Option B: Using service account file**

- Download your Firebase service account JSON from Firebase Console
- Save it as `firebase-service-account.json` in the backend folder

3. Seed the database (optional):

```bash
node scripts/seedDatabase.js
```

### Running the Server

**Development:**

```bash
npm run dev
```

**Production:**

```bash
npm start
```

The server will start on `http://localhost:5000` (or the PORT specified in `.env`)

## 📚 API Endpoints

### Authentication

- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user
- `PUT /api/auth/change-password` - Change password

### Customers

- `GET /api/customers` - Get all customers
- `GET /api/customers/:id` - Get single customer
- `POST /api/customers` - Create customer
- `PUT /api/customers/:id` - Update customer
- `DELETE /api/customers/:id` - Delete customer

### Invoices

- `GET /api/invoices` - Get all invoices
- `GET /api/invoices/:id` - Get single invoice
- `POST /api/invoices` - Create invoice
- `PUT /api/invoices/:id` - Update invoice
- `POST /api/invoices/:id/void` - Void invoice
- `DELETE /api/invoices/:id` - Delete invoice

### Payments

- `GET /api/payments` - Get all payments
- `GET /api/payments/:id` - Get single payment
- `POST /api/payments` - Create payment
- `PUT /api/payments/:id` - Update payment
- `DELETE /api/payments/:id` - Delete payment

### Liabilities

- `GET /api/liabilities` - Get all liabilities
- `GET /api/liabilities/:id` - Get single liability
- `POST /api/liabilities` - Create liability
- `PUT /api/liabilities/:id` - Update liability
- `DELETE /api/liabilities/:id` - Delete liability

### Investments

- `GET /api/investments` - Get all investments
- `GET /api/investments/:id` - Get single investment
- `POST /api/investments` - Create investment
- `PUT /api/investments/:id` - Update investment
- `POST /api/investments/:id/transactions` - Add transaction
- `DELETE /api/investments/:id` - Delete investment

### Chit Groups

- `GET /api/chit-groups` - Get all chit groups
- `GET /api/chit-groups/:id` - Get single chit group
- `POST /api/chit-groups` - Create chit group
- `PUT /api/chit-groups/:id` - Update chit group
- `POST /api/chit-groups/:id/auctions` - Add auction
- `DELETE /api/chit-groups/:id` - Delete chit group

### Settings

- `GET /api/settings` - Get all settings
- `PUT /api/settings` - Update settings
- `GET /api/settings/users` - Get all users
- `GET /api/settings/bank-accounts` - Get bank accounts
- `PUT /api/settings/bank-accounts/:id` - Update bank account
- `GET /api/settings/audit-logs` - Get audit logs

### Reports

- `GET /api/reports/dashboard` - Get dashboard statistics
- `GET /api/reports/general-ledger` - Get general ledger
- `GET /api/reports/outstanding` - Get outstanding reports

## 🔒 Authentication

All protected routes require a JWT token in the Authorization header:

```
Authorization: Bearer YOUR_JWT_TOKEN
```

Get the token by calling the `/api/auth/login` endpoint.

## 🏗️ Project Structure

```
backend/
├── config/
│   └── firebase.js          # Firebase/Firestore configuration
├── middleware/
│   └── auth.js             # Authentication & authorization middleware
├── routes/
│   ├── auth.js             # Auth endpoints
│   ├── customers.js        # Customer CRUD
│   ├── invoices.js         # Invoice CRUD
│   ├── payments.js         # Payment CRUD
│   ├── liabilities.js      # Liability CRUD
│   ├── investments.js      # Investment CRUD
│   ├── chitGroups.js       # Chit group CRUD
│   ├── settings.js         # Settings & config
│   └── reports.js          # Reports & analytics
├── scripts/
│   ├── seedDatabase.js     # Database seeding script
│   └── seedData.js         # Sample data
├── .env.example            # Environment variables template
├── .gitignore
├── package.json
├── README.md
└── server.js               # Main server file
```

## 🔐 Default Credentials

After seeding the database:

- **Admin:** username: `admin`, password: `password`
- **Staff:** username: `staff`, password: `password`

**⚠️ Change these credentials in production!**

## 🛠️ Environment Variables

```env
PORT=5000
NODE_ENV=development

# Firebase Configuration
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY_ID=your-key-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=your-service-account@project.iam.gserviceaccount.com
FIREBASE_CLIENT_ID=your-client-id

# JWT Configuration
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=24h

# CORS
CLIENT_URL=http://localhost:3000
```

## 📝 Notes

- All dates are stored as Unix timestamps (milliseconds)
- Currency values are in Indian Rupees (₹)
- Audit logs are automatically created for CREATE, EDIT, DELETE, and VOID operations
- Role-based access control (OWNER vs STAFF)
- Permission-based actions (canEdit, canDelete, canManageUsers)
