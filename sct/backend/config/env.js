import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Validate that all required environment variables are set
 * This prevents runtime errors from missing configuration
 */
export const validateEnv = () => {
  const serviceAccountPath = join(__dirname, '..', 'firebase-service-account.json');

  // JWT_SECRET and NODE_ENV are always required
  const required = ['JWT_SECRET', 'NODE_ENV'];
  
  // Firebase credentials check:
  // Accept any of: service account file | FIREBASE_SERVICE_ACCOUNT JSON env var | individual vars
  const hasServiceAccountFile = existsSync(serviceAccountPath);
  const hasServiceAccountEnvVar = !!process.env.FIREBASE_SERVICE_ACCOUNT;
  const hasIndividualVars = !!(process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL);

  if (hasServiceAccountFile) {
    console.log('✅ Firebase service account file found');
  } else if (hasServiceAccountEnvVar) {
    console.log('✅ Firebase credentials found via FIREBASE_SERVICE_ACCOUNT env var');
  } else if (hasIndividualVars) {
    console.log('✅ Firebase credentials found via individual env vars');
  } else {
    // None of the three are available — require the individual vars so the error message is clear
    required.push('FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL');
  }

  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach(key => console.error(`   - ${key}`));
    process.exit(1);
  }

  // Validate JWT_SECRET strength
  if (process.env.JWT_SECRET.length < 32) {
    console.error('❌ JWT_SECRET must be at least 32 characters long');
    console.error('   Current length:', process.env.JWT_SECRET.length);
    process.exit(1);
  }

  // Warn about development mode in production
  if (process.env.NODE_ENV === 'production') {
    console.log('✅ Running in PRODUCTION mode');
    console.log('✅ All required environment variables are set');
  } else {
    console.log('⚙️  Running in DEVELOPMENT mode');
    console.log('✅ All required environment variables are set');
  }
};
