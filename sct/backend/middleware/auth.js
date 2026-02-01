import jwt from 'jsonwebtoken';
import { db, COLLECTIONS } from '../config/firebase.js';

export const authenticate = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ error: { message: 'No token provided' } });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user from Firestore
    const userDoc = await db.collection(COLLECTIONS.USERS).doc(decoded.userId).get();
    
    if (!userDoc.exists) {
      return res.status(401).json({ error: { message: 'Invalid token' } });
    }

    const userData = userDoc.data();
    
    if (userData.status !== 'ACTIVE') {
      return res.status(403).json({ error: { message: 'User account is inactive' } });
    }

    req.user = {
      id: userDoc.id,
      ...userData
    };
    
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(401).json({ error: { message: 'Invalid or expired token' } });
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
