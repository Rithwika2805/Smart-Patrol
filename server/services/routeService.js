const db = require('../db');

// Generate optimized patrol route using Nearest Neighbor algorithm
exports.generateOptimizedRoute = async (areaIds) => {
  if (!areaIds?.length) return { waypoints: [], total_distance: 0 };

  const [areas] = await db.query(
    `SELECT id, zone_name, lat, lng, risk_score FROM hotspots WHERE id IN (?)`,
    [areaIds]
  );

  if (!areas.length) return { waypoints: [], total_distance: 0 };

  // Sort by risk score (highest first), then optimize path
  const sortedByRisk = [...areas].sort((a, b) => b.risk_score - a.risk_score);
  const optimized = nearestNeighborTSP(sortedByRisk);

  const waypoints = optimized.map((area, idx) => ({
    sequence_order: idx + 1,
    area_id: area.id,
    zone_name: area.zone_name,
    lat: area.lat,
    lng: area.lng,
    risk_score: area.risk_score,
    estimated_arrival: estimateArrival(idx, 15) // 15 min per stop
  }));

  const totalDistance = calculateTotalDistance(optimized);

  return {
    waypoints,
    total_distance_km: Math.round(totalDistance * 10) / 10,
    estimated_duration_min: waypoints.length * 15 + Math.round(totalDistance * 3),
    optimization: 'nearest-neighbor-risk-weighted'
  };
};

// Nearest Neighbor TSP heuristic
function nearestNeighborTSP(points) {
  if (points.length <= 1) return points;

  const visited = new Set();
  const route = [points[0]];
  visited.add(0);

  while (visited.size < points.length) {
    const current = route[route.length - 1];
    let nearest = null;
    let nearestDist = Infinity;
    let nearestIdx = -1;

    for (let i = 0; i < points.length; i++) {
      if (visited.has(i)) continue;
      const dist = haversineDistance(current.lat, current.lng, points[i].lat, points[i].lng);
      // Weight by inverse risk (prefer nearby high-risk areas)
      const weightedDist = dist / (1 + points[i].risk_score / 100);
      if (weightedDist < nearestDist) {
        nearestDist = weightedDist;
        nearest = points[i];
        nearestIdx = i;
      }
    }

    if (nearest) {
      route.push(nearest);
      visited.add(nearestIdx);
    }
  }

  return route;
}

// Haversine distance formula (km)
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg) { return deg * Math.PI / 180; }

function calculateTotalDistance(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversineDistance(points[i - 1].lat, points[i - 1].lng, points[i].lat, points[i].lng);
  }
  return total;
}

function estimateArrival(stopIndex, minutesPerStop) {
  const now = new Date();
  now.setMinutes(now.getMinutes() + (stopIndex * minutesPerStop));
  return now.toISOString();
}
