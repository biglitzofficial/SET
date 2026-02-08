# 🔒 Critical Security Implementation Guide

## Quick Start - Priority 1 Security Fixes

This guide provides copy-paste ready code to implement the most critical security improvements.

---

## 1. Install Required Packages

```bash
cd backend
npm install helmet express-rate-limit express-slow-down
```

---

## 2. Update server.js

Add these imports at the top of `backend/server.js`:

```javascript
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import slowDown from "express-slow-down";
```

Add these middleware configurations BEFORE your route definitions:

```javascript
// ============================================
// SECURITY MIDDLEWARE - Add after line 29
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
    frameguard: { action: "deny" },
    noSniff: true,
    xssFilter: true,
  }),
);

// 2. Request Size Limits
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// 3. General API Rate Limiter (100 requests per 15 minutes)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: "Too many requests, please try again later." } },
  skip: (req) => req.path === "/api/health", // Skip health checks
});
app.use("/api/", apiLimiter);

// 4. Login Rate Limiter (5 attempts per 15 minutes)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
  message: {
    error: {
      message: "Too many login attempts. Please try again after 15 minutes.",
    },
  },
});

// 5. Write Operations Rate Limiter (50 operations per 15 minutes)
const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: {
    error: { message: "Too many write operations. Please slow down." },
  },
});

// 6. Speed Limiter for Suspicious Activity
const speedLimiter = slowDown({
  windowMs: 15 * 60 * 1000,
  delayAfter: 50,
  delayMs: 500,
});
```

Update the auth route to use the login limiter:

```javascript
// Update this line (around line 88)
app.use("/api/auth", loginLimiter, authRoutes);
```

Apply write limiter to critical routes:

```javascript
// Update these lines (around line 89-96)
app.use("/api/customers", writeLimiter, customerRoutes);
app.use("/api/invoices", writeLimiter, invoiceRoutes);
app.use("/api/payments", writeLimiter, paymentRoutes);
app.use("/api/liabilities", writeLimiter, liabilityRoutes);
app.use("/api/investments", writeLimiter, investmentRoutes);
app.use("/api/chit-groups", writeLimiter, chitGroupRoutes);
app.use("/api/settings", writeLimiter, settingsRoutes);
```

---

## 3. Enhanced Error Handling

Replace the error handling middleware (around line 100) with:

```javascript
// Error handling middleware
app.use((err, req, res, next) => {
  // Log error with more details
  console.error("Error:", {
    message: err.message,
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString(),
    userId: req.user?.id || "anonymous",
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });

  // Don't expose internal errors in production
  const statusCode = err.status || 500;
  const message =
    statusCode === 500 && process.env.NODE_ENV === "production"
      ? "Internal Server Error"
      : err.message || "Internal Server Error";

  res.status(statusCode).json({
    error: {
      message,
      ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
    },
  });
});
```

---

## 4. Add Input Sanitization

Install XSS protection:

```bash
npm install xss
```

Create a new file `backend/middleware/sanitize.js`:

```javascript
import xss from "xss";

// Sanitize string inputs to prevent XSS
export const sanitizeInput = (req, res, next) => {
  const sanitize = (obj) => {
    if (typeof obj === "string") {
      return xss(obj);
    }
    if (typeof obj === "object" && obj !== null) {
      for (let key in obj) {
        if (obj.hasOwnProperty(key)) {
          obj[key] = sanitize(obj[key]);
        }
      }
    }
    return obj;
  };

  if (req.body) {
    req.body = sanitize(req.body);
  }
  if (req.query) {
    req.query = sanitize(req.query);
  }
  if (req.params) {
    req.params = sanitize(req.params);
  }

  next();
};
```

Add to `server.js`:

```javascript
import { sanitizeInput } from "./middleware/sanitize.js";

// Add after JSON parsing middleware
app.use(sanitizeInput);
```

---

## 5. Environment Variable Validation

Create `backend/config/env.js`:

```javascript
// Validate that all required environment variables are set
export const validateEnv = () => {
  const required = [
    "JWT_SECRET",
    "FIREBASE_PROJECT_ID",
    "FIREBASE_CLIENT_EMAIL",
    "NODE_ENV",
  ];

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error("❌ Missing required environment variables:");
    missing.forEach((key) => console.error(`   - ${key}`));
    process.exit(1);
  }

  // Validate JWT_SECRET strength
  if (process.env.JWT_SECRET.length < 32) {
    console.error("❌ JWT_SECRET must be at least 32 characters long");
    process.exit(1);
  }

  console.log("✅ All required environment variables are set");
};
```

Add to `server.js` at the top:

```javascript
import { validateEnv } from "./config/env.js";

// Validate environment before starting
validateEnv();
```

---

## 6. Enhanced Logging

Create `backend/middleware/requestLogger.js`:

```javascript
// Enhanced request logging
export const requestLogger = (req, res, next) => {
  const startTime = Date.now();

  // Log request
  console.log(`${new Date().toISOString()} [${req.method}] ${req.path}`, {
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get("user-agent"),
    userId: req.user?.id || "anonymous",
  });

  // Log response
  res.on("finish", () => {
    const duration = Date.now() - startTime;
    console.log(
      `${new Date().toISOString()} [${req.method}] ${req.path} - ${res.statusCode} (${duration}ms)`,
    );
  });

  next();
};
```

Replace the simple logging in `server.js`:

```javascript
import { requestLogger } from "./middleware/requestLogger.js";

// Replace the simple logger with enhanced one
app.use(requestLogger);
```

---

## 7. Update CORS for Production

Update CORS configuration in `server.js`:

```javascript
// CORS configuration - Enhanced
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:5173",
  "https://sri-chendur-traders.web.app",
  "https://sri-chendur-traders.firebaseapp.com",
  "https://sct.biglitz.in",
  "https://scts.biglitz.in",
];

app.use(
  cors({
    origin: function (origin, callback) {
      // In production, require origin header
      if (!origin && process.env.NODE_ENV === "production") {
        return callback(new Error("Origin header required in production"));
      }

      // Allow no origin in development (Postman, etc.)
      if (!origin) return callback(null, true);

      // Check whitelist
      if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        console.warn(`CORS blocked: ${origin}`);
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    maxAge: 86400, // Cache preflight for 24 hours
    optionsSuccessStatus: 200,
  }),
);
```

---

## 8. Update .env.example

Add required security variables:

```bash
# Add to .env.example
NODE_ENV=production
JWT_SECRET=your-super-secret-jwt-key-at-least-32-characters-long-change-in-production
JWT_EXPIRES_IN=24h

# Security
HELMET_CSP_ENABLED=true
RATE_LIMIT_ENABLED=true
MAX_REQUESTS_PER_15MIN=100
LOGIN_MAX_ATTEMPTS=5
```

---

## 9. Testing the Security Implementations

### Test Rate Limiting

```bash
# Test login rate limit (should fail after 5 attempts)
for i in {1..10}; do
  curl -X POST http://localhost:5000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"username":"test","password":"wrong"}'
  echo "\nAttempt $i"
done
```

### Test Headers

```bash
# Check security headers
curl -I http://localhost:5000/api/health
```

You should see:

```
X-DNS-Prefetch-Control: off
X-Frame-Options: DENY
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
X-Content-Type-Options: nosniff
X-XSS-Protection: 0
```

### Test CORS

```bash
# Should be blocked (invalid origin)
curl -X GET http://localhost:5000/api/health \
  -H "Origin: https://evil-site.com" \
  -v
```

---

## 10. Production Deployment Checklist

Before deploying to production:

- [ ] All security packages installed
- [ ] JWT_SECRET is strong (32+ characters)
- [ ] NODE_ENV=production set
- [ ] CORS origins updated with production domains
- [ ] Rate limiting tested
- [ ] Security headers verified
- [ ] Error handling tested
- [ ] Logging configured
- [ ] .env file not in repository
- [ ] Service account JSON not in repository

---

## 11. Monitoring Setup (Optional but Recommended)

### Install Sentry for Error Tracking

```bash
npm install @sentry/node @sentry/tracing
```

Add to `server.js`:

```javascript
import * as Sentry from "@sentry/node";
import * as Tracing from "@sentry/tracing";

// Initialize Sentry (add after imports)
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 1.0,
  });

  // RequestHandler creates a separate execution context
  app.use(Sentry.Handlers.requestHandler());
  app.use(Sentry.Handlers.tracingHandler());
}

// Add error handler BEFORE other error handlers
if (process.env.SENTRY_DSN) {
  app.use(Sentry.Handlers.errorHandler());
}
```

---

## Complete Implementation Time

- **Basic Security (Helmet, Rate Limiting)**: 30 minutes
- **Input Sanitization**: 20 minutes
- **Enhanced Logging**: 15 minutes
- **Environment Validation**: 10 minutes
- **Testing**: 30 minutes
- **Total**: ~2 hours

---

## Post-Implementation Verification

Run these commands to verify:

```bash
# 1. Check for vulnerabilities
npm audit

# 2. Check for outdated packages
npm outdated

# 3. Run the server and check logs
npm start

# You should see:
# ✅ All required environment variables are set
# ✅ Firebase initialized successfully
# 🚀 Server running on port 5000
```

---

## Next Steps

After implementing these critical security fixes:

1. Set up error monitoring (Sentry)
2. Implement refresh token mechanism
3. Add account lockout after failed logins
4. Set up automated security scans
5. Schedule regular dependency updates
6. Conduct penetration testing

---

## Support

If you encounter any issues during implementation:

1. Check the main [SECURITY_AUDIT_REPORT.md](./SECURITY_AUDIT_REPORT.md)
2. Review the error logs
3. Verify environment variables are set correctly
4. Test each component individually

---

**Last Updated:** February 8, 2026  
**Compatible With:** Node.js 20+, Express 4.18+
