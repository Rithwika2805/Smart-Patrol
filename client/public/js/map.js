// ============================================================
// PATROL-AI — Live Map
// ============================================================

let map;
const layers = { hotspots: null, crimes: null, patrols: null };
const layerGroups = { hotspots: [], crimes: [], patrols: [] };

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
  await Promise.all([loadHotspots(), loadCrimes(), loadActivePatrols()]);
}

async function loadHotspots() {
  clearLayer('hotspots');
  try {
    const res = await API.crimes.getHotspots();
    (res.data || []).forEach(h => {
      if (!h.lat || !h.lng) return;
      const color = h.risk_score >= 90 ? '#ff4757' : h.risk_score >= 70 ? '#ffa502' : h.risk_score >= 45 ? '#00d4ff' : '#2ed573';
      const size = 20 + Math.round(h.risk_score / 10);

      const circle = L.circleMarker([h.lat, h.lng], {
        radius: size,
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
    (res.data || []).forEach(p => {
      if (!p.current_lat || !p.current_lng) return;
      const officerIcon = L.divIcon({
        html: `<div style="background:#5352ed;border:2px solid #fff;border-radius:50%;width:20px;height:20px;display:flex;align-items:center;justify-content:center;font-size:9px;color:#fff;font-weight:bold">${p.officer_name.charAt(0)}</div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
        className: ''
      });
      const marker = L.marker([p.current_lat, p.current_lng], { icon: officerIcon });
      marker.bindPopup(`
        <div style="font-family:'Exo 2',sans-serif">
          <b>${p.officer_name}</b><br/>
          <span style="font-size:11px;color:#5352ed">${p.designation} · ${p.badge_number}</span><br/>
          <span style="font-size:11px;color:green">● ACTIVE PATROL</span>
        </div>
      `);
      marker.addTo(map);
      layerGroups.patrols.push(marker);
    });
  } catch {}
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
