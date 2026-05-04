const db = require('../db');
const officerService = require('./officerService');
const routeService = require('./routeService');

// Generate smart AI patrol suggestions
exports.generateSmartSuggestions = async (timeframe = 'current') => {
  let baseDate = new Date();
  let currentShift;
  let targetHour = baseDate.getHours();
  let targetDay = baseDate.getDay() + 1; // MySQL DAYOFWEEK is 1=Sun, 2=Mon...

  // 1. Calculate Target Time & Shift
  if (timeframe === 'current') {
    currentShift = targetHour >= 6 && targetHour < 14 ? 'morning'
      : targetHour >= 14 && targetHour < 22 ? 'evening' : 'night';
  } else {
    // Time travel to tomorrow
    baseDate.setDate(baseDate.getDate() + 1);
    targetDay = baseDate.getDay() + 1;
    currentShift = timeframe.replace('tomorrow_', ''); 
    
    if (currentShift === 'morning') targetHour = 6;
    else if (currentShift === 'evening') targetHour = 14;
    else if (currentShift === 'night') targetHour = 22;
  }

  let availableOfficers = await officerService.getOfficersByShift(currentShift);
  let crossShiftUsed = false;

  if (availableOfficers.length === 0) {
    availableOfficers = await officerService.getAllAvailableOfficers();
    crossShiftUsed = true;
  }

  const [activePatrols] = await db.query(`
    SELECT DISTINCT pw.area_id 
    FROM patrol_waypoints pw
    JOIN patrols p ON p.id = pw.patrol_id
    WHERE p.status IN ('active', 'scheduled')
  `);
  
  const activeZoneIds = new Set(activePatrols.map(p => p.area_id).filter(id => id != null));

  // 🌟 THE MAGIC: Dynamic Risk Query based on Target Hour and Day
  const [allHotspots] = await db.query(`
    SELECT h.*, 
           COUNT(DISTINCT c1.id) as recent_crimes,
           COUNT(DISTINCT c2.id) as time_crimes,
           SUM(CASE WHEN c2.severity = 'high' THEN 1 ELSE 0 END) as time_high_crimes
    FROM hotspots h
    LEFT JOIN crimes c1 ON c1.area_id = h.id AND c1.occurred_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
    -- Join historical crimes that match our target hour (+/- 2 hrs) and day of week
    LEFT JOIN crimes c2 ON c2.area_id = h.id 
      AND ABS(HOUR(c2.occurred_at) - ?) <= 2 
      AND DAYOFWEEK(c2.occurred_at) = ?
    GROUP BY h.id
  `, [targetHour, targetDay]);

  // 🌟 Calculate dynamic risk for the specific time requested
  let dynamicZones = allHotspots.map(h => {
    let adjustedScore = h.risk_score || 50;
    
    // Boost the score if this zone has a history of crime AT THIS SPECIFIC TIME
    if (h.time_crimes > 0) {
      adjustedScore += (h.time_crimes * 2) + ((h.time_high_crimes || 0) * 5);
    }
    
    return { 
      ...h, 
      // Override the static score with our new time-traveling dynamic one
      risk_score: Math.min(100, Math.round(adjustedScore)),
      original_score: h.risk_score // Keep the old one just in case
    };
  }).sort((a, b) => b.risk_score - a.risk_score);

  let availableZones = dynamicZones.filter(h => !activeZoneIds.has(h.id));

  const riskyZones = availableZones.filter(h => h.risk_score >= 50).slice(0, 3);
  const routineZones = availableZones.filter(h => h.risk_score < 50)
                                     .sort((a, b) => a.risk_score - b.risk_score) 
                                     .slice(0, 2); 
  let hotspots = [...riskyZones, ...routineZones];

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
    
    // 🌟 Set the exact patrol time based on what they selected in the dropdown
    let selectedStartTime = new Date(baseDate);
    if (timeframe !== 'current') {
      selectedStartTime.setHours(targetHour, 0, 0, 0);
    }
    
    let selectedEndTime = new Date(selectedStartTime);
    const patrolDuration = priority === 'HIGH' ? 4 : (priority === 'MEDIUM' ? 3 : 2);
    selectedEndTime.setHours(selectedEndTime.getHours() + patrolDuration);

    for (let officer of officersByWorkload) {
      if (usedOfficers.has(officer.id)) continue;

      if (crossShiftUsed && priority !== 'HIGH') {
        continue; 
      }
      
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
      reason: buildReason(hotspot, targetHour, crossShiftUsed, team.length === 0), // Use targetHour here
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