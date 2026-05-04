const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../db');

const SECRET_KEY = 'patrol_ai_super_secret_key_2026';

exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;

    const [users] = await db.query('SELECT * FROM users WHERE username = ?', [username]);
    if (!users.length) return res.status(401).json({ success: false, error: 'Invalid username or password' });

    const validPassword = await bcrypt.compare(password, users[0].password_hash);
    if (!validPassword) return res.status(401).json({ success: false, error: 'Invalid username or password' });

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