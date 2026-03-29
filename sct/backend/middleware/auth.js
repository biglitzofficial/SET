import jwt from 'jsonwebtoken';
import { db, COLLECTIONS } from '../config/firebase.js';

export const authenticate = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ error: { message: 'No token provided' } });
    }

    // Verify JWT token with enhanced options
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET, {
        algorithms: ['HS256'], // Only allow HS256 algorithm for security
        complete: false,
        clockTolerance: 0, // No clock tolerance for production security
      });
    } catch (jwtError) {
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({ error: { message: 'Token expired. Please login again.' } });
      }
      if (jwtError.name === 'JsonWebTokenError') {
        return res.status(401).json({ error: { message: 'Invalid token' } });
      }
      throw jwtError;
    }
    
    // Validate token structure
    if (!decoded.userId) {
      return res.status(401).json({ error: { message: 'Invalid token structure' } });
    }
    
    // Get user from Firestore
    const userDoc = await db.collection(COLLECTIONS.USERS).doc(decoded.userId).get();
    
    if (!userDoc.exists) {
      return res.status(401).json({ error: { message: 'User not found' } });
    }

    const userData = userDoc.data();
    
    // Check user status
    if (userData.status !== 'ACTIVE') {
      return res.status(403).json({ error: { message: 'User account is inactive' } });
    }

    // Attach user to request with minimal data
    req.user = {
      id: userDoc.id,
      email: userData.email,
      name: userData.name,
      role: userData.role,
      permissions: userData.permissions,
      status: userData.status
    };
    
    next();
  } catch (error) {
    console.error('Auth middleware error:', {
      message: error.message,
      name: error.name,
      timestamp: new Date().toISOString()
    });
    return res.status(401).json({ error: { message: 'Authentication failed' } });
  }
};

export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: { message: 'Unauthorized' } });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: { message: 'Insufficient permissions' } });
    }

    next();
  };
};

export const checkPermission = (permission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: { message: 'Unauthorized' } });
    }

    if (req.user.role === 'OWNER') {
      return next();
    }

    if (!req.user.permissions || !req.user.permissions[permission]) {
      return res.status(403).json({ error: { message: `Permission denied: ${permission}` } });
    }

    next();
  };
};

/** Returns true if record date/createdAt/startDate is within today (local date). */
export const isRecordFromToday = (record) => {
  const ts = record.date ?? record.startDate ?? record.createdAt;
  if (ts == null) return false;
  const d = new Date(typeof ts === 'number' ? ts : ts);
  const today = new Date();
  return d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
};

/** For edit/delete: OWNER always allowed. Staff with permission only if record is from today. Returns error obj or null. */
export const assertStaffCanEditOrDelete = (req, record, action = 'edit') => {
  if (req.user.role === 'OWNER') return null;
  const perm = action === 'delete' ? 'canDelete' : 'canEdit';
  if (!req.user.permissions?.[perm]) {
    return { status: 403, message: `Permission denied: ${perm}` };
  }
  if (!isRecordFromToday(record)) {
    return { status: 403, message: 'Staff can only edit or delete entries dated today. Past entries require owner access.' };
  }
  return null;
};
