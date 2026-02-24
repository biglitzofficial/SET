import admin from 'firebase-admin';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize Firebase Admin
const initializeFirebase = () => {
  try {
    // Delete all existing apps to ensure fresh initialization
    admin.apps.forEach(app => {
      app.delete();
    });

    // For development, you can use service account JSON file
    // For production, use environment variables
    
    let credential;
    
    // 1. Try service account JSON file (local dev)
    try {
      const serviceAccountPath = join(__dirname, '..', 'firebase-service-account.json');
      const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
      credential = admin.credential.cert(serviceAccount);
      console.log('✅ Firebase: loaded from service account file');
    } catch (_fileErr) {
      // 2. Try FIREBASE_SERVICE_ACCOUNT env var as full JSON (Cloud Run Secret Manager)
      if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        try {
          const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
          credential = admin.credential.cert(serviceAccount);
          console.log('✅ Firebase: loaded from FIREBASE_SERVICE_ACCOUNT env var');
        } catch (parseErr) {
          throw new Error('FIREBASE_SERVICE_ACCOUNT is not valid JSON: ' + parseErr.message);
        }
      } else if (process.env.FIREBASE_PROJECT_ID) {
        // 3. Fallback: individual env vars
        credential = admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        });
        console.log('✅ Firebase: loaded from individual env vars');
      } else {
        throw new Error('No Firebase credentials found. Set FIREBASE_SERVICE_ACCOUNT or FIREBASE_PROJECT_ID env var.');
      }
    }

    const app = admin.initializeApp({
      credential
    });

    console.log('✅ Firebase initialized successfully');
    console.log('Project ID:', app.options.projectId || credential.projectId);
    
    const firestore = admin.firestore(app);
    
    firestore.settings({
      ignoreUndefinedProperties: true,
      timestampsInSnapshots: true
    });
    
    return firestore;
  } catch (error) {
    console.error('❌ Firebase initialization error:', error);
    throw error;
  }
};

const db = initializeFirebase();

// Collection names
export const COLLECTIONS = {
  USERS: 'users',
  CUSTOMERS: 'customers',
  INVOICES: 'invoices',
  PAYMENTS: 'payments',
  LIABILITIES: 'liabilities',
  INVESTMENTS: 'investments',
  CHIT_GROUPS: 'chitGroups',
  AUDIT_LOGS: 'auditLogs',
  SETTINGS: 'settings',
  BANK_ACCOUNTS: 'bankAccounts',
  DUE_DATES: 'dueDates'
};

export { admin, db };
