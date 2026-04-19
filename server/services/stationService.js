const db = require('../db');

exports.getAllStations = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT s.*, COUNT(o.id) as officer_count 
       FROM stations s LEFT JOIN officers o ON o.station_id = s.id
       GROUP BY s.id ORDER BY s.name`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.createStation = async (req, res) => {
  try {
    const { name, address, lat, lng, phone } = req.body;
    const [result] = await db.query(
      `INSERT INTO stations (name, address, lat, lng, phone, created_at) VALUES (?, ?, ?, ?, ?, NOW())`,
      [name, address, lat, lng, phone]
    );
    res.status(201).json({ success: true, data: { id: result.insertId } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
