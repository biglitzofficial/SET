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
      // Owners have all permissions
      return next();
    }

    if (!req.user.permissions || !req.user.permissions[permission]) {
      return res.status(403).json({ error: { message: `Permission denied: ${permission}` } });
    }

    next();
  };
};
