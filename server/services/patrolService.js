const db = require('../db');
const officerService = require('./officerService');
const routeService = require('./routeService');

// Generate smart AI patrol suggestions
exports.generateSmartSuggestions = async () => {
  const currentHour = new Date().getHours();
  const currentShift = currentHour >= 6 && currentHour < 14 ? 'morning'
    : currentHour >= 14 && currentHour < 22 ? 'evening' : 'night';

  // 1. Fetch currently active/scheduled zones to prevent duplicate assignments
  const [activePatrols] = await db.query(`
    SELECT DISTINCT pw.area_id FROM patrol_waypoints pw
    JOIN patrols p ON p.id = pw.patrol_id
    WHERE p.status IN ('active', 'scheduled')
  `);
  // Filter out nulls just in case
  const activeZoneIds = new Set(activePatrols.map(p => p.area_id).filter(id => id != null));

  // 2. Get high-risk hotspots (excluding already patrolled ones)
  const [allHotspots] = await db.query(`
    SELECT h.*, COUNT(c.id) as recent_crimes
    FROM hotspots h
    LEFT JOIN crimes c ON c.area_id = h.id AND c.occurred_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
    GROUP BY h.id HAVING recent_crimes > 0 OR h.risk_score > 50
    ORDER BY h.risk_score DESC, recent_crimes DESC
  `);
  
  const hotspots = allHotspots.filter(h => !activeZoneIds.has(h.id)).slice(0, 10);

  // 3. Get available officers
  const availableOfficers = await officerService.getOfficersByShift(currentShift);
  const workloadData = await officerService.getOfficerWorkload();

  const officersByWorkload = availableOfficers.map(o => ({
    ...o, recent_patrols: workloadData.find(w => w.id === o.id)?.recent_patrols || 0
  })).sort((a, b) => a.recent_patrols - b.recent_patrols);

  const suggestions = [];
  const usedOfficers = new Set();
  // Ensure we have at least enough officers to form a team
  const maxSuggestions = Math.min(Math.floor(availableOfficers.length / 2), hotspots.length, 5);

  const formatDateTime = (d) => {
    const pad = (n) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };

  for (let i = 0; i < maxSuggestions; i++) {
    const hotspot = hotspots[i];
    const priority = hotspot.risk_score >= 75 ? 'HIGH' : hotspot.risk_score >= 50 ? 'MEDIUM' : 'LOW';
    
    // Determine team size based on risk
    const targetTeamSize = priority === 'HIGH' ? 3 : 2;
    let team = [];
    let selectedStartTime = new Date();
    let selectedEndTime = new Date();
    selectedEndTime.setHours(selectedEndTime.getHours() + (priority === 'HIGH' ? 4 : 3));

    // 🔍 Find a TEAM of available & unused officers
    for (let officer of officersByWorkload) {
      if (usedOfficers.has(officer.id)) continue;
      
      // Use formatted strings to prevent Date object serialization crashes
      const isAvailable = await officerService.isOfficerAvailable(
        officer.id, 
        formatDateTime(selectedStartTime), 
        formatDateTime(selectedEndTime)
      );
      
      if (isAvailable) {
        team.push({
          id: officer.id, name: officer.name, badge_number: officer.badge_number,
          designation: officer.designation, recent_patrols: officer.recent_patrols
        });
        usedOfficers.add(officer.id);
        if (team.length >= targetTeamSize) break;
      }
    }

    if (team.length === 0) continue; // Skip if no officers available for this route

    // 📍 Get mixed zones (high + medium)
    // Bulletproof NOT IN clause to avoid mysql2 array parameter bugs
    const activeIdsArr = Array.from(activeZoneIds);
    const notInClause = activeIdsArr.length > 0 ? `AND id NOT IN (${activeIdsArr.join(',')})` : '';

    const [mixedZones] = await db.query(`
      SELECT id, zone_name, lat, lng, risk_score FROM hotspots 
      WHERE id != ? ${notInClause}
      ORDER BY risk_score DESC LIMIT 5
    `, [hotspot.id]);

    let selectedZones = [...mixedZones.filter(z => z.risk_score < 75).slice(0, 1), ...mixedZones.filter(z => z.risk_score >= 75).slice(0, 2)].slice(0, 3);
    const route = await routeService.generateOptimizedRoute([hotspot.id, ...selectedZones.map(z => z.id)]);

    suggestions.push({
      priority, team,
      primary_zone: { id: hotspot.id, name: hotspot.zone_name, risk_score: hotspot.risk_score, lat: hotspot.lat, lng: hotspot.lng },
      suggested_start_time: selectedStartTime,
      suggested_end_time: selectedEndTime,
      additional_zones: selectedZones,
      optimized_route: route,
      suggested_duration_hours: priority === 'HIGH' ? 4 : 3,
      reason: buildReason(hotspot, currentHour),
      shift: currentShift
    });
  }

  return {
    suggestions, shift: currentShift, generated_at: new Date(),
    available_officers: availableOfficers.length - usedOfficers.size,
    high_risk_zones: hotspots.filter(h => h.risk_score >= 75).length
  };
};

function buildReason(hotspot, hour) {
  const reasons = [];
  if (hotspot.risk_score >= 75) reasons.push(`High risk score (${hotspot.risk_score}/100)`);
  if (hotspot.recent_crimes > 3) reasons.push(`${hotspot.recent_crimes} crimes in last 7 days`);
  if (hour >= 20 || hour <= 6) reasons.push('Night hours — historically high crime period');
  return reasons.join('; ') || 'Regular patrol coverage needed';
}

function buildReason(hotspot, hour) {
  const reasons = [];
  if (hotspot.risk_score >= 75) reasons.push(`High risk score (${hotspot.risk_score}/100)`);
  if (hotspot.recent_crimes > 3) reasons.push(`${hotspot.recent_crimes} crimes in last 7 days`);
  if (hour >= 20 || hour <= 6) reasons.push('Night hours — historically high crime period');
  return reasons.join('; ') || 'Regular patrol coverage needed';
}

function getTimeForHour(hour) {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);

  // If time already passed today → move to next day
  if (d < new Date()) {
    d.setDate(d.getDate() + 1);
  }

  return d;
}