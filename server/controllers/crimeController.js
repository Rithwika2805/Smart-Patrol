const db = require('../db');

// GET all crimes with filters
exports.getAllCrimes = async (req, res) => {
  try {
    const { type, status, area, startDate, endDate, limit = 100 } = req.query; 
    
    let query = `SELECT c.*, h.risk_score, h.zone_name 
                 FROM crimes c 
                 LEFT JOIN hotspots h ON c.area_id = h.id 
                 WHERE 1=1`;
    const params = [];

    if (type) { query += ` AND c.crime_type = ?`; params.push(type); }
    
    if (status) { 
      query += ` AND c.status = ?`; 
      params.push(status); 
    }

    if (area) { query += ` AND c.area_id = ?`; params.push(area); }
    if (startDate) { query += ` AND c.occurred_at >= ?`; params.push(startDate); }
    if (endDate) { query += ` AND c.occurred_at <= ?`; params.push(endDate); }

    query += ` ORDER BY c.occurred_at DESC LIMIT ?`;
    params.push(parseInt(limit));

    const [rows] = await db.query(query, params);
    res.json({ success: true, data: rows, count: rows.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// GET crime by ID
exports.getCrimeById = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT c.*, h.risk_score, h.zone_name, h.lat, h.lng 
       FROM crimes c LEFT JOIN hotspots h ON c.area_id = h.id 
       WHERE c.id = ?`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, error: 'Crime not found' });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// POST create crime report
exports.createCrime = async (req, res) => {
  try {
    const { crime_type, description, area_id, latitude, longitude, severity, occurred_at, reported_by } = req.body;
    
    if (!crime_type || !area_id) {
      return res.status(400).json({ success: false, error: 'crime_type and area_id are required' });
    }

    const [result] = await db.query(
      `INSERT INTO crimes (crime_type, description, area_id, latitude, longitude, severity, occurred_at, reported_by, status) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open')`,
      [crime_type, description, area_id, latitude, longitude, severity || 'medium', occurred_at || new Date(), reported_by]
    );

    // Update hotspot risk score after new crime
    await updateHotspotRisk(area_id);

    res.status(201).json({ success: true, data: { id: result.insertId }, message: 'Crime report created' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// PUT update crime
exports.updateCrime = async (req, res) => {
  try {
    const { status, description, severity } = req.body;
    const [result] = await db.query(
      `UPDATE crimes SET status = COALESCE(?, status), description = COALESCE(?, description), 
       severity = COALESCE(?, severity), updated_at = NOW() WHERE id = ?`,
      [status, description, severity, req.params.id]
    );
    if (!result.affectedRows) return res.status(404).json({ success: false, error: 'Crime not found' });
    res.json({ success: true, message: 'Crime updated' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// DELETE crime
exports.deleteCrime = async (req, res) => {
  try {
    const [result] = await db.query(`DELETE FROM crimes WHERE id = ?`, [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ success: false, error: 'Crime not found' });
    res.json({ success: true, message: 'Crime deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// GET crime statistics
exports.getCrimeStats = async (req, res) => {
  try {
    const [byType] = await db.query(
      `SELECT crime_type, COUNT(*) as count, 
       SUM(CASE WHEN severity='high' THEN 1 ELSE 0 END) as high_severity
       FROM crimes WHERE occurred_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
       GROUP BY crime_type ORDER BY count DESC`
    );

    const [byHour] = await db.query(
      `SELECT HOUR(occurred_at) as hour, COUNT(*) as count 
       FROM crimes GROUP BY HOUR(occurred_at) ORDER BY hour`
    );

    const [byArea] = await db.query(
      `SELECT h.zone_name, COUNT(c.id) as crime_count, h.risk_score
       FROM hotspots h LEFT JOIN crimes c ON c.area_id = h.id
       WHERE c.occurred_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
       GROUP BY h.id ORDER BY crime_count DESC LIMIT 10`
    );

    const [totals] = await db.query(
      `SELECT COUNT(*) as total, 
       SUM(CASE WHEN status='open' THEN 1 ELSE 0 END) as open_cases,
       SUM(CASE WHEN status='resolved' THEN 1 ELSE 0 END) as resolved,
       SUM(CASE WHEN severity='high' THEN 1 ELSE 0 END) as high_severity
       FROM crimes`
    );

    res.json({ success: true, data: { byType, byHour, byArea, totals: totals[0] } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// GET hotspots
exports.getHotspots = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT h.*, COUNT(c.id) as recent_crimes 
       FROM hotspots h 
       LEFT JOIN crimes c ON c.area_id = h.id AND c.occurred_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
       GROUP BY h.id ORDER BY h.risk_score DESC`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// AI Risk Prediction
exports.predictRisk = async (req, res) => {
  try {
    const { area_id, time_of_day, day_of_week } = req.body;

    const [historicalData] = await db.query(
      `SELECT crime_type, severity, HOUR(occurred_at) as hour, DAYOFWEEK(occurred_at) as dow,
       COUNT(*) as frequency
       FROM crimes WHERE area_id = ?
       GROUP BY crime_type, severity, HOUR(occurred_at), DAYOFWEEK(occurred_at)`,
      [area_id]
    );

    const [hotspot] = await db.query(`SELECT * FROM hotspots WHERE id = ?`, [area_id]);

    if (!hotspot.length) return res.status(404).json({ success: false, error: 'Area not found' });

    // Simple risk calculation algorithm
    let riskScore = hotspot[0].risk_score || 50;
    const relevantData = historicalData.filter(d =>
      Math.abs(d.hour - time_of_day) <= 2 &&
      (day_of_week ? d.dow === day_of_week : true)
    );

    if (relevantData.length > 0) {
      const avgFrequency = relevantData.reduce((sum, d) => sum + d.frequency, 0) / relevantData.length;
      const highSeverityCount = relevantData.filter(d => d.severity === 'high').length;
      riskScore = Math.min(100, riskScore + (avgFrequency * 2) + (highSeverityCount * 5));
    }

    const riskLevel = riskScore >= 75 ? 'HIGH' : riskScore >= 50 ? 'MEDIUM' : 'LOW';
    const topCrimes = [...new Set(historicalData.map(d => d.crime_type))].slice(0, 3);

    res.json({
      success: true,
      data: {
        area_id,
        zone_name: hotspot[0].zone_name,
        risk_score: Math.round(riskScore),
        risk_level: riskLevel,
        predicted_crimes: topCrimes,
        analysis: `Based on ${historicalData.length} historical records`,
        recommendation: riskLevel === 'HIGH'
          ? 'Deploy 2+ officers immediately'
          : riskLevel === 'MEDIUM'
            ? 'Increase patrol frequency'
            : 'Standard patrol schedule'
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// Update hotspot risk score
async function updateHotspotRisk(areaId) {
  try {
    const [recent] = await db.query(
      `SELECT 
         COUNT(*) as count, 
         SUM(CASE 
           WHEN severity='critical' THEN 4
           WHEN severity='high' THEN 3 
           WHEN severity='medium' THEN 2 
           ELSE 1 
         END) as weighted
       FROM crimes 
       WHERE area_id = ? 
       AND occurred_at >= DATE_SUB(NOW(), INTERVAL 90 DAY)`,
      [areaId]
    );

    if (!recent.length) return;

    const weighted = recent[0].weighted || 0;

    // Normalize to 0–100 scale
    const normalized = Math.min(100, weighted * 2);

    const [hotspot] = await db.query(
      `SELECT risk_score FROM hotspots WHERE id = ?`,
      [areaId]
    );

    const previousScore = hotspot[0]?.risk_score ?? 0;

    const newScore = Math.round(
      (previousScore * 0.7) + (normalized * 0.3)
    );

    await db.query(
      `UPDATE hotspots 
       SET risk_score = ?, updated_at = NOW() 
       WHERE id = ?`,
      [newScore, areaId]
    );

  } catch (err) {
    console.error('Error updating hotspot risk:', err);
  }
}