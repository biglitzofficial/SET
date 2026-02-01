import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

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

// Import email service
import { testEmailConnection } from './config/email.js';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// Get client URL and trim any whitespace
const clientUrl = (process.env.CLIENT_URL || 'http://localhost:3000').trim();

// Middleware
app.use(cors({
  origin: clientUrl === '*' ? '*' : clientUrl,
  credentials: clientUrl !== '*'
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/liabilities', liabilityRoutes);
app.use('/api/investments', investmentRoutes);
app.use('/api/chit-groups', chitGroupRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/reports', reportRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: {
      message: err.message || 'Internal Server Error',
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    }
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
  
  // Test email configuration on startup
  const emailStatus = await testEmailConnection();
  if (emailStatus.success) {
    console.log(`📧 Email service: ${emailStatus.message}`);
  } else {
    console.log(`⚠️  Email service: ${emailStatus.message}`);
  }
});

export default app;
