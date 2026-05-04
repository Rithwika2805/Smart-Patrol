const db = require('../db');
const officerService = require('./officerService');
const routeService = require('./routeService');

// Generate smart AI patrol suggestions
exports.generateSmartSuggestions = async () => {
  const currentHour = new Date().getHours();
  const currentShift = currentHour >= 6 && currentHour < 14 ? 'morning'
    : currentHour >= 14 && currentHour < 22 ? 'evening' : 'night';

  let availableOfficers = await officerService.getOfficersByShift(currentShift);
  let crossShiftUsed = false;

  if (availableOfficers.length === 0) {
    availableOfficers = await officerService.getAllAvailableOfficers();
    crossShiftUsed = true;
  }

  // 🌟 THE FIX 1: REMOVED the early exit! We no longer return [] if availableOfficers is 0.

  const [activePatrols] = await db.query(`
    SELECT DISTINCT pw.area_id 
    FROM patrol_waypoints pw
    JOIN patrols p ON p.id = pw.patrol_id
    WHERE p.status IN ('active', 'scheduled')
  `);
  
  const activeZoneIds = new Set(activePatrols.map(p => p.area_id).filter(id => id != null));

  const [allHotspots] = await db.query(`
    SELECT h.*, COUNT(c.id) as recent_crimes
    FROM hotspots h
    LEFT JOIN crimes c ON c.area_id = h.id AND c.occurred_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
    GROUP BY h.id
    ORDER BY h.risk_score DESC, recent_crimes DESC
  `);

  let availableZones = allHotspots.filter(h => !activeZoneIds.has(h.id));
  let hotspots = [];

  // Mix 3 High/Medium risk zones with 2 Routine (Low risk) zones
  if (crossShiftUsed) {
    hotspots = availableZones.filter(h => h.risk_score > 80).slice(0, 10);
  } else {
    const riskyZones = availableZones.filter(h => h.risk_score >= 50).slice(0, 3);
    const routineZones = availableZones.filter(h => h.risk_score < 50)
                                       .sort((a, b) => a.risk_score - b.risk_score) 
                                       .slice(0, 2); 
    hotspots = [...riskyZones, ...routineZones];
  }

  if (hotspots.length === 0) {
     return {
      suggestions: [], shift: currentShift, generated_at: new Date(),
      available_officers: availableOfficers.length, high_risk_zones: 0
    };
  }

  const workloadData = await officerService.getOfficerWorkload();
  const officersByWorkload = availableOfficers.map(o => ({
    ...o, recent_patrols: workloadData.find(w => w.id === o.id)?.recent_patrols || 0
  })).sort((a, b) => a.recent_patrols - b.recent_patrols);

  const suggestions = [];
  const usedOfficers = new Set();
  
  // 🌟 THE FIX 2: Generate up to 5 routes regardless of how many officers we have
  const maxSuggestions = Math.min(hotspots.length, 5);

  const formatDateTime = (d) => {
    const pad = (n) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };

  let suggestionsCount = 0;

  for (let hotspot of hotspots) {
    if (suggestionsCount >= maxSuggestions) break;
    if (activeZoneIds.has(hotspot.id)) continue;

    const priority = hotspot.risk_score >= 75 ? 'HIGH' : hotspot.risk_score >= 50 ? 'MEDIUM' : 'LOW';
    const targetTeamSize = priority === 'HIGH' ? 3 : 2;
    let team = [];
    let selectedStartTime = new Date();
    let selectedEndTime = new Date();
    
    const patrolDuration = priority === 'HIGH' ? 4 : (priority === 'MEDIUM' ? 3 : 2);
    selectedEndTime.setHours(selectedEndTime.getHours() + patrolDuration);

    for (let officer of officersByWorkload) {
      if (usedOfficers.has(officer.id)) continue;
      
      const isAvailable = await officerService.isOfficerAvailable(
        officer.id, 
        formatDateTime(selectedStartTime), 
        formatDateTime(selectedEndTime)
      );
      
      if (isAvailable) {
        team.push({
          id: officer.id, name: officer.name, badge_number: officer.badge_number,
          designation: officer.designation, recent_patrols: officer.recent_patrols,
          shift: officer.shift 
        });
        usedOfficers.add(officer.id);
        if (team.length >= targetTeamSize) break;
      }
    }

    // 🌟 THE FIX 3: REMOVED `if (team.length === 0) continue;`
    // We now allow the AI to build the rest of the route even if the team is empty!

    activeZoneIds.add(hotspot.id);
    const activeIdsArr = Array.from(activeZoneIds);
    const notInClause = activeIdsArr.length > 0 ? `AND id NOT IN (${activeIdsArr.join(',')})` : '';

    const [mixedZones] = await db.query(`
      SELECT id, zone_name, lat, lng, risk_score FROM hotspots 
      WHERE id != ? ${notInClause}
      ORDER BY risk_score DESC LIMIT 5
    `, [hotspot.id]);

    let selectedZones = [...mixedZones.filter(z => z.risk_score < 75).slice(0, 1), ...mixedZones.filter(z => z.risk_score >= 75).slice(0, 2)].slice(0, 3);
    selectedZones.forEach(z => activeZoneIds.add(z.id));

    const route = await routeService.generateOptimizedRoute([hotspot.id, ...selectedZones.map(z => z.id)]);

    suggestions.push({
      priority, team,
      primary_zone: { id: hotspot.id, name: hotspot.zone_name, risk_score: hotspot.risk_score, lat: hotspot.lat, lng: hotspot.lng },
      suggested_start_time: selectedStartTime,
      suggested_end_time: selectedEndTime,
      additional_zones: selectedZones,
      optimized_route: route,
      suggested_duration_hours: patrolDuration,
      reason: buildReason(hotspot, currentHour, crossShiftUsed, team.length === 0), // <-- Pass empty team flag
      shift: currentShift
    });

    suggestionsCount++;
  }

  return {
    suggestions, shift: currentShift, generated_at: new Date(),
    available_officers: availableOfficers.length - usedOfficers.size,
    high_risk_zones: hotspots.filter(h => h.risk_score >= 75).length
  };
};

// 🌟 THE FIX 4: Update reasoning to handle unassigned routes
function buildReason(hotspot, hour, crossShiftUsed, isUnassigned) {
  const reasons = [];
  
  if (isUnassigned) reasons.push('🚨 NO OFFICERS AVAILABLE TO ASSIGN');
  if (crossShiftUsed && !isUnassigned) reasons.push('⚠️ Cross-shift assignment due to staff shortage');

  if (hotspot.risk_score < 50) {
    return reasons.length ? reasons.join('; ') : 'Routine daily visibility patrol';
  }

  if (hotspot.risk_score >= 75) reasons.push(`High risk score (${hotspot.risk_score}/100)`);
  if (hotspot.recent_crimes > 3) reasons.push(`${hotspot.recent_crimes} crimes in last 7 days`);
  if (hour >= 20 || hour <= 6) reasons.push('Night hours — historically high crime period');
  
  return reasons.join('; ') || 'Standard patrol coverage needed';
}

function getTimeForHour(hour) {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  if (d < new Date()) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}