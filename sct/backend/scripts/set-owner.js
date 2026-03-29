/**
 * One-time script to promote a user to OWNER role.
 * Run: node scripts/set-owner.js <username>
 * Example: node scripts/set-owner.js boobalan
 * 
 * Uses firebase-service-account.json from backend directory.
 */

import { db, COLLECTIONS } from '../config/firebase.js';

const username = process.argv[2]?.trim()?.toLowerCase();
if (!username) {
  console.error('Usage: node scripts/set-owner.js <username>');
  console.error('Example: node scripts/set-owner.js boobalan');
  process.exit(1);
}

async function setOwner() {
  const snapshot = await db.collection(COLLECTIONS.USERS)
    .where('username', '==', username)
    .limit(1)
    .get();

  if (snapshot.empty) {
    // Try case-insensitive: search by name
    const allUsers = await db.collection(COLLECTIONS.USERS).get();
    const match = allUsers.docs.find(d => 
      (d.data().username || '').toLowerCase() === username ||
      (d.data().name || '').toLowerCase().includes(username)
    );
    if (!match) {
      console.error(`No user found with username or name matching "${username}"`);
      console.log('Existing users:');
      allUsers.docs.forEach(d => {
        const u = d.data();
        console.log(`  - ${u.username} (${u.name}) [${u.role}]`);
      });
      process.exit(1);
    }
    const doc = match;
    await doc.ref.update({
      role: 'OWNER',
      permissions: { canEdit: true, canDelete: true, canManageUsers: true },
      updatedAt: Date.now()
    });
    console.log(`✅ Promoted "${doc.data().name}" (${doc.data().username}) to OWNER`);
  } else {
    const doc = snapshot.docs[0];
    await doc.ref.update({
      role: 'OWNER',
      permissions: { canEdit: true, canDelete: true, canManageUsers: true },
      updatedAt: Date.now()
    });
    console.log(`✅ Promoted "${doc.data().name}" (${doc.data().username}) to OWNER`);
  }
  process.exit(0);
}

setOwner().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
