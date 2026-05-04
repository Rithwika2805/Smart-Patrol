const jwt = require('jsonwebtoken');
const SECRET_KEY = 'patrol_ai_super_secret_key_2026';

module.exports = (req, res, next) => {
  // Get the token from the request headers
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // "Bearer <token>"

  if (!token) {
    return res.status(403).json({ success: false, error: 'Access denied. No token provided.' });
  }

  // Verify the token
  jwt.verify(token, SECRET_KEY, (err, decodedUser) => {
    if (err) return res.status(401).json({ success: false, error: 'Invalid or expired token.' });
    
    // Attach user payload to request and proceed to the route
    req.user = decodedUser;
    next();
  });
};