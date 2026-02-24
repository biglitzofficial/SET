import { db, COLLECTIONS } from './config/firebase.js';

async function checkDatabaseData() {
  try {
    console.log('🔍 Checking database data...');
    
    // Check customers
    const customersSnapshot = await db.collection(COLLECTIONS.CUSTOMERS).get();
    console.log(`📋 Customers: ${customersSnapshot.size} records found`);
    
    if (!customersSnapshot.empty) {
      const firstCustomer = customersSnapshot.docs[0].data();
      console.log('Sample Customer:', {
        name: firstCustomer.name,
        type: firstCustomer.type,
        phone: firstCustomer.phone,
        status: firstCustomer.status
      });
    }
    
    // Check users
    const usersSnapshot = await db.collection(COLLECTIONS.USERS).get();
    console.log(`👥 Users: ${usersSnapshot.size} records found`);
    
    if (!usersSnapshot.empty) {
      const firstUser = usersSnapshot.docs[0].data();
      console.log('Sample User:', {
        name: firstUser.name,
        username: firstUser.username,
        role: firstUser.role,
        status: firstUser.status
      });
    }
    
    // Check chit groups
    const chitGroupsSnapshot = await db.collection(COLLECTIONS.CHIT_GROUPS).get();
    console.log(`🎯 Chit Groups: ${chitGroupsSnapshot.size} records found`);
    
    // Check bank accounts
    const bankAccountsSnapshot = await db.collection(COLLECTIONS.BANK_ACCOUNTS).get();
    console.log(`🏦 Bank Accounts: ${bankAccountsSnapshot.size} records found`);
    
    // Check invoices
    const invoicesSnapshot = await db.collection(COLLECTIONS.INVOICES).get();
    console.log(`📄 Invoices: ${invoicesSnapshot.size} records found`);
    
    // Check payments
    const paymentsSnapshot = await db.collection(COLLECTIONS.PAYMENTS).get();
    console.log(`💰 Payments: ${paymentsSnapshot.size} records found`);
    
    // Check liabilities
    const liabilitiesSnapshot = await db.collection(COLLECTIONS.LIABILITIES).get();
    console.log(`📊 Liabilities: ${liabilitiesSnapshot.size} records found`);
    
    // Check investments
    const investmentsSnapshot = await db.collection(COLLECTIONS.INVESTMENTS).get();
    console.log(`📈 Investments: ${investmentsSnapshot.size} records found`);
    
    // Check settings
    const settingsSnapshot = await db.collection(COLLECTIONS.SETTINGS).get();
    console.log(`⚙️ Settings: ${settingsSnapshot.size} records found`);
    
    console.log('\n✅ Database connectivity verification completed!');
    
  } catch (error) {
    console.error('❌ Error checking database data:', error);
  }
}

checkDatabaseData().catch(console.error);