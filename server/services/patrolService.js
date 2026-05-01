const db = require('../db');
const officerService = require('./officerService');
const routeService = require('./routeService');

// Generate smart AI patrol suggestions
exports.generateSmartSuggestions = async () => {
  const currentHour = new Date().getHours();

  const timeSlots = [
    { label: "NOW", hour: currentHour },
    { label: "EVENING_PEAK", hour: 18 },
    { label: "NIGHT_PEAK", hour: 22 }
  ];

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

  const usedOfficers = new Set();

  for (let i = 0; i < maxSuggestions; i++) {
    const hotspot = hotspots[i];

    let selectedOfficer = null;
    let selectedStartTime = null;
    let selectedEndTime = null;

    // 🔍 Find first available & unused officer
    for (let officer of officersByWorkload) {
      if (usedOfficers.has(officer.id)) continue;

      const startTime = new Date();
      const endTime = new Date();
      endTime.setHours(endTime.getHours() + 3); // default patrol duration

      const isAvailable = await officerService.isOfficerAvailable(
        officer.id,
        startTime,
        endTime
      );

      if (isAvailable) {
        selectedOfficer = officer;
        usedOfficers.add(officer.id); // 🚀 prevent reuse

        selectedStartTime = startTime;
        selectedEndTime = endTime;
        break;
      }
    }

    // ❌ No officer found → skip this hotspot
    if (!selectedOfficer) continue;

    const priority = hotspot.risk_score >= 75 ? 'HIGH'
      : hotspot.risk_score >= 50 ? 'MEDIUM' : 'LOW';

    // 📍 Get mixed zones (high + medium)
const [mixedZones] = await db.query(
  `SELECT id, zone_name, lat, lng, risk_score 
   FROM hotspots 
   WHERE id != ?
   ORDER BY 
     CASE 
       WHEN risk_score >= 75 THEN 1   -- high priority
       WHEN risk_score >= 50 THEN 2   -- medium priority
       ELSE 3
     END,
     risk_score DESC
   LIMIT 5`,
  [hotspot.id]
);

// 🎯 Pick 2–3 zones with mix
const highZones = mixedZones.filter(z => z.risk_score >= 75);
const mediumZones = mixedZones.filter(z => z.risk_score >= 50 && z.risk_score < 75);

let selectedZones = [];

// Always try to include 1 medium zone
if (mediumZones.length > 0) {
  selectedZones.push(mediumZones[0]);
}

// Add 1–2 high zones
selectedZones = [
  ...selectedZones,
  ...highZones.slice(0, 2)
];

// Ensure max 3 zones
selectedZones = selectedZones.slice(0, 3);

const route = await routeService.generateOptimizedRoute([
  hotspot.id,
  ...selectedZones.map(z => z.id)
]);
    // 📦 Push final suggestion
    suggestions.push({
      priority,
      officer: {
        id: selectedOfficer.id,
        name: selectedOfficer.name,
        badge_number: selectedOfficer.badge_number,
        designation: selectedOfficer.designation,
        recent_patrols: selectedOfficer.recent_patrols || 0
      },
      primary_zone: {
        id: hotspot.id,
        name: hotspot.zone_name,
        risk_score: hotspot.risk_score,
        recent_crimes: hotspot.recent_crimes || 0,
        lat: hotspot.lat,
        lng: hotspot.lng
      },
      suggested_start_time: selectedStartTime,
      suggested_end_time: selectedEndTime,
      additional_zones: selectedZones,
      optimized_route: route,
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

function getTimeForHour(hour) {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);

  // If time already passed today → move to next day
  if (d < new Date()) {
    d.setDate(d.getDate() + 1);
  }

  return d;
}