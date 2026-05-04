let map;
const layers = { hotspots: null, crimes: null, patrols: null };
const layerGroups = { hotspots: [], crimes: [], patrols: [], stations: [] };

function initMap() {
  // Center on Prayagraj
  map = L.map('map', { zoomControl: false }).setView([25.4358, 81.8463], 13);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap',
    maxZoom: 18
  }).addTo(map);

  L.control.zoom({ position: 'bottomleft' }).addTo(map);
  loadMapData();
}

async function loadMapData() {
  await Promise.all([loadStations(), loadHotspots(), loadCrimes(), loadActivePatrols()]);
}

async function loadHotspots() {
  clearLayer('hotspots');
  try {
    const res = await API.crimes.getHotspots();
    (res.data || []).forEach(h => {
      if (!h.lat || !h.lng) return;
      
      const color = h.risk_score >= 90 ? '#ff4757' : h.risk_score >= 70 ? '#ffa502' : h.risk_score >= 45 ? '#00d4ff' : '#2ed573';
      
      // Use the radius from the database, or default to 500 meters if it's missing
      const radiusInMeters = h.radius_meters || 500;

      // Changed from L.circleMarker to L.circle
      const circle = L.circle([h.lat, h.lng], {
        radius: radiusInMeters, 
        fillColor: color,
        color: color,
        weight: 2,
        opacity: 0.9,
        fillOpacity: 0.25
      });

      circle.bindPopup(`
        <div style="font-family:'Exo 2',sans-serif;min-width:180px">
          <div style="font-weight:600;font-size:14px;margin-bottom:6px">${h.zone_name}</div>
          <div style="font-size:12px;color:#666">Risk Score: <b style="color:${color}">${h.risk_score}/100</b></div>
          <div style="font-size:12px;color:#666">Level: <b>${h.risk_level}</b></div>
          <div style="font-size:12px;color:#666">Recent crimes: ${h.recent_crimes || 0}</div>
        </div>
      `);

      circle.addTo(map);
      layerGroups.hotspots.push(circle);
    });
  } catch (err) {
    console.error('Error loading hotspots:', err);
  }
}

// 🚔 UPDATED: Load Police Stations from Database
async function loadStations() {
  clearLayer('stations');

  try {
    // Fetch from your actual database via the API
    const res = await API.stations.getAll();
    const stations = res.data || [];

    const stationIcon = L.divIcon({
      html: `<div style="background:#1e3799;border:2px solid #fff;border-radius:4px;width:24px;height:24px;display:flex;align-items:center;justify-content:center;color:#fff;box-shadow:0 2px 4px rgba(0,0,0,0.3)"><i class="fas fa-building-shield"></i></div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });

    stations.forEach(s => {
      if (!s.lat || !s.lng) return;
      
      const marker = L.marker([s.lat, s.lng], { icon: stationIcon, zIndexOffset: 1000 });
      
      marker.bindPopup(`
        <div style="font-family:'Exo 2',sans-serif">
          <b style="color:#1e3799">${s.name}</b><br/>
          <span style="font-size:11px;color:#666">${s.address || 'Command Center'}</span><br/>
          <span style="font-size:11px;color:#666"><i class="fas fa-phone"></i> ${s.phone || 'N/A'}</span>
          ${s.officer_count !== undefined ? `<br/><span style="font-size:11px;color:#2ed573;margin-top:4px;display:inline-block;"><i class="fas fa-users"></i> ${s.officer_count} Officers Assigned</span>` : ''}
        </div>
      `);
      
      marker.addTo(map);
      layerGroups.stations.push(marker);
    });
  } catch (err) {
    console.error('Error loading stations:', err);
  }
}

async function loadCrimes() {
  clearLayer('crimes');
  try {
    const res = await API.crimes.getAll('?limit=50');
    (res.data || []).forEach(c => {
      if (!c.latitude && !c.longitude) return; // skip if no coords
      const color = c.severity === 'high' || c.severity === 'critical' ? '#ff4757' : c.severity === 'medium' ? '#ffa502' : '#2ed573';
      const marker = L.circleMarker([c.latitude, c.longitude], {
        radius: 6,
        fillColor: color, color: '#fff',
        weight: 1, opacity: 1, fillOpacity: 0.8
      });
      marker.bindPopup(`
        <div style="font-family:'Exo 2',sans-serif">
          <b>${c.crime_type}</b><br/>
          <span style="font-size:11px;color:#666">${c.zone_name || 'Unknown zone'}</span><br/>
          <span style="font-size:11px">Severity: ${c.severity}</span><br/>
          <span style="font-size:11px">Status: ${c.status}</span>
        </div>
      `);
      marker.addTo(map);
      layerGroups.crimes.push(marker);
    });
  } catch {}
}

async function loadActivePatrols() {
  clearLayer('patrols');
  try {
    const res = await API.patrols.getActive();
    const patrols = res.data || [];

    for (const p of patrols) {
      // Fetch waypoints FIRST to establish a fallback location
      let wps = [];
      try {
        const detailRes = await API.patrols.getById(p.id);
        wps = detailRes.data?.waypoints || [];
      } catch (err) {
        console.warn('Could not fetch route details for patrol id:', p.id);
      }

      // Fallback to the first waypoint if current_lat is null (newly started patrols)
      const startLat = p.current_lat || (wps[0] ? wps[0].lat : null);
      const startLng = p.current_lng || (wps[0] ? wps[0].lng : null);

      // If we STILL don't have coordinates, we can't draw this patrol
      if (!startLat || !startLng) continue;

      // 1. Draw the actual Officer Marker
      const officerIcon = L.divIcon({
        html: `<div style="background:#5352ed;border:2px solid #fff;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:11px;color:#fff;font-weight:bold;box-shadow:0 0 10px rgba(83, 82, 237, 0.5)">${p.officer_name.charAt(0)}</div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });
      const marker = L.marker([startLat, startLng], { icon: officerIcon, zIndexOffset: 500 });
      marker.bindPopup(`
        <div style="font-family:'Exo 2',sans-serif">
          <b>${p.officer_name}</b><br/>
          <span style="font-size:11px;color:#5352ed">${p.designation} · ${p.badge_number}</span><br/>
          <span style="font-size:11px;color:green">● ACTIVE PATROL</span>
        </div>
      `);
      marker.addTo(map);
      layerGroups.patrols.push(marker);

      // 2. Draw the Route Line (only to pending waypoints)
      if (wps.length > 0) {
        const pendingWps = wps.filter(w => w.status !== 'reached' && w.status !== 'skipped');
        
        // Draw line from current position through the remaining waypoints
        const latLngs = [
          [startLat, startLng], 
          ...pendingWps.map(w => [w.lat, w.lng])
        ];

        if (latLngs.length > 1) {
          const routeLine = L.polyline(latLngs, {
            color: '#5352ed',
            weight: 3,
            dashArray: '8, 8', // Dashed line
            opacity: 0.7,
            lineJoin: 'round'
          });
          
          routeLine.addTo(map);
          layerGroups.patrols.push(routeLine);
        }
      }
    }
  } catch (err) {
    console.error("Failed loading active patrols", err);
  }
}

function clearLayer(name) {
  layerGroups[name].forEach(m => map.removeLayer(m));
  layerGroups[name] = [];
}

function toggleLayer(name) {
  const btn = document.getElementById(`btn${name.charAt(0).toUpperCase() + name.slice(1)}`);
  const isActive = btn.classList.contains('active');

  if (isActive) {
    layerGroups[name].forEach(m => map.removeLayer(m));
    btn.classList.remove('active');
  } else {
    layerGroups[name].forEach(m => m.addTo(map));
    btn.classList.add('active');
  }
}

function refreshMap() {
  loadMapData();
  showToast('Map refreshed', 'info');
}

document.addEventListener('DOMContentLoaded', initMap);
// Auto-refresh every 60 seconds
setInterval(loadActivePatrols, 60000);
