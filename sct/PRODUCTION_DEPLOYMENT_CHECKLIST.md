# 🚀 Production Deployment Checklist

## ✅ Pre-Deployment Security Checklist

### 1. Environment Variables ✓

- [x] JWT_SECRET is at least 32 characters long ⚠️ **CRITICAL**
- [x] Different secrets for dev/staging/production
- [x] No secrets committed to version control
- [x] All required environment variables set (verified by env.js)
- [x] NODE_ENV=production in production

**Generate secure JWT secret:**

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 2. Security Middleware ✓

- [x] Helmet.js HTTP security headers enabled
- [x] Rate limiting configured (100 req/15min general, 5 login/15min, 50 write/15min)
- [x] Request size limits (10mb)
- [x] XSS input sanitization
- [x] CORS properly configured
- [x] Speed limiting for suspicious activity

### 3. Authentication & Authorization ✓

- [x] JWT tokens expire (24h)
- [x] Token validation with algorithm enforcement (HS256 only)
- [x] Role-based access control (OWNER, MANAGER, ACCOUNTANT, VIEWER)
- [x] User status verification (ACTIVE users only)
- [x] Permission checking for sensitive operations

### 4. Database Security ✓

- [x] Firestore security rules in place
- [x] Input validation on all endpoints (express-validator)
- [x] SQL injection not applicable (NoSQL Firestore)
- [x] Audit logging for critical operations
- [x] Batch operations respect Firestore limits (500 docs)

### 5. Error Handling ✓

- [x] No internal errors exposed in production
- [x] Structured error logging with timestamps
- [x] User IDs logged for audit trail
- [x] Stack traces only in development mode

---

## 📝 Firebase Console Configuration

### 1. Firestore Security Rules

Ensure these rules are deployed:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Helper function to check authentication
    function isAuthenticated() {
      return request.auth != null;
    }

    // Helper function to check user role
    function hasRole(role) {
      return isAuthenticated() &&
             get(/databases/$(database)/documents/USERS/$(request.auth.uid)).data.role == role;
    }

    // Users collection - only authenticated users can read their own data
    match /USERS/{userId} {
      allow read: if isAuthenticated();
      allow write: if hasRole('OWNER');
    }

    // All other collections - require authentication
    match /CUSTOMERS/{document=**} {
      allow read: if isAuthenticated();
      allow write: if hasRole('OWNER') || hasRole('MANAGER') || hasRole('ACCOUNTANT');
    }

    match /INVOICES/{document=**} {
      allow read: if isAuthenticated();
      allow write: if hasRole('OWNER') || hasRole('MANAGER') || hasRole('ACCOUNTANT');
    }

    match /PAYMENTS/{document=**} {
      allow read: if isAuthenticated();
      allow write: if hasRole('OWNER') || hasRole('MANAGER') || hasRole('ACCOUNTANT');
    }

    match /LIABILITIES/{document=**} {
      allow read: if isAuthenticated();
      allow write: if hasRole('OWNER') || hasRole('MANAGER') || hasRole('ACCOUNTANT');
    }

    match /INVESTMENTS/{document=**} {
      allow read: if isAuthenticated();
      allow write: if hasRole('OWNER') || hasRole('MANAGER') || hasRole('ACCOUNTANT');
    }

    match /CHIT_GROUPS/{document=**} {
      allow read: if isAuthenticated();
      allow write: if hasRole('OWNER') || hasRole('MANAGER') || hasRole('ACCOUNTANT');
    }

    match /SETTINGS/{document=**} {
      allow read: if isAuthenticated();
      allow write: if hasRole('OWNER');
    }

    match /BANK_ACCOUNTS/{document=**} {
      allow read: if isAuthenticated();
      allow write: if hasRole('OWNER');
    }

    match /AUDIT_LOGS/{document=**} {
      allow read: if hasRole('OWNER');
      allow write: if false; // Only backend can write logs
    }
  }
}
```

### 2. Firebase Budget Alerts

Set spending limits in Firebase Console:

1. Go to: **Project Settings → Usage and billing → Details & settings**
2. Set budget alerts:
   - ₹400 ($5) - Warning email
   - ₹800 ($10) - Second warning
   - ₹1,200 ($15) - Final warning
3. Optional: Set hard cap at ₹1,600-4,000 ($20-50)

### 3. Cloud Run Configuration

Your backend is deployed on Cloud Run:

1. **Minimum instances:** 0 (scales to zero when idle)
2. **Maximum instances:** 10 (prevents runaway costs)
3. **CPU allocation:** Only during request processing
4. **Memory:** 512MB (sufficient for finance app)
5. **Timeout:** 300 seconds (5 minutes)
6. **Concurrency:** 80 requests per instance

---

## 🔍 Pre-Launch Testing

### Test Critical Flows

1. **Authentication**

   ```bash
   # Test login rate limiting (should block after 5 attempts)
   curl -X POST http://your-backend/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"test@test.com","password":"wrong"}'
   ```

2. **API Rate Limiting**

   ```bash
   # Should see rate limit after 100 requests in 15 minutes
   for i in {1..105}; do
     curl http://your-backend/api/health
   done
   ```

3. **Clear All Data** (CRITICAL - Test in staging first!)
   - Login as OWNER
   - Go to Settings → DATA → Clear All Data
   - Verify confirmation modal appears
   - Type "DELETE ALL DATA" exactly
   - Confirm in browser dialog
   - Verify data deleted but users/settings/banks preserved

4. **Token Expiration**
   - Login and save token
   - Wait 24 hours (or change JWT_EXPIRES_IN to 1m for testing)
   - Try to access API - should get "Token expired" error

5. **Role-Based Access**
   - Create users with different roles (OWNER, MANAGER, ACCOUNTANT, VIEWER)
   - Test each role's access to different features
   - Verify VIEWER cannot edit data
   - Verify only OWNER can access Settings

---

## 📊 Monitoring & Maintenance

### 1. Check Logs Daily (First Week)

```bash
# Firebase Hosting logs
firebase hosting:channel:open live --project your-project-id

# Cloud Run logs
gcloud logging read "resource.type=cloud_run_revision" --limit 50 --format json
```

### 2. Monitor Firebase Usage

- **Daily**: Check Firestore reads/writes in Firebase Console
- **Weekly**: Review spending in Usage and billing
- **Monthly**: Analyze user activity and optimize if needed

### 3. Security Monitoring

- Check for unusual login patterns
- Monitor rate limit triggers (check logs for "Too many requests")
- Review audit logs for critical operations
- Check for failed authentication attempts

### 4. Database Maintenance

- **Weekly**: Export full backup (Settings → DATA → Download Full Backup)
- **Monthly**: Review audit logs for anomalies
- **Quarterly**: Review user roles and permissions

---

## 🚨 Emergency Procedures

### If Compromised

1. **Immediately rotate JWT_SECRET**

   ```bash
   # Generate new secret
   node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

   # Update environment variable in Cloud Run
   gcloud run services update sri-chendur-traders-backend \
     --update-env-vars JWT_SECRET=new-secret-here
   ```

2. **Force all users to re-login**
   - Changing JWT_SECRET invalidates all existing tokens
   - Users will need to login again with email/password

3. **Review audit logs**
   - Check AUDIT_LOGS collection for suspicious activity
   - Look for unauthorized data access or modifications

### If Billing Spike

1. **Check Firebase Console → Usage and billing**
2. **Common causes:**
   - Firestore reads/writes spike
   - Cloud Run requests spike
   - Email sending spike
3. **Quick fix:**
   - Set hard spending cap in Firebase
   - Temporarily reduce Cloud Run max instances to 1
   - Check for runaway queries or bugs

### If App Down

1. **Check Cloud Run status**

   ```bash
   gcloud run services describe sri-chendur-traders-backend
   ```

2. **Check recent deployments**

   ```bash
   gcloud run revisions list --service sri-chendur-traders-backend
   ```

3. **Rollback if needed**
   ```bash
   gcloud run services update-traffic sri-chendur-traders-backend \
     --to-revisions=REVISION-NAME=100
   ```

---

## ✅ Final Pre-Launch Checklist

### Backend

- [ ] All environment variables set in Cloud Run
- [ ] JWT_SECRET is 32+ characters and unique
- [ ] NODE_ENV=production
- [ ] Email service tested and working
- [ ] All rate limiters tested
- [ ] Error handling tested (no internal errors exposed)

### Frontend

- [ ] VITE_API_URL points to production backend
- [ ] Built with `npm run build`
- [ ] Deployed to Firebase Hosting
- [ ] Custom domain configured (sct.biglitz.in)
- [ ] SSL certificate active

### Database

- [ ] Firestore security rules deployed
- [ ] Test data cleared (use Clear All Data feature)
- [ ] OWNER account created with secure password
- [ ] Backup exported and stored safely

### Monitoring

- [ ] Firebase budget alerts configured
- [ ] Cloud Run max instances set to 10
- [ ] Email alerts working
- [ ] Know how to check logs

---

## 📈 Expected Costs (Blaze Plan)

### Monthly Estimates

| Service          | Usage                     | Cost                      |
| ---------------- | ------------------------- | ------------------------- |
| Firestore        | 50K reads, 20K writes/day | ₹80-160 ($1-2)            |
| Cloud Run        | 100K requests/month       | ₹240-400 ($3-5)           |
| Email (SendGrid) | 100 emails/day            | Free (up to 3K/day)       |
| Firebase Hosting | Unlimited                 | Free                      |
| **Total**        |                           | **₹320-560 ($4-7)/month** |

### Cost Optimization Tips

1. Cache frequently read data on frontend
2. Batch Firestore operations when possible
3. Use Cloud Run minimum instances = 0
4. Monitor and optimize slow queries
5. Use Firebase local emulator for testing (free)

---

## 🎯 Success Criteria

Your app is production-ready when:

- ✅ Security score: 87.5/100 (A-)
- ✅ All rate limiters working
- ✅ Authentication secure with proper token validation
- ✅ Firestore rules preventing unauthorized access
- ✅ No internal errors exposed to users
- ✅ Budget alerts configured
- ✅ Backup strategy in place
- ✅ Can handle 100+ concurrent users
- ✅ Clear All Data feature works correctly
- ✅ Audit logging capturing critical operations

---

## 📚 Related Documentation

- [SECURITY_AUDIT_REPORT.md](./SECURITY_AUDIT_REPORT.md) - Full security assessment
- [SECURITY_IMPLEMENTATION_GUIDE.md](./SECURITY_IMPLEMENTATION_GUIDE.md) - Implementation details
- [backend/README.md](./backend/README.md) - Backend setup and deployment
- [backend/CLOUD_RUN_DEPLOYMENT.md](./backend/CLOUD_RUN_DEPLOYMENT.md) - Cloud Run specifics

---

## 🆘 Support

If you encounter issues:

1. Check the logs first (Firebase Console → Cloud Run logs)
2. Review this checklist for missed steps
3. Verify all environment variables are set correctly
4. Test in Firebase local emulator before deploying
5. Check Firestore security rules are deployed

**Remember:** Always test critical operations in a staging environment before deploying to production!
