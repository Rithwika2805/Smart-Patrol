const db = require('../db');
const officerService = require('./officerService');

// Generate smart AI patrol suggestions
exports.generateSmartSuggestions = async () => {
  const currentHour = new Date().getHours();
  const currentShift = currentHour >= 6 && currentHour < 14 ? 'morning'
    : currentHour >= 14 && currentHour < 22 ? 'evening' : 'night';

  // Get high-risk hotspots
  const [hotspots] = await db.query(
    `SELECT h.*, 
     COUNT(c.id) as recent_crimes,
     AVG(CASE WHEN c.severity='high' THEN 3 WHEN c.severity='medium' THEN 2 ELSE 1 END) as avg_severity
     FROM hotspots h
     LEFT JOIN crimes c ON c.area_id = h.id 
       AND c.occurred_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
     GROUP BY h.id
     HAVING recent_crimes > 0 OR h.risk_score > 50
     ORDER BY h.risk_score DESC, recent_crimes DESC
     LIMIT 10`
  );

  // Get available officers for current shift
  const availableOfficers = await officerService.getOfficersByShift(currentShift);
  const workloadData = await officerService.getOfficerWorkload();

  // Sort officers by least workload
  const officersByWorkload = availableOfficers.map(o => {
    const workload = workloadData.find(w => w.id === o.id);
    return {
      ...o,
      recent_patrols: workload?.recent_patrols || 0
    };
  })
  .sort((a, b) => a.recent_patrols - b.recent_patrols);

  // Generate suggestions - pair officers with hotspots
  const suggestions = [];
  const maxSuggestions = Math.min(availableOfficers.length, hotspots.length, 5);

  for (let i = 0; i < maxSuggestions; i++) {
    const hotspot = hotspots[i];
    const officer = officersByWorkload[i];

    if (!officer) continue;

    const priority = hotspot.risk_score >= 75 ? 'HIGH'
      : hotspot.risk_score >= 50 ? 'MEDIUM' : 'LOW';

    // Get nearby hotspots for multi-zone coverage
    const [nearbyZones] = await db.query(
      `SELECT id, zone_name, lat, lng, risk_score 
       FROM hotspots 
       WHERE id != ? 
       ORDER BY risk_score DESC LIMIT 2`,
      [hotspot.id]
    );

    suggestions.push({
      priority,
      officer: {
        id: officer.id,
        name: officer.name,
        badge_number: officer.badge_number,
        designation: officer.designation,
        recent_patrols: officer.recent_patrols || 0
      },
      primary_zone: {
        id: hotspot.id,
        name: hotspot.zone_name,
        risk_score: hotspot.risk_score,
        recent_crimes: hotspot.recent_crimes || 0,
        lat: hotspot.lat,
        lng: hotspot.lng
      },
      additional_zones: nearbyZones,
      suggested_duration_hours: priority === 'HIGH' ? 4 : priority === 'MEDIUM' ? 3 : 2,
      reason: buildReason(hotspot, currentHour),
      shift: currentShift
    });
  }

  return {
    suggestions,
    shift: currentShift,
    generated_at: new Date(),
    available_officers: availableOfficers.length,
    high_risk_zones: hotspots.filter(h => h.risk_score >= 75).length
  };
};

function buildReason(hotspot, hour) {
  const reasons = [];
  if (hotspot.risk_score >= 75) reasons.push(`High risk score (${hotspot.risk_score}/100)`);
  if (hotspot.recent_crimes > 3) reasons.push(`${hotspot.recent_crimes} crimes in last 7 days`);
  if (hour >= 20 || hour <= 6) reasons.push('Night hours — historically high crime period');
  if (hour >= 16 && hour <= 19) reasons.push('Evening rush — increased activity');
  return reasons.join('; ') || 'Regular patrol coverage needed';
}
