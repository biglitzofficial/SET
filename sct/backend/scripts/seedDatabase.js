import bcrypt from 'bcryptjs';
import { db, COLLECTIONS } from '../config/firebase.js';
import { SAMPLE_CUSTOMERS, SAMPLE_CHIT_GROUPS, OPENING_BALANCES } from './seedData.js';

async function seedDatabase() {
  try {
    console.log('🌱 Starting database seeding...');

    // 1. Create default users
    console.log('Creating users...');
    const hashedPassword = await bcrypt.hash('password', 10);
    
    const users = [
      {
        name: 'Master Admin',
        username: 'admin',
        email: 'admin@srichendur.com',
        password: hashedPassword,
        role: 'OWNER',
        status: 'ACTIVE',
        permissions: { canEdit: true, canDelete: true, canManageUsers: true },
        createdAt: Date.now()
      },
      {
        name: 'Staff User',
        username: 'staff',
        email: 'staff@srichendur.com',
        password: hashedPassword,
        role: 'STAFF',
        status: 'ACTIVE',
        permissions: { canEdit: true, canDelete: false, canManageUsers: false },
        createdAt: Date.now()
      }
    ];

    for (const user of users) {
      await db.collection(COLLECTIONS.USERS).add(user);
    }
    console.log('✅ Users created');

    // 2. Create customers
    console.log('Creating customers...');
    for (const customer of SAMPLE_CUSTOMERS) {
      await db.collection(COLLECTIONS.CUSTOMERS).add(customer);
    }
    console.log(`✅ ${SAMPLE_CUSTOMERS.length} customers created`);

    // 3. Create chit groups
    console.log('Creating chit groups...');
    for (const chitGroup of SAMPLE_CHIT_GROUPS) {
      await db.collection(COLLECTIONS.CHIT_GROUPS).add(chitGroup);
    }
    console.log(`✅ ${SAMPLE_CHIT_GROUPS.length} chit groups created`);

    // 4. Create bank accounts
    console.log('Creating bank accounts...');
    const bankAccounts = [
      { id: 'CUB', name: 'CUB', openingBalance: OPENING_BALANCES.CUB, status: 'ACTIVE' },
      { id: 'KVB', name: 'KVB', openingBalance: OPENING_BALANCES.KVB, status: 'ACTIVE' }
    ];

    for (const account of bankAccounts) {
      await db.collection(COLLECTIONS.BANK_ACCOUNTS).doc(account.id).set(account);
    }
    console.log('✅ Bank accounts created');

    // 5. Create default settings
    console.log('Creating settings...');
    await db.collection(COLLECTIONS.SETTINGS).doc('app_settings').set({
      expenseCategories: ['Office Rent', 'Staff Salary', 'Transport', 'Electricity', 'Packaging'],
      savingCategories: ['LIC', 'SIP', 'CHIT_SAVINGS', 'GOLD_SAVINGS', 'FIXED_DEPOSIT'],
      otherBusinesses: ['FITO6', 'FITOBOWL', 'TRANSPORT_DIV'],
      incomeCategories: ['Salary', 'Commission', 'Incentives'],
      openingBalances: OPENING_BALANCES,
      createdAt: Date.now()
    });
    console.log('✅ Settings created');

    console.log('🎉 Database seeding completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
}

seedDatabase();
