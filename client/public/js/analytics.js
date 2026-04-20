const chartOpts = (title) => ({
  responsive: true, maintainAspectRatio: false,
  plugins: { legend: { labels: { color: '#7a9bb5', font: { family: 'Exo 2', size: 11 } } } },
  scales: {
    x: { ticks: { color: '#4a6a82', font: { size: 10 } }, grid: { color: '#1e3045' } },
    y: { ticks: { color: '#4a6a82', font: { size: 10 } }, grid: { color: '#1e3045' } }
  }
});

async function loadAnalytics() {
  try {
    const [crimeStats, patrolAnalytics] = await Promise.all([
      API.crimes.getStats(),
      API.patrols.getAnalytics()
    ]);

    drawAreaChart(crimeStats.data?.byArea || []);
    drawHourChart(crimeStats.data?.byHour || []);
    drawCoverageChart(patrolAnalytics.data?.coverage || []);
    drawOfficerPerf(patrolAnalytics.data?.officerPerformance || []);
  } catch (err) {
    console.error('Analytics error:', err);
  }
}

function drawAreaChart(data) {
  const ctx = document.getElementById('areaChart').getContext('2d');
  new Chart(ctx, {
    type: 'horizontalBar' in Chart.defaults ? 'horizontalBar' : 'bar',
    data: {
      labels: data.map(d => d.zone_name),
      datasets: [{
        label: 'Crimes (30 days)',
        data: data.map(d => d.crime_count),
        backgroundColor: data.map(d =>
          d.risk_score >= 75 ? 'rgba(255,71,87,0.6)'
          : d.risk_score >= 50 ? 'rgba(255,165,2,0.6)'
          : 'rgba(0,212,255,0.4)'
        ),
        borderColor: data.map(d =>
          d.risk_score >= 75 ? '#ff4757' : d.risk_score >= 50 ? '#ffa502' : '#00d4ff'
        ),
        borderWidth: 2,
        borderRadius: 4
      }]
    },
    options: {
      ...chartOpts(),
      indexAxis: 'y',
      plugins: {
        ...chartOpts().plugins,
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const d = data[ctx.dataIndex];
              return ` ${ctx.parsed.x} crimes · Risk: ${d.risk_score}/100`;
            }
          }
        }
      }
    }
  });
}

function drawHourChart(data) {
  const ctx = document.getElementById('hourChart').getContext('2d');
  const labels = data.map(d => `${d.hour}:00`);
  const values = data.map(d => d.count);

  // Highlight night hours
  const bgColors = labels.map((_, i) => {
    const h = parseInt(data[i]?.hour || 0);
    return (h >= 20 || h <= 5) ? 'rgba(255,71,87,0.5)' : 'rgba(0,212,255,0.3)';
  });

  new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Crimes',
        data: values,
        backgroundColor: bgColors,
        borderColor: bgColors.map(c => c.replace('0.5','1').replace('0.3','1')),
        borderWidth: 1,
        borderRadius: 3
      }]
    },
    options: {
      ...chartOpts(),
      plugins: {
        ...chartOpts().plugins,
        annotation: {}
      }
    }
  });
}

function drawCoverageChart(data) {
  const ctx = document.getElementById('coverageChart').getContext('2d');
  new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.map(d => new Date(d.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })),
      datasets: [{
        label: 'Patrols',
        data: data.map(d => d.patrol_count),
        borderColor: '#2ed573',
        backgroundColor: 'rgba(46,213,115,0.1)',
        fill: true, tension: 0.4,
        pointBackgroundColor: '#2ed573', pointRadius: 4
      }, {
        label: 'Hours Covered',
        data: data.map(d => Math.round((d.total_minutes || 0) / 60)),
        borderColor: '#ffa502',
        backgroundColor: 'rgba(255,165,2,0.1)',
        fill: true, tension: 0.4,
        pointBackgroundColor: '#ffa502', pointRadius: 4
      }]
    },
    options: chartOpts()
  });
}

function drawOfficerPerf(data) {
  const el = document.getElementById('officerPerf');
  if (!data.length) { el.innerHTML = '<div class="empty-state"><p>No data</p></div>'; return; }

  const max = Math.max(...data.map(d => d.total_patrols));
  el.innerHTML = data.map((o, i) => `
    <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
      <div style="width:24px;text-align:center;font-size:11px;color:var(--text-muted);font-family:var(--font-display)">${i+1}</div>
      <div style="width:32px;height:32px;background:var(--accent-glow);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-family:var(--font-display);color:var(--accent)">${o.name.split(' ').map(n=>n[0]).join('').slice(0,2)}</div>
      <div style="flex:1">
        <div style="font-size:12px;font-weight:500;color:var(--text-primary)">${o.name}</div>
        <div style="margin-top:4px;background:var(--border);border-radius:2px;height:4px;overflow:hidden">
          <div style="width:${max>0?(o.total_patrols/max*100):0}%;height:100%;background:var(--accent);border-radius:2px"></div>
        </div>
      </div>
      <div style="text-align:right;font-size:11px">
        <div style="color:var(--text-primary);font-family:var(--font-display)">${o.total_patrols}</div>
        <div style="color:var(--success)">${o.completed} done</div>
      </div>
    </div>
  `).join('');
}

async function loadZones() {
  try {
    const res = await API.crimes.getHotspots();
    const sel = document.getElementById('predictZone');
    sel.innerHTML = '<option value="">Select Zone</option>';
    (res.data || []).forEach(h => {
      sel.innerHTML += `<option value="${h.id}">${h.zone_name} (Risk: ${h.risk_score})</option>`;
    });
    // Default hour to current
    document.getElementById('predictHour').value = new Date().getHours();
  } catch {}
}

async function runPrediction() {
  const zoneId = document.getElementById('predictZone').value;
  const hour = document.getElementById('predictHour').value;
  const day = document.getElementById('predictDay').value;
  const el = document.getElementById('predictionResult');

  if (!zoneId) { showToast('Please select a zone', 'error'); return; }

  el.style.display = 'block';
  el.innerHTML = '<div class="loading-spinner" style="margin:8px auto"></div>';

  try {
    const res = await API.crimes.predictRisk({
      area_id: parseInt(zoneId),
      time_of_day: parseInt(hour),
      day_of_week: day ? parseInt(day) : null
    });
    const d = res.data;
    const colors = { HIGH: 'var(--danger)', MEDIUM: 'var(--warning)', LOW: 'var(--success)' };
    const color = colors[d.risk_level] || 'var(--accent)';

    el.innerHTML = `
      <div style="background:var(--bg-primary);border:1px solid var(--border);border-left:3px solid ${color};border-radius:8px;padding:16px;display:grid;grid-template-columns:auto 1fr;gap:16px">
        <div style="text-align:center">
          <div style="font-family:var(--font-display);font-size:48px;font-weight:700;color:${color};line-height:1">${d.risk_score}</div>
          <div style="font-size:10px;color:var(--text-muted)">RISK SCORE</div>
          <div style="font-family:var(--font-display);font-size:16px;font-weight:700;color:${color};letter-spacing:2px;margin-top:4px">${d.risk_level}</div>
        </div>
        <div>
          <div style="font-size:14px;font-weight:500;color:var(--text-primary);margin-bottom:6px">${d.zone_name}</div>
          <div style="font-size:12px;color:var(--text-secondary);margin-bottom:6px">${d.analysis}</div>
          ${d.predicted_crimes?.length ? `
            <div style="font-size:11px;color:var(--text-muted)">Likely crimes: 
              ${d.predicted_crimes.map(c => `<span style="background:var(--border);border-radius:4px;padding:1px 6px;margin-left:4px;color:var(--text-secondary)">${c}</span>`).join('')}
            </div>` : ''}
          <div style="margin-top:10px;padding:8px 12px;background:${color}22;border-radius:6px;font-size:12px;color:${color}">
            <i class="fas fa-lightbulb"></i> ${d.recommendation}
          </div>
        </div>
      </div>
    `;
  } catch {
    el.innerHTML = '<div style="color:var(--danger);font-size:12px">Error running prediction. Is the server running?</div>';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadZones();
  loadAnalytics();
});
