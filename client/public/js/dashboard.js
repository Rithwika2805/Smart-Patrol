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

    const activePatrols = patrolRes.data?.length || 0;
    document.getElementById('statActivePatrols').textContent = activePatrols;

    const allPatrols = await API.patrols.getAll('?status=scheduled');
    document.getElementById('statScheduled').textContent = `${allPatrols.data?.length || 0} scheduled`;

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
      el.innerHTML = '<div class="empty-state"><i class="fas fa-circle-check"></i><p>All zones covered. No urgent suggestions.</p></div>';
      return;
    }

    el.innerHTML = `
      <div style="font-size:11px;color:var(--text-muted);margin-bottom:12px">
        <i class="fas fa-clock"></i> ${shift} shift · ${available_officers} available officers · ${high_risk_zones} high-risk zones
      </div>
      ${suggestions.map((s, index) => `
        <div class="suggestion-item">
          <div class="suggestion-header">
            <span class="priority-badge priority-${s.priority}">${s.priority} PRIORITY</span>
            <span style="font-size:10px;color:var(--text-muted)">${s.suggested_duration_hours}h patrol</span>
          </div>
          <div class="suggestion-officer">
            <i class="fas fa-user-shield"></i> ${s.officer.designation} ${s.officer.name} (${s.officer.badge_number})
          </div>
          <div class="suggestion-zone">
            <i class="fas fa-location-dot"></i> ${s.primary_zone.name} — Risk: ${s.primary_zone.risk_score}/100
          </div>
          <div class="suggestion-reason">${s.reason}</div>
          <div style="display: flex; gap: 8px; margin-top: 10px;">
            <button class="btn-sm btn-secondary" style="flex:1; justify-content:center" onclick="previewSuggestion(${index})">
              <i class="fas fa-route"></i> Preview
            </button>
            <button class="btn-sm btn-primary" style="flex:1; justify-content:center" onclick="assignPatrolByIndex(${index})">
              <i class="fas fa-check"></i> Assign
            </button>
          </div>
        </div>
      `).join('')}
    `;
  } catch (err) {
    el.innerHTML = '<div class="empty-state"><p>Error generating suggestions. Is the server running?</p></div>';
  }
}

function assignPatrolByIndex(index) {
  const suggestion = window.suggestionsData[index];
  assignPatrol(suggestion);
}

async function assignPatrol(suggestion) {
  try {
    await API.patrols.create({
      officer_id: suggestion.officer.id,
      // MULTI-ZONE FIX
      area_ids: [
        suggestion.primary_zone.id,
        ...suggestion.additional_zones.map(z => z.id)
      ],
      start_time: suggestion.suggested_start_time,
      end_time: suggestion.suggested_end_time,
      notes: 'AI-suggested patrol'
    });

    showToast('Patrol assigned successfully!', 'success');
    loadStats();
  } catch (err) {
    showToast('Failed to assign patrol. Officer may not be available.', 'error');
  }
}

// --- NEW FUNCTIONS GO DOWN HERE, COMPLETELY OUTSIDE OTHER FUNCTIONS --- //

window.previewSuggestion = function(index) {
  const s = window.suggestionsData[index];
  const route = s.optimized_route || {};
  const wps = route.waypoints || [];

  // 1. Build Details Header
  let detailsHtml = `
    <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px; font-size: 13px; background: var(--bg-primary); padding: 12px; border-radius: var(--radius-sm); border: 1px solid var(--border);">
      <div><strong>Officer:</strong> <span style="color:var(--accent)">${s.officer.designation} ${s.officer.name}</span></div>
      <div><strong>Shift:</strong> ${s.shift ? s.shift.toUpperCase() : 'N/A'}</div>
      <div><strong>Start Time:</strong> ${s.suggested_start_time ? new Date(s.suggested_start_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Now'}</div>
      <div><strong>Metrics:</strong> ~${route.total_distance_km || 0} km / ${route.estimated_duration_min || 0} min</div>
    </div>
  `;

  // 2. Build Dynamic CSS Map/Graph
  let graphHtml = '';
  if (wps.length > 0) {
    let minLat = Math.min(...wps.map(w => w.lat));
    let maxLat = Math.max(...wps.map(w => w.lat));
    let minLng = Math.min(...wps.map(w => w.lng));
    let maxLng = Math.max(...wps.map(w => w.lng));

    let latRange = (maxLat - minLat) || 0.01;
    let lngRange = (maxLng - minLng) || 0.01;

    let pointsHtml = '';
    let svgLines = '';
    let prevX, prevY;

    wps.forEach((w, i) => {
      // Changed to 60 multiplier with a 20 offset to bring points inward and prevent clipping
      let x = ((w.lng - minLng) / lngRange) * 60 + 20; 
      let y = 100 - (((w.lat - minLat) / latRange) * 60 + 20); 

      // Use an SVG line instead of CSS math - this perfectly connects the dots!
      if (i > 0) {
        svgLines += `<line x1="${prevX}%" y1="${prevY}%" x2="${x}%" y2="${y}%" stroke="var(--accent)" stroke-width="3" stroke-dasharray="6,4" opacity="0.5" />`;
      }

      pointsHtml += `
        <div style="position:absolute; left:${x}%; top:${y}%; transform:translate(-50%, -50%); width:24px; height:24px; background:var(--accent); color:white; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:bold; z-index:2; box-shadow:0 0 0 4px var(--accent-glow);" title="${w.zone_name || 'Zone'}">
          ${i + 1}
        </div>
        <div style="position:absolute; left:${x}%; top:${y}%; transform:translate(-50%, 18px); font-size:10px; font-weight:500; white-space:nowrap; color:var(--text-secondary); background:var(--bg-secondary); padding:2px 6px; border-radius:4px; border: 1px solid var(--border); z-index:3; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
           ${w.zone_name || `Area ${w.area_id}`}
        </div>
      `;
      
      prevX = x;
      prevY = y;
    });

    graphHtml = `
      <div style="margin-bottom: 20px;">
        <h4 style="font-size: 13px; color: var(--text-muted); text-transform: uppercase; margin-bottom: 10px; font-family: var(--font-display);">Topological Route Graph</h4>
        <!-- Increased height to 240px to give labels more room to breathe -->
        <div style="position: relative; width: 100%; height: 240px; background: #eef2f6; border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; background-image: radial-gradient(var(--border) 1px, transparent 1px); background-size: 20px 20px;">
          <svg style="position: absolute; top:0; left:0; width:100%; height:100%; z-index:1;">
            ${svgLines}
          </svg>
          ${pointsHtml}
        </div>
      </div>
    `;
  }

  // 3. Build Timeline List
  let timelineHtml = `
    <div>
      <h4 style="font-size: 13px; color: var(--text-muted); text-transform: uppercase; margin-bottom: 10px; font-family: var(--font-display);">Checkpoints & Timings</h4>
      <div style="display:flex; flex-direction:column; gap:8px;">
        ${wps.map((w, i) => `
          <div style="display:flex; align-items:center; gap: 12px; font-size: 13px; padding: 10px; border: 1px solid var(--border); border-radius: var(--radius-sm);">
            <div style="width:28px; height:28px; background:var(--bg-primary); color:var(--text-secondary); border: 1px solid var(--border); display:flex; align-items:center; justify-content:center; border-radius:50%; font-family: var(--font-display); font-weight:bold;">${i + 1}</div>
            <div style="flex:1;">
              <div style="font-weight:600; color:var(--text-primary);">${w.zone_name || `Area ${w.area_id}`}</div>
              <div style="color:var(--text-muted); font-size: 11px;">Risk Score: <span style="color:var(--danger); font-weight: 600;">${w.risk_score || 'N/A'}</span></div>
            </div>
            <div style="text-align:right;">
               <div style="color:var(--text-muted); font-size:11px;">ETA</div>
               <div style="font-weight:600; color:var(--text-primary);">${w.estimated_arrival ? new Date(w.estimated_arrival).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '--:--'}</div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  document.getElementById('previewModalBody').innerHTML = detailsHtml + graphHtml + timelineHtml;

  const assignBtn = document.getElementById('previewAssignBtn');
  assignBtn.onclick = () => {
    closePreviewModal();
    assignPatrolByIndex(index);
  };

  document.getElementById('suggestionPreviewModal').classList.add('active');
};

window.closePreviewModal = function() {
  document.getElementById('suggestionPreviewModal').classList.remove('active');
};

function refreshDashboard() {
  loadDashboard();
  showToast('Dashboard refreshed', 'info');
}

// Init
document.addEventListener('DOMContentLoaded', loadDashboard);