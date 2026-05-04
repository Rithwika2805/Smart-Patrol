const db = require('../db');

// GET all officers
exports.getAllOfficers = async (req, res) => {
  try {
    const { status, designation, shift } = req.query;
    let query = `SELECT o.*, 
                 COUNT(p.id) as total_patrols,
                 SUM(CASE WHEN p.status='active' THEN 1 ELSE 0 END) as active_patrols
                 FROM officers o
                 LEFT JOIN patrols p ON p.officer_id = o.id
                 WHERE 1=1`;
    const params = [];

    if (status) { query += ` AND o.status = ?`; params.push(status); }
    if (designation) { query += ` AND o.designation = ?`; params.push(designation); }
    if (shift) { query += ` AND o.shift = ?`; params.push(shift); }

    query += ` GROUP BY o.id ORDER BY o.name`;
    const [rows] = await db.query(query, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// GET officer by ID
exports.getOfficerById = async (req, res) => {
  try {
    const [officer] = await db.query(`SELECT * FROM officers WHERE id = ?`, [req.params.id]);
    if (!officer.length) return res.status(404).json({ success: false, error: 'Officer not found' });

    const [recentPatrols] = await db.query(
      `SELECT p.*, GROUP_CONCAT(h.zone_name) as zones 
       FROM patrols p 
       LEFT JOIN patrol_waypoints pw ON pw.patrol_id = p.id
       LEFT JOIN hotspots h ON pw.area_id = h.id
       WHERE p.officer_id = ? GROUP BY p.id ORDER BY p.start_time DESC LIMIT 10`,
      [req.params.id]
    );

    res.json({ success: true, data: { ...officer[0], recentPatrols } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// POST create officer
exports.createOfficer = async (req, res) => {
  try {
    const { name, badge_number, designation, phone, email, shift, station_id } = req.body;

    if (!name || !badge_number) {
      return res.status(400).json({ success: false, error: 'name and badge_number required' });
    }

    // Check badge uniqueness
    const [existing] = await db.query(`SELECT id FROM officers WHERE badge_number = ?`, [badge_number]);
    if (existing.length) return res.status(400).json({ success: false, error: 'Badge number already exists' });

    const [result] = await db.query(
      `INSERT INTO officers (name, badge_number, designation, phone, email, shift, station_id, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'available', NOW())`,
      [name, badge_number, designation || 'Constable', phone, email, shift || 'morning', station_id]
    );

    res.status(201).json({ success: true, data: { id: result.insertId }, message: 'Officer created' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// PUT update officer
exports.updateOfficer = async (req, res) => {
  try {
    const { name, designation, phone, email, shift, status, station_id } = req.body;
    const [result] = await db.query(
      `UPDATE officers SET 
       name = COALESCE(?, name), designation = COALESCE(?, designation), phone = COALESCE(?, phone),
       email = COALESCE(?, email), shift = COALESCE(?, shift), status = COALESCE(?, status),
       station_id = COALESCE(?, station_id), updated_at = NOW()
       WHERE id = ?`,
      [name, designation, phone, email, shift, status, station_id, req.params.id]
    );
    if (!result.affectedRows) return res.status(404).json({ success: false, error: 'Officer not found' });
    res.json({ success: true, message: 'Officer updated' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// DELETE officer
exports.deleteOfficer = async (req, res) => {
  try {
    const [active] = await db.query(
      `SELECT id FROM patrols WHERE officer_id = ? AND status = 'active'`, [req.params.id]
    );
    if (active.length) return res.status(400).json({ success: false, error: 'Cannot delete officer on active patrol' });

    const [result] = await db.query(`DELETE FROM officers WHERE id = ?`, [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ success: false, error: 'Officer not found' });
    res.json({ success: true, message: 'Officer deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// GET available officers
exports.getAvailableOfficers = async (req, res) => {
  try {
    const { shift } = req.query;
    let query = `SELECT o.*, s.name as station_name 
                 FROM officers o LEFT JOIN stations s ON o.station_id = s.id
                 WHERE o.status = 'available'`;
    const params = [];
    if (shift) { query += ` AND o.shift = ?`; params.push(shift); }
    query += ` ORDER BY o.designation, o.name`;

    const [rows] = await db.query(query, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};