const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../client/public')));

// Routes
app.use('/api/crimes', require('./routes/crimeRoutes'));
app.use('/api/officers', require('./routes/officerRoutes'));
app.use('/api/patrols', require('./routes/patrolRoutes'));
app.use('/api/stations', require('./routes/stationRoutes'));

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