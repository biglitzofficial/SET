import { db } from './config/firebase.js';

async function testFirestore() {
  try {
    console.log('Testing Firestore connection...');
    
    // Try to write a simple document
    const testRef = db.collection('_test').doc('connection');
    await testRef.set({
      timestamp: new Date(),
      status: 'connected'
    });
    
    console.log('✅ Write successful!');
    
    // Try to read it back
    const doc = await testRef.get();
    if (doc.exists) {
      console.log('✅ Read successful!');
      console.log('Data:', doc.data());
    }
    
    // Clean up
    await testRef.delete();
    console.log('✅ Delete successful!');
    
    console.log('\n🎉 Firestore is working correctly!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Firestore test failed:');
    console.error(error);
    process.exit(1);
  }
}

testFirestore();
