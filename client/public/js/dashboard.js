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
          <button class="btn-assign" onclick="assignPatrolByIndex(${index})">
            <i class="fas fa-check"></i> Assign Patrol
          </button>
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

  // ✅ MULTI-ZONE FIX
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

function refreshDashboard() {
  loadDashboard();
  showToast('Dashboard refreshed', 'info');
}

// Init
document.addEventListener('DOMContentLoaded', loadDashboard);
