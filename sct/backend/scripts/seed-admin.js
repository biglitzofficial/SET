/**
 * One-time script to seed the initial admin user into Firestore.
 * Run once: node scripts/seed-admin.js
 * Safe to re-run — skips if username already exists.
 */

import admin from 'firebase-admin';
import bcrypt from 'bcryptjs';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const serviceAccount = JSON.parse(
  readFileSync(join(__dirname, '..', 'firebase-service-account.json'), 'utf8')
);

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const USERS = [
  {
    name:        'Master Admin',
    username:    'admin',
    password:    'password',          // plain — will be hashed below
    email:       'admin@srichendur.com',
    role:        'OWNER',
    status:      'ACTIVE',
    permissions: { canEdit: true, canDelete: true, canManageUsers: true }
  }
];

async function seed() {
  for (const u of USERS) {
    const snap = await db.collection('users')
      .where('username', '==', u.username)
      .limit(1)
      .get();

    if (!snap.empty) {
      console.log(`⚠️  User "${u.username}" already exists — skipping.`);
      continue;
    }

    const hashed = await bcrypt.hash(u.password, 12);
    await db.collection('users').add({
      name:        u.name,
      username:    u.username,
      password:    hashed,
      email:       u.email,
      role:        u.role,
      status:      u.status,
      permissions: u.permissions,
      createdAt:   Date.now()
    });

    console.log(`✅ Created user "${u.username}" (${u.role})`);
  }

  process.exit(0);
}

seed().catch(err => { console.error('❌', err.message); process.exit(1); });
