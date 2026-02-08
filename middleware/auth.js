import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-in-production';

// Combined auth checker - accepts session OR JWT
export function requireAuth(req, res, next) {
  // Check session first (existing server-rendered pages)
  if (req.session && req.session.customerId) {
    req.customerId = req.session.customerId;
    return next();
  }

  // Check JWT token (React frontend)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.customerId = decoded.customerId;
      req.userRole = decoded.role;
      req.userEmail = decoded.email;
      return next();
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  }

  return res.status(401).json({ 
    error: 'Unauthorized',
    message: 'Please log in to access this resource'
  });
}

// Tenant isolation - ensure customer can only access their own data
export function requireOwnData(req, res, next) {
  const requestedCustomerId = parseInt(req.params.customerId || req.body.customerId);
  
  if (!requestedCustomerId) {
    return res.status(400).json({ error: 'Customer ID required' });
  }
  
  if (requestedCustomerId !== req.customerId) {
    console.warn('[SECURITY] Attempted unauthorized access:', {
      sessionCustomerId: req.customerId,
      requestedCustomerId,
      ip: req.ip,
      path: req.path
    });
    
    return res.status(403).json({ 
      error: 'Forbidden',
      message: 'You can only access your own data'
    });
  }
  
  next();
}

// Generate JWT token
export function generateToken(user) {
  return jwt.sign(
    { 
      customerId: user.customerId,
      email: user.email,
      name: user.name,
      role: user.role || 'customer',
      botLimit: user.botLimit || 1
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// Rate limiting for login attempts (5 attempts per 15 minutes)
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' }
});

// Rate limiting for signup (3 attempts per hour)
export const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: { error: 'Too many signup attempts. Please try again later.' }
});
