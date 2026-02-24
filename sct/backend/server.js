import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

// Import routes
import authRoutes from './routes/auth.js';
import customerRoutes from './routes/customers.js';
import invoiceRoutes from './routes/invoices.js';
import paymentRoutes from './routes/payments.js';
import liabilityRoutes from './routes/liabilities.js';
import investmentRoutes from './routes/investments.js';
import chitGroupRoutes from './routes/chitGroups.js';
import settingsRoutes from './routes/settings.js';
import reportRoutes from './routes/reports.js';
import dueDatesRoutes from './routes/dueDates.js';

// Import email service
import { testEmailConnection } from './config/email.js';

// Import security middleware
import { sanitizeInput } from './middleware/sanitize.js';
import { validateEnv } from './config/env.js';

// Load environment variables
dotenv.config();

// Validate environment variables
validateEnv();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// Get client URL and trim any whitespace
const clientUrl = (process.env.CLIENT_URL || 'http://localhost:3000').trim();

// CORS configuration - support multiple origins
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'https://sri-chendur-traders.web.app',
  'https://sri-chendur-traders.firebaseapp.com',
  'https://sct.biglitz.in',
  'https://scts.biglitz.in'
];

// ============================================
// SECURITY MIDDLEWARE
// ============================================

// 1. HTTP Security Headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "https://sri-chendur-traders-backend-*.run.app"],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
    frameguard: { action: 'deny' },
    noSniff: true,
    xssFilter: true,
  })
);

// 2. CORS configuration
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    // Check if origin is allowed or if CLIENT_URL is wildcard
    if (clientUrl === '*' || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

// 3. Request Size Limits (prevent large payload attacks)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 4. Input Sanitization (XSS protection)
app.use(sanitizeInput);

// 5. Login Rate Limiter ONLY (for security - 100 attempts per 15 minutes)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20, // 20 login attempts per 15 minutes per IP
  skipSuccessfulRequests: true,
  message: {
    error: {
      message: 'Too many login attempts. Please try again after 15 minutes.',
    },
  },
});

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Sri Chendur Traders API is running',
    timestamp: new Date().toISOString()
  });
});

// Email health check
app.get('/api/health/email', async (req, res) => {
  const result = await testEmailConnection();
  res.json({
    status: result.success ? 'OK' : 'NOT_CONFIGURED',
    ...result
  });
});

// ============================================
// API ROUTES - NO RATE LIMITING (except login)
// ============================================
app.use('/api/auth', loginLimiter, authRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/liabilities', liabilityRoutes);
app.use('/api/investments', investmentRoutes);
app.use('/api/chit-groups', chitGroupRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/due-dates', dueDatesRoutes);

// ============================================
// ERROR HANDLING MIDDLEWARE
// ============================================
app.use((err, req, res, next) => {
  // Log error with more details
  console.error('Error:', {
    message: err.message,
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString(),
    userId: req.user?.id || 'anonymous',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });

  // Don't expose internal errors in production
  const statusCode = err.status || 500;
  const message =
    statusCode === 500 && process.env.NODE_ENV === 'production'
      ? 'Internal Server Error'
      : err.message || 'Internal Server Error';

  res.status(statusCode).json({
    error: {
      message,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    },
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: { message: 'Route not found' } });
});

// Start server
app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/api/health`);
  
  // Test email configuration on startup (non-blocking)
  try {
    const emailStatus = await testEmailConnection();
    if (emailStatus.success) {
      console.log(`📧 Email service: ${emailStatus.message}`);
    } else {
      console.log(`⚠️  Email service: ${emailStatus.message}`);
    }
  } catch (error) {
    console.log(`⚠️  Email service: Could not test connection - ${error.message}`);
  }
});

export default app;
