import { db } from './config/firebase.js';

async function testRead() {
  try {
    console.log('Testing read from existing "test" collection...');
    
    // Try to read from the test collection you created in console
    const snapshot = await db.collection('test').get();
    
    if (snapshot.empty) {
      console.log('✅ Collection exists but is empty');
    } else {
      console.log('✅ Read successful! Found', snapshot.size, 'documents');
      snapshot.forEach(doc => {
        console.log(doc.id, '=>', doc.data());
      });
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Read failed:');
    console.error(error.message);
    console.error('Error code:', error.code);
    process.exit(1);
  }
}

testRead();
