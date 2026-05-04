const db = require('../db');
const patrolService = require('../services/patrolService');
const routeService = require('../services/routeService');
const officerService = require('../services/officerService');

// GET all patrols
exports.getAllPatrols = async (req, res) => {
  try {
    const { status, officer_id, date } = req.query;
    let query = `SELECT p.*, o.name as officer_name, o.badge_number, o.designation
                 FROM patrols p JOIN officers o ON p.officer_id = o.id WHERE 1=1`;
    const params = [];

    if (status) { query += ` AND p.status = ?`; params.push(status); }
    if (officer_id) { query += ` AND p.officer_id = ?`; params.push(officer_id); }
    if (date) { query += ` AND DATE(p.start_time) = ?`; params.push(date); }

    query += ` ORDER BY p.start_time DESC LIMIT 100`;
    const [rows] = await db.query(query, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// GET patrol by ID with full route, zone names, and team members
exports.getPatrolById = async (req, res) => {
  try {
    const [patrol] = await db.query(
      `SELECT p.*, o.name as officer_name, o.badge_number, o.designation, o.phone
       FROM patrols p JOIN officers o ON p.officer_id = o.id WHERE p.id = ?`,
      [req.params.id]
    );
    if (!patrol.length) return res.status(404).json({ success: false, error: 'Patrol not found' });

    // Join hotspots to get the actual zone_name and risk_score
    const [waypoints] = await db.query(
      `SELECT pw.*, h.zone_name, h.risk_score
       FROM patrol_waypoints pw 
       LEFT JOIN hotspots h ON pw.area_id = h.id
       WHERE pw.patrol_id = ? ORDER BY pw.sequence_order`,
      [req.params.id]
    );

    const [team] = await db.query(
      `SELECT o.id, o.name, o.designation, o.badge_number 
       FROM patrols p 
       JOIN officers o ON p.officer_id = o.id 
       WHERE p.start_time = ? AND p.end_time = ? AND p.status = ?`,
      [patrol[0].start_time, patrol[0].end_time, patrol[0].status]
    );

    res.json({ success: true, data: { ...patrol[0], waypoints, team } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// POST create patrol assignment
exports.createPatrol = async (req, res) => {
  try {
    const { area_ids, start_time, end_time, notes } = req.body;
    
    let targetOfficers = [];
    if (req.body.officer_ids) targetOfficers = req.body.officer_ids;
    else if (req.body.officer_id) targetOfficers = [req.body.officer_id];

    if (!targetOfficers.length || !area_ids?.length) {
      return res.status(400).json({ success: false, error: 'officer_id(s) and area_ids required' });
    }

    const formatDateTime = (iso) => {
      const d = new Date(iso);
      const pad = (n) => n.toString().padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    };

    const formattedStart = formatDateTime(start_time);
    const formattedEnd = formatDateTime(end_time);

    const optimizedRoute = await routeService.generateOptimizedRoute(area_ids);
    const insertedPatrolIds = [];

    for (let officer_id of targetOfficers) {
      const isAvailable = await officerService.isOfficerAvailable(officer_id, formattedStart, formattedEnd);
      if (!isAvailable) continue;

      const [result] = await db.query(
        `INSERT INTO patrols (officer_id, route_data, start_time, end_time, status, notes, created_at)
         VALUES (?, ?, ?, ?, 'scheduled', ?, NOW())`,
        [officer_id, JSON.stringify(optimizedRoute), formattedStart, formattedEnd, notes]
      );

      if (optimizedRoute.waypoints?.length) {
        for (let i = 0; i < optimizedRoute.waypoints.length; i++) {
          const wp = optimizedRoute.waypoints[i];
          await db.query(
            `INSERT INTO patrol_waypoints (patrol_id, area_id, lat, lng, sequence_order, estimated_arrival)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [result.insertId, wp.area_id, wp.lat, wp.lng, i + 1, formatDateTime(wp.estimated_arrival)]
          );
        }
      }
      await db.query(`UPDATE officers SET status = 'on_duty' WHERE id = ?`, [officer_id]);
      insertedPatrolIds.push(result.insertId);
    }

    res.status(201).json({ success: true, data: { ids: insertedPatrolIds, route: optimizedRoute }, message: 'Team Patrol assigned' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.updateWaypointStatus = async (req, res) => {
  try {
    const { waypoint_id } = req.params;
    const { status } = req.body;

    if (!['reached', 'skipped'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status' });
    }

    const [[wp]] = await db.query(
      `SELECT patrol_id, lat, lng 
       FROM patrol_waypoints 
       WHERE id = ?`,
      [waypoint_id]
    );

    if (!wp) {
      return res.status(404).json({ success: false, error: 'Waypoint not found' });
    }

    await db.query(
      `UPDATE patrol_waypoints 
       SET status = ? 
       WHERE id = ?`,
      [status, waypoint_id]
    );

    if (status === 'reached') {
      await db.query(
        `UPDATE patrols 
         SET current_lat = ?, current_lng = ?, updated_at = NOW()
         WHERE id = ?`,
        [wp.lat, wp.lng, wp.patrol_id]
      );
    }

    res.json({ 
      success: true, 
      message: `Waypoint marked as ${status} and position updated`
    });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// PUT update patrol status
exports.updatePatrolStatus = async (req, res) => {
  try {
    const { status, current_lat, current_lng, notes } = req.body;
    const validStatuses = ['scheduled', 'active', 'completed', 'cancelled'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status' });
    }

    const [patrol] = await db.query(`SELECT * FROM patrols WHERE id = ?`, [req.params.id]);
    if (!patrol.length) return res.status(404).json({ success: false, error: 'Patrol not found' });

    await db.query(
      `UPDATE patrols SET status = ?, current_lat = COALESCE(?, current_lat), 
       current_lng = COALESCE(?, current_lng), notes = COALESCE(?, notes),
       ${status === 'completed' ? 'end_time = NOW(),' : ''} updated_at = NOW() WHERE id = ?`,
      [status, current_lat, current_lng, notes, req.params.id]
    );

    // If completed or cancelled, free up the officer
    if (['completed', 'cancelled'].includes(status)) {
      await db.query(`UPDATE officers SET status = 'available' WHERE id = ?`, [patrol[0].officer_id]);
    }

    res.json({ success: true, message: `Patrol status updated to ${status}` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// POST generate AI patrol suggestions
exports.generatePatrolSuggestions = async (req, res) => {
  try {
    const suggestions = await patrolService.generateSmartSuggestions(req.body.timeframe);
    res.json({ success: true, data: suggestions });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// GET active patrols with live positions
exports.getActivePatrols = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT p.id, p.current_lat, p.current_lng, p.status, p.start_time,
       o.name as officer_name, o.badge_number, o.designation,
       h.zone_name as assigned_zone
       FROM patrols p 
       JOIN officers o ON p.officer_id = o.id
       LEFT JOIN patrol_waypoints pw ON pw.patrol_id = p.id AND pw.sequence_order = 1
       LEFT JOIN hotspots h ON pw.area_id = h.id
       WHERE p.status = 'active'`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// GET patrol analytics
exports.getPatrolAnalytics = async (req, res) => {
  try {
    const [coverage] = await db.query(
      `SELECT DATE(start_time) as date, COUNT(*) as patrol_count,
       SUM(TIMESTAMPDIFF(MINUTE, start_time, COALESCE(end_time, NOW()))) as total_minutes
       FROM patrols WHERE start_time >= DATE_SUB(NOW(), INTERVAL 7 DAY)
       GROUP BY DATE(start_time) ORDER BY date`
    );

    const [officerPerformance] = await db.query(
      `SELECT o.name, o.badge_number, COUNT(p.id) as total_patrols,
       SUM(CASE WHEN p.status='completed' THEN 1 ELSE 0 END) as completed
       FROM officers o LEFT JOIN patrols p ON p.officer_id = o.id
       GROUP BY o.id ORDER BY total_patrols DESC LIMIT 10`
    );

    const [zonesCovered] = await db.query(
      `SELECT h.zone_name, COUNT(DISTINCT pw.patrol_id) as patrol_visits
       FROM hotspots h 
       LEFT JOIN patrol_waypoints pw ON pw.area_id = h.id
       LEFT JOIN patrols p ON pw.patrol_id = p.id AND p.start_time >= DATE_SUB(NOW(), INTERVAL 7 DAY)
       GROUP BY h.id ORDER BY patrol_visits DESC`
    );

    res.json({ success: true, data: { coverage, officerPerformance, zonesCovered } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};