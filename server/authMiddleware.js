const jwt = require('jsonwebtoken');
const SECRET_KEY = 'patrol_ai_super_secret_key_2026';

module.exports = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(403).json({ success: false, error: 'Access denied. No token provided.' });
  }

  jwt.verify(token, SECRET_KEY, (err, decodedUser) => {
    if (err) return res.status(401).json({ success: false, error: 'Invalid or expired token.' });
    
    req.user = decodedUser;
    next();
  });
};