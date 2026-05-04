let crimeChartInstance = null;

async function loadDashboard() {
  await Promise.all([
    loadStats(),
    loadHotspots(),
    loadRecentCrimes(),
    loadCrimeChart()
  ]);
}

async function loadStats() {
  try {
    const [statsRes, officerRes, patrolRes, hotspotRes] = await Promise.all([
      API.crimes.getStats(),
      API.officers.getAll(),
      API.patrols.getActive(),
      API.crimes.getHotspots()
    ]);

    const totals = statsRes.data?.totals || {};
    document.getElementById('statOpenCases').textContent = totals.open_cases || 0;
    document.getElementById('statHighSev').textContent = `${totals.high_severity || 0} critical`;

    const officers = officerRes.data || [];
    const onDuty = officers.filter(o => o.status === 'on_duty').length;
    const available = officers.filter(o => o.status === 'available').length;
    document.getElementById('statOnDuty').textContent = onDuty;
    document.getElementById('statAvailable').textContent = `${available} available`;

    // FIX: Count unique active team patrols instead of raw records
    const activeData = patrolRes.data || [];
    const uniqueActive = new Set(activeData.map(p => `${p.start_time}_${p.end_time}`)).size;
    document.getElementById('statActivePatrols').textContent = uniqueActive;

    // FIX: Count unique scheduled team patrols instead of raw records
    const allPatrols = await API.patrols.getAll('?status=scheduled');
    const scheduledData = allPatrols.data || [];
    const uniqueScheduled = new Set(scheduledData.map(p => `${p.start_time}_${p.end_time}`)).size;
    document.getElementById('statScheduled').textContent = `${uniqueScheduled} scheduled`;

    const highRisk = (hotspotRes.data || []).filter(h => h.risk_score >= 70).length;
    document.getElementById('statHighRisk').textContent = highRisk;
    document.getElementById('alertCount').textContent = totals.open_cases || 0;

  } catch (err) {
    console.error('Stats error:', err);
  }
}

async function loadHotspots() {
  const el = document.getElementById('hotspotsList');
  try {
    const res = await API.crimes.getHotspots();
    const hotspots = (res.data || []).slice(0, 7);

    if (!hotspots.length) {
      el.innerHTML = '<div class="empty-state"><i class="fas fa-map-pin"></i><p>No hotspots found</p></div>';
      return;
    }

    el.innerHTML = hotspots.map(h => `
      <div class="hotspot-item">
        <div class="hotspot-risk ${getRiskClass(h.risk_score)}">${h.risk_score}</div>
        <div class="hotspot-info">
          <div class="hotspot-name">${h.zone_name}</div>
          <div class="hotspot-meta">${h.recent_crimes || 0} crimes this week</div>
        </div>
        <div class="risk-bar-wrap">
          <div class="risk-bar">
            <div class="risk-bar-fill" style="width:${h.risk_score}%; background:${getRiskBarColor(h.risk_score)}"></div>
          </div>
          <div style="font-size:10px;color:var(--text-muted);text-align:right;margin-top:3px">${h.risk_level}</div>
        </div>
      </div>
    `).join('');
  } catch (err) {
    el.innerHTML = '<div class="empty-state"><p>Error loading hotspots</p></div>';
  }
}

async function loadRecentCrimes() {
  const el = document.getElementById('recentCrimes');
  try {
    const res = await API.crimes.getAll('?limit=8');
    const crimes = res.data || [];

    if (!crimes.length) {
      el.innerHTML = '<div class="empty-state"><i class="fas fa-folder-open"></i><p>No recent crimes</p></div>';
      return;
    }

    el.innerHTML = crimes.map(c => `
      <div class="crime-item">
        <div class="crime-dot sev-${c.severity}"></div>
        <div class="crime-info">
          <div class="crime-type">${c.crime_type}</div>
          <div class="crime-meta">${c.zone_name || 'Unknown zone'} · ${timeAgo(c.occurred_at)}</div>
        </div>
        <span class="status-badge status-${c.status}">${c.status}</span>
      </div>
    `).join('');
  } catch (err) {
    el.innerHTML = '<div class="empty-state"><p>Error loading crimes</p></div>';
  }
}

async function loadCrimeChart() {
  const mode = document.getElementById('chartFilter')?.value || 'type';
  const canvas = document.getElementById('crimeChart');
  if (!canvas) return;

  try {
    const res = await API.crimes.getStats();
    const stats = res.data || {};

    if (crimeChartInstance) {
      crimeChartInstance.destroy();
      crimeChartInstance = null;
    }

    const ctx = canvas.getContext('2d');

    if (mode === 'type') {
      const data = (stats.byType || []).slice(0, 8);
      crimeChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: data.map(d => d.crime_type),
          datasets: [{
            label: 'Cases',
            data: data.map(d => d.count),
            backgroundColor: 'rgba(0, 212, 255, 0.25)',
            borderColor: '#00d4ff',
            borderWidth: 2,
            borderRadius: 4
          }, {
            label: 'High Severity',
            data: data.map(d => d.high_severity || 0),
            backgroundColor: 'rgba(255, 71, 87, 0.25)',
            borderColor: '#ff4757',
            borderWidth: 2,
            borderRadius: 4
          }]
        },
        options: chartOptions('Cases by Crime Type')
      });
    } else {
      const data = stats.byHour || [];
      crimeChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
          labels: data.map(d => `${d.hour}:00`),
          datasets: [{
            label: 'Crimes',
            data: data.map(d => d.count),
            borderColor: '#00d4ff',
            backgroundColor: 'rgba(0, 212, 255, 0.1)',
            fill: true,
            tension: 0.4,
            pointBackgroundColor: '#00d4ff',
            pointRadius: 4
          }]
        },
        options: chartOptions('Crime Frequency by Hour')
      });
    }
  } catch (err) {
    console.error('Chart error:', err);
  }
}

function chartOptions(title) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: '#7a9bb5', font: { family: 'Exo 2', size: 11 } } },
      title: { display: false }
    },
    scales: {
      x: {
        ticks: { color: '#4a6a82', font: { size: 10 } },
        grid: { color: '#1e3045' }
      },
      y: {
        ticks: { color: '#4a6a82', font: { size: 10 } },
        grid: { color: '#1e3045' }
      }
    }
  };
}

async function loadPatrolSuggestions() {
  const el = document.getElementById('patrolSuggestions');
  el.innerHTML = '<div class="loading-spinner"></div>';

  try {
    const res = await API.patrols.suggest();
    const { suggestions, shift, available_officers, high_risk_zones } = res.data || {};
    window.suggestionsData = suggestions;

    if (!suggestions?.length) {
      el.innerHTML = '<div class="empty-state"><i class="fas fa-circle-check"></i><p>All active zones covered. No urgent suggestions.</p></div>';
      return;
    }

    el.innerHTML = `
      <div style="font-size:11px;color:var(--text-muted);margin-bottom:12px">
        <i class="fas fa-clock"></i> ${shift} shift · ${available_officers} available officers
      </div>
      ${suggestions.map((s, index) => `
        <div class="suggestion-item">
          <div class="suggestion-header">
            <span class="priority-badge priority-${s.priority}">${s.priority} PRIORITY</span>
            <span style="font-size:10px;color:var(--text-muted)">${s.suggested_duration_hours}h patrol</span>
          </div>
          <div class="suggestion-officer" style="margin-bottom:6px;">
            <i class="fas fa-users"></i> Team: ${s.team.map(o => o.name.split(' ')[0]).join(', ')} <span style="color:var(--text-muted);font-size:11px">(${s.team.length} Officers)</span>
          </div>
          <div class="suggestion-zone">
            <i class="fas fa-location-dot"></i> ${s.primary_zone.name} — Risk: ${s.primary_zone.risk_score}/100
          </div>
          <div class="suggestion-reason">${s.reason}</div>
          <div style="display: flex; gap: 8px; margin-top: 10px;">
            <button class="btn-sm btn-secondary" style="flex:1; justify-content:center" onclick="openTeamPreview(${index})">
              <i class="fas fa-users-cog"></i> Adjust Team & Preview
            </button>
            <button class="btn-sm btn-primary" style="flex:1; justify-content:center" onclick="assignTeamPatrol(${index})">
              <i class="fas fa-check"></i> Assign Team
            </button>
          </div>
        </div>
      `).join('')}
    `;
  } catch (err) {
    el.innerHTML = '<div class="empty-state"><p>Error generating suggestions.</p></div>';
  }
}

async function assignTeamPatrol(index) {
  const s = window.suggestionsData[index];
  
  // Only use the modal's modified team if the modal is currently open and modifying THIS suggestion
  const isModalOpen = document.getElementById('suggestionPreviewModal').classList.contains('active');
  const teamIds = (isModalOpen && window.currentSuggestionIndex === index) 
    ? window.currentPreviewTeam.map(o => o.id) 
    : s.team.map(o => o.id);
  
  if (teamIds.length === 0) return showToast('You need at least one officer!', 'error');

  try {
    await API.patrols.create({
      officer_ids: teamIds, 
      area_ids: [s.primary_zone.id, ...s.additional_zones.map(z => z.id)],
      start_time: s.suggested_start_time,
      end_time: s.suggested_end_time,
      notes: 'AI-suggested team patrol'
    });
    showToast('Team patrol assigned successfully!', 'success');
    document.getElementById('suggestionPreviewModal').classList.remove('active');
    loadDashboard();
  } catch (err) {
    showToast('Failed to assign patrol.', 'error');
  }
}

// Global state for the preview modal
window.currentPreviewTeam = [];
window.availablePool = [];
window.currentSuggestionIndex = null;

window.openTeamPreview = async function(index) {
  window.currentSuggestionIndex = index;
  const s = window.suggestionsData[index];
  window.currentPreviewTeam = [...s.team]; 
  
  // Fetch available officers for the swap dropdown
  const res = await API.officers.getAvailable();
  window.availablePool = res.data || [];
  
  renderPreviewModal();
  document.getElementById('suggestionPreviewModal').classList.add('active');
};

window.renderPreviewModal = function() {
  const s = window.suggestionsData[window.currentSuggestionIndex];
  const wps = s.optimized_route.waypoints || [];

  // 1. Build Team Roster UI
  let teamHtml = `
    <div style="margin-bottom: 20px; background: var(--bg-primary); padding: 12px; border-radius: var(--radius-sm); border: 1px solid var(--border);">
      <h4 style="font-size: 13px; color: var(--text-muted); text-transform: uppercase; margin-bottom: 10px; font-family: var(--font-display);">Team Roster</h4>
      <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:12px;">
        ${window.currentPreviewTeam.map(o => `
          <div style="display:flex; justify-content:space-between; align-items:center; background: var(--bg-secondary); padding: 8px 12px; border: 1px solid var(--border-light); border-radius: 4px; font-size:13px;">
            <div><strong>${o.designation} ${o.name}</strong> <span style="color:var(--text-muted);font-size:11px">(${o.badge_number})</span></div>
            <button onclick="removeOfficer(${o.id})" style="background:none; border:none; color:var(--danger); cursor:pointer;"><i class="fas fa-times"></i></button>
          </div>
        `).join('')}
      </div>
      <div style="display:flex; gap:8px;">
        <select id="swapOfficerSelect" class="form-control" style="flex:1;">
          <option value="">+ Add Available Officer</option>
          ${window.availablePool.filter(o => !window.currentPreviewTeam.find(t => t.id === o.id)).map(o => `
            <option value="${o.id}">${o.designation} ${o.name}</option>
          `).join('')}
        </select>
        <button class="btn-sm btn-secondary" onclick="addOfficer()"><i class="fas fa-plus"></i></button>
      </div>
    </div>
  `;

  // 2. Build Details UI
  let detailsHtml = `
    <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px; font-size: 13px;">
      <div><strong>Shift:</strong> ${s.shift ? s.shift.toUpperCase() : 'N/A'}</div>
      <div><strong>Metrics:</strong> ~${s.optimized_route.total_distance_km || 0} km</div>
    </div>
  `;

  // 3. ACTUAL MAP CONTAINER (Replaces the SVG graph)
  let mapHtml = `
    <div style="margin-bottom: 20px;">
      <h4 style="font-size: 13px; color: var(--text-muted); text-transform: uppercase; margin-bottom: 10px; font-family: var(--font-display);">Interactive Route Map</h4>
      <div id="previewMap" style="width: 100%; height: 260px; border: 1px solid var(--border); border-radius: var(--radius); background: #eef2f6; z-index: 1;"></div>
    </div>
  `;

  // 4. Build Timeline UI
  let timelineHtml = `
    <div>
      <h4 style="font-size: 13px; color: var(--text-muted); text-transform: uppercase; margin-bottom: 10px; font-family: var(--font-display);">Route Checkpoints</h4>
      <div style="display:flex; flex-direction:column; gap:8px;">
        ${wps.map((w, i) => `
          <div style="display:flex; align-items:center; gap: 12px; font-size: 13px; padding: 10px; border: 1px solid var(--border); border-radius: var(--radius-sm);">
            <div style="width:28px; height:28px; background:var(--bg-primary); color:var(--text-secondary); border: 1px solid var(--border); display:flex; align-items:center; justify-content:center; border-radius:50%; font-weight:bold;">${i + 1}</div>
            <div style="flex:1;">
              <div style="font-weight:600;">${w.zone_name}</div>
              <div style="color:var(--text-muted); font-size: 11px;">Risk Score: <span style="color:var(--danger);">${w.risk_score}</span></div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  document.getElementById('previewModalBody').innerHTML = teamHtml + detailsHtml + mapHtml + timelineHtml;
  
  document.getElementById('previewAssignBtn').onclick = () => {
    assignTeamPatrol(window.currentSuggestionIndex);
  };

  // --- INITIALIZE LEAFLET MAP ---
  // We use a slight timeout because Leaflet maps glitch out if initialized
  // before their HTML container is fully visible on the screen.
  setTimeout(() => {
    // Destroy old map instance if it exists to prevent overlap errors
    if (window.previewMapInstance) {
      window.previewMapInstance.remove();
    }

    if (wps.length > 0) {
      window.previewMapInstance = L.map('previewMap', { zoomControl: false }).setView([wps[0].lat, wps[0].lng], 14);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OSM'
      }).addTo(window.previewMapInstance);

      // Extract coordinates into Leaflet format
      const latLngs = wps.map(w => L.latLng(w.lat, w.lng));

      // Draw the street-aware route
      L.Routing.control({
        waypoints: latLngs,
        router: L.Routing.osrmv1({
          serviceUrl: 'https://router.project-osrm.org/route/v1'
        }),
        lineOptions: {
          styles: [
            { color: '#1e3799', weight: 8, opacity: 0.8 }, // Dark blue shadow
            { color: '#00d4ff', weight: 4, opacity: 1, dashArray: '8, 6' } // Bright cyan dashed inner
          ],
          extendToWaypoints: true,
          missingRouteTolerance: 0
        },
        show: false,
        addWaypoints: false,
        fitSelectedRoutes: true,
        createMarker: function(i, wp, nWps) {
           return L.marker(wp.latLng, {
             icon: L.divIcon({
               html: `<div style="background:var(--accent);border:2px solid #fff;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:11px;color:#fff;font-weight:bold;box-shadow:0 0 10px var(--accent-glow)">${i + 1}</div>`,
               iconSize: [24, 24],
               iconAnchor: [12, 12]
             })
           });
        }
      }).addTo(window.previewMapInstance);
    }
  }, 50); 
};

// UI Swap Functions
window.removeOfficer = function(id) {
  window.currentPreviewTeam = window.currentPreviewTeam.filter(o => o.id !== id);
  renderPreviewModal();
};

window.addOfficer = function() {
  const select = document.getElementById('swapOfficerSelect');
  const id = parseInt(select.value);
  if (!id) return;
  
  const officer = window.availablePool.find(o => o.id === id);
  if (officer && !window.currentPreviewTeam.find(o => o.id === id)) {
    window.currentPreviewTeam.push(officer);
    renderPreviewModal();
  }
};

function assignPatrolByIndex(index) {
  const suggestion = window.suggestionsData[index];
  assignPatrol(suggestion);
}

window.closePreviewModal = function() {
  document.getElementById('suggestionPreviewModal').classList.remove('active');
};

function refreshDashboard() {
  loadDashboard();
  showToast('Dashboard refreshed', 'info');
}

// Init
document.addEventListener('DOMContentLoaded', loadDashboard);