/**
 * Fixes admin password - ensures it is bcrypt hashed.
 * Run: node scripts/fix-admin-password.js
 */
import admin from 'firebase-admin';
import bcrypt from 'bcryptjs';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const sa = JSON.parse(readFileSync(join(__dirname, '..', 'firebase-service-account.json'), 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const snap = await db.collection('users').where('username', '==', 'admin').limit(1).get();
if (snap.empty) { console.log('❌ No admin user found'); process.exit(1); }

const doc = snap.docs[0];
const data = doc.data();
console.log('Current password starts with:', data.password?.substring(0, 10));
const isHashed = data.password?.startsWith('$2');

if (!isHashed) {
  const hash = await bcrypt.hash('password', 12);
  await doc.ref.update({ password: hash });
  console.log('✅ Password updated to bcrypt hash');
} else {
  console.log('✅ Password is already bcrypt hashed — no change needed');
}

process.exit(0);
