import { db, COLLECTIONS } from './config/firebase.js';

async function testDataCreation() {
  try {
    console.log('🧪 Testing data creation...');
    
    // Create a test invoice
    const testInvoice = {
      id: `INV-${Date.now()}`,
      customerId: 'test-customer',
      customerName: 'Test Customer',
      amount: 1000,
      balance: 1000,
      status: 'PENDING',
      invoiceDate: new Date().toISOString(),
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days from now
      items: [
        {
          description: 'Test Service',
          amount: 1000
        }
      ],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    
    const invoiceRef = await db.collection(COLLECTIONS.INVOICES).add(testInvoice);
    console.log('✅ Test invoice created with ID:', invoiceRef.id);
    
    // Create a test payment
    const testPayment = {
      id: `PAY-${Date.now()}`,
      type: 'RECEIPT',
      direction: 'IN',
      purpose: 'CUSTOMER_PAYMENT',
      customerId: 'test-customer',
      customerName: 'Test Customer',
      amount: 500,
      paymentMode: 'CASH',
      description: 'Test Payment',
      sourceId: 'test-source',
      sourceName: 'Test Source',
      paymentDate: new Date().toISOString(),
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    
    const paymentRef = await db.collection(COLLECTIONS.PAYMENTS).add(testPayment);
    console.log('✅ Test payment created with ID:', paymentRef.id);
    
    // Create a test liability
    const testLiability = {
      id: `LIB-${Date.now()}`,
      providerName: 'Test Lender',
      principal: 10000,
      interestRate: 12,
      currentBalance: 10000,
      paymentStatus: 'ACTIVE',
      startDate: new Date().toISOString(),
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    
    const liabilityRef = await db.collection(COLLECTIONS.LIABILITIES).add(testLiability);
    console.log('✅ Test liability created with ID:', liabilityRef.id);
    
    // Create a test investment
    const testInvestment = {
      id: `INV-${Date.now()}`,
      accountName: 'Test Investment',
      balance: 5000,
      investmentType: 'FIXED_DEPOSIT',
      status: 'ACTIVE',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    
    const investmentRef = await db.collection(COLLECTIONS.INVESTMENTS).add(testInvestment);
    console.log('✅ Test investment created with ID:', investmentRef.id);
    
    console.log('\n🎉 All test data created successfully!');
    
    // Verify the data was created
    console.log('\n🔍 Verifying data counts...');
    
    const invoicesSnapshot = await db.collection(COLLECTIONS.INVOICES).get();
    console.log(`📄 Invoices: ${invoicesSnapshot.size} records`);
    
    const paymentsSnapshot = await db.collection(COLLECTIONS.PAYMENTS).get();
    console.log(`💰 Payments: ${paymentsSnapshot.size} records`);
    
    const liabilitiesSnapshot = await db.collection(COLLECTIONS.LIABILITIES).get();
    console.log(`📊 Liabilities: ${liabilitiesSnapshot.size} records`);
    
    const investmentsSnapshot = await db.collection(COLLECTIONS.INVESTMENTS).get();
    console.log(`📈 Investments: ${investmentsSnapshot.size} records`);
    
    console.log('\n✅ Data creation and storage verification completed!');
    
  } catch (error) {
    console.error('❌ Error testing data creation:', error);
  }
}

testDataCreation().catch(console.error);