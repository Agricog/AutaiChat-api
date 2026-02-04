import rateLimit from 'express-rate-limit';

// Session checker middleware
export function requireAuth(req, res, next) {
  if (!req.session || !req.session.customerId) {
    return res.status(401).json({ 
      error: 'Unauthorized',
      message: 'Please log in to access this resource'
    });
  }
  
  // Attach customer ID to request for easy access
  req.customerId = req.session.customerId;
  next();
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

// Rate limiting for login attempts (5 attempts per 15 minutes)
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts
  message: 'Too many login attempts. Please try again in 15 minutes.',
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too many requests',
      message: 'Too many login attempts. Please try again in 15 minutes.',
      retryAfter: Math.ceil(req.rateLimit.resetTime / 1000)
    });
  }
});

// Rate limiting for signup (3 signups per hour per IP)
export const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  message: 'Too many accounts created. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false
});
