const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 5000;

const authController = require('./controllers/authController');
const verifyToken = require('./authMiddleware');

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../client/public')));

app.post('/api/auth/login', authController.login);

// Routes
app.use('/api/crimes', verifyToken, require('./routes/crimeRoutes'));
app.use('/api/officers', verifyToken, require('./routes/officerRoutes'));
app.use('/api/patrols', verifyToken, require('./routes/patrolRoutes'));
app.use('/api/stations', verifyToken, require('./routes/stationRoutes'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'Patrol-AI Server Running', timestamp: new Date() });
});

// Serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/public/index.html'));
});

app.listen(PORT, () => {
  console.log(`Patrol-AI Server running on http://localhost:5000/index.html`);
});

module.exports = app;