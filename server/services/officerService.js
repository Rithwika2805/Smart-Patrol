const db = require('../db');

// Get officers by shift with their current status
exports.getOfficersByShift = async (shift) => {
  const [officers] = await db.query(
    `SELECT o.*, s.name as station_name, s.lat as station_lat, s.lng as station_lng
     FROM officers o 
     LEFT JOIN stations s ON o.station_id = s.id
     WHERE o.shift = ? AND o.status = 'available'
     ORDER BY o.designation DESC`,
    [shift]
  );
  return officers;
};

// Get officer workload (how many patrols in last 7 days)
exports.getOfficerWorkload = async () => {
  const [data] = await db.query(
    `SELECT o.id, o.name, o.badge_number, o.shift, o.status,
     COUNT(p.id) as recent_patrols,
     SUM(TIMESTAMPDIFF(HOUR, p.start_time, COALESCE(p.end_time, NOW()))) as total_hours
     FROM officers o
     LEFT JOIN patrols p ON p.officer_id = o.id 
       AND p.start_time >= DATE_SUB(NOW(), INTERVAL 7 DAY)
       AND p.status IN ('completed', 'active')
     GROUP BY o.id
     ORDER BY recent_patrols ASC`
  );
  return data;
};

// Check if officer is available for a time slot
exports.isOfficerAvailable = async (officerId, startTime, endTime) => {
  const [conflicts] = await db.query(
    `SELECT id FROM patrols 
    WHERE officer_id = ? 
    AND status NOT IN ('completed', 'cancelled')
    AND NOT (
      end_time <= ? OR start_time >= ?
    )`,
    [officerId, startTime, endTime]
  );
  return conflicts.length === 0;
};

// Get ALL available officers (for cross-shift emergencies)
exports.getAllAvailableOfficers = async () => {
  const [officers] = await db.query(
    `SELECT o.*, s.name as station_name, s.lat as station_lat, s.lng as station_lng
     FROM officers o 
     LEFT JOIN stations s ON o.station_id = s.id
     WHERE o.status = 'available'
     ORDER BY o.designation DESC`
  );
  return officers;
};