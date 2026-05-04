const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../db');

// Secret key for signing tokens (Keep this safe in a .env file in a real production app)
const SECRET_KEY = 'patrol_ai_super_secret_key_2026';

exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;

    // 1. Find user in database
    const [users] = await db.query('SELECT * FROM users WHERE username = ?', [username]);
    if (!users.length) return res.status(401).json({ success: false, error: 'Invalid username or password' });

    // 2. Check if password matches the hash
    const validPassword = await bcrypt.compare(password, users[0].password_hash);
    if (!validPassword) return res.status(401).json({ success: false, error: 'Invalid username or password' });

    // 3. Generate a JWT token valid for 8 hours
    const token = jwt.sign(
      { id: users[0].id, role: users[0].role, username: users[0].username }, 
      SECRET_KEY, 
      { expiresIn: '8h' }
    );

    res.json({ success: true, token, message: 'Login successful' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};