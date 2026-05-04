async function loadPatrols() {
  const wrap = document.getElementById('patrolsTableWrap');
  wrap.innerHTML = '<div class="loading-spinner"></div>';

  const status = document.getElementById('filterStatus').value;
  const date = document.getElementById('filterDate').value;
  let params = '?';
  if (status) params += `status=${status}&`;
  if (date) params += `date=${date}&`;

  try {
    const res = await API.patrols.getAll(params);
    const patrols = res.data || [];

    if (!patrols.length) {
      wrap.innerHTML = '<div class="empty-state" style="padding:60px"><i class="fas fa-route"></i><p>No patrols found</p></div>';
      return;
    }

    wrap.innerHTML = `
      <div style="overflow-x:auto">
        <table class="data-table">
          <thead>
            <tr>
              <th>#</th><th>Officer</th><th>Designation</th><th>Status</th>
              <th>Start Time</th><th>End Time</th><th>Notes</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${patrols.map(p => `
              <tr>
                <td style="color:var(--text-muted)">${p.id}</td>
                <td class="bold">${p.officer_name}</td>
                <td style="font-size:12px;color:var(--accent)">${p.designation}</td>
                <td><span class="status-badge status-${p.status}">${p.status}</span></td>
                <td style="font-size:12px">${p.start_time ? fmtDate(p.start_time) : '—'}</td>
                <td style="font-size:12px">${p.end_time ? fmtDate(p.end_time) : '—'}</td>
                <td style="font-size:11px;color:var(--text-muted);max-width:140px;overflow:hidden;text-overflow:ellipsis">${p.notes || '—'}</td>
                <td>
                  <div style="display:flex;gap:6px">
                    <button class="btn-sm btn-secondary" style="padding:4px 8px" onclick="viewPatrol(${p.id})" title="View Route"><i class="fas fa-eye"></i></button>
                    ${p.status === 'scheduled' ? `
                      <button class="btn-sm btn-primary" style="padding:4px 8px" onclick="updateStatus(${p.id},'active')" title="Start Patrol"><i class="fas fa-play"></i></button>
                    ` : ''}
                    ${p.status === 'active' ? `
                      <button class="btn-sm btn-secondary" style="padding:4px 8px;border-color:var(--success);color:var(--success)" onclick="updateStatus(${p.id},'completed')" title="Complete"><i class="fas fa-check"></i></button>
                    ` : ''}
                    ${['scheduled','active'].includes(p.status) ? `
                      <button class="btn-sm btn-danger" style="padding:4px 8px" onclick="updateStatus(${p.id},'cancelled')" title="Cancel"><i class="fas fa-ban"></i></button>
                    ` : ''}
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    wrap.innerHTML = '<div class="empty-state"><p>Error loading patrols. Is the server running?</p></div>';
  }
}

async function loadActivePatrols() {
  const wrap = document.getElementById('patrolsTableWrap');
  wrap.innerHTML = '<div class="loading-spinner"></div>';

  try {
    const res = await API.patrols.getActive();
    const patrols = res.data || [];

    if (!patrols.length) {
      wrap.innerHTML = '<div class="empty-state" style="padding:60px"><i class="fas fa-satellite-dish"></i><p>No active patrols right now</p></div>';
      return;
    }

    wrap.innerHTML = `
      <div style="padding:12px 16px;background:var(--danger-dim);border-bottom:1px solid var(--border);font-size:12px;color:var(--danger);display:flex;align-items:center;gap:8px">
        <span class="pulse-dot" style="background:var(--danger)"></span>
        LIVE — ${patrols.length} active patrol${patrols.length > 1 ? 's' : ''} in progress
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px;padding:16px">
        ${patrols.map(p => `
          <div style="background:var(--bg-secondary);border:1px solid var(--border);border-left:3px solid var(--success);border-radius:8px;padding:14px">
            <div style="display:flex;justify-content:space-between;margin-bottom:8px">
              <div>
                <div style="font-size:14px;font-weight:500;color:var(--text-primary)">${p.officer_name}</div>
                <div style="font-size:11px;color:var(--accent)">${p.designation} · ${p.badge_number}</div>
              </div>
              <span class="status-badge status-active">ACTIVE</span>
            </div>
            <div style="font-size:11px;color:var(--text-muted)">
              <i class="fas fa-map-pin"></i> ${p.assigned_zone || 'Route in progress'}<br/>
              <i class="fas fa-clock"></i> Started: ${fmtDate(p.start_time)}
            </div>
          </div>
        `).join('')}
      </div>
    `;
  } catch (err) {
    wrap.innerHTML = '<div class="empty-state"><p>Error loading active patrols</p></div>';
  }
}

async function viewPatrol(id) {
  try {
    const res = await API.patrols.getById(id);
    const p = res.data;
    document.getElementById('patrolDetailModal').setAttribute('data-id', id);
    
    const wps = p.waypoints || [];
    const team = p.team || [{ name: p.officer_name, designation: p.designation, badge_number: p.badge_number }];
    
    // Parse the JSON string stored in the database to extract the distance/duration
    let routeData = {};
    try { routeData = typeof p.route_data === 'string' ? JSON.parse(p.route_data) : p.route_data; } catch(e) {}

    // 1. Build Team Roster UI
    let teamHtml = `
      <div style="margin-bottom: 20px; background: var(--bg-primary); padding: 12px; border-radius: var(--radius-sm); border: 1px solid var(--border);">
        <h4 style="font-size: 13px; color: var(--text-muted); text-transform: uppercase; margin-bottom: 10px; font-family: var(--font-display);">Team Roster</h4>
        <div style="display:flex; flex-direction:column; gap:8px;">
          ${team.map(o => `
            <div style="display:flex; justify-content:space-between; align-items:center; background: var(--bg-secondary); padding: 8px 12px; border: 1px solid var(--border-light); border-radius: 4px; font-size:13px;">
              <div><strong>${o.designation} ${o.name}</strong> <span style="color:var(--text-muted);font-size:11px">(${o.badge_number})</span></div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    // 2. Build Details Header
    let detailsHtml = `
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px; font-size: 13px;">
        <div><strong>Start:</strong> <span style="color:var(--text-primary)">${p.start_time ? fmtDate(p.start_time) : '—'}</span></div>
        <div><strong>End:</strong> <span style="color:var(--text-primary)">${p.end_time ? fmtDate(p.end_time) : 'Ongoing'}</span></div>
        <div><strong>Metrics:</strong> ~${routeData?.total_distance_km || 0} km / ${routeData?.estimated_duration_min || 0} min</div>
        <div><strong>Status:</strong> <span class="status-badge status-${p.status}">${p.status.toUpperCase()}</span></div>
      </div>
      ${p.notes ? `<div style="font-size:12px;color:var(--text-muted);font-style:italic;margin-bottom:20px;">${p.notes}</div>` : ''}
    `;

    // 3. Build Dynamic Topological Graph
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
        let x = ((w.lng - minLng) / lngRange) * 60 + 20; 
        let y = 100 - (((w.lat - minLat) / latRange) * 60 + 20); 

        if (i > 0) {
          svgLines += `<line x1="${prevX}%" y1="${prevY}%" x2="${x}%" y2="${y}%" stroke="var(--accent)" stroke-width="3" stroke-dasharray="6,4" opacity="0.5" />`;
        }

        // Change color to green if the waypoint has been reached!
        const nodeColor = w.status === 'reached' ? 'var(--success)' : 'var(--accent)';
        const glowColor = w.status === 'reached' ? 'var(--success-dim)' : 'var(--accent-glow)';

        pointsHtml += `
          <div style="position:absolute; left:${x}%; top:${y}%; transform:translate(-50%, -50%); width:24px; height:24px; background:${nodeColor}; color:white; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:bold; z-index:2; box-shadow:0 0 0 4px ${glowColor};" title="${w.zone_name || 'Zone'}">
            ${i + 1}
          </div>
          <div style="position:absolute; left:${x}%; top:${y}%; transform:translate(-50%, 18px); font-size:10px; font-weight:500; white-space:nowrap; color:var(--text-secondary); background:var(--bg-secondary); padding:2px 6px; border-radius:4px; border: 1px solid var(--border); z-index:3; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
             ${w.zone_name || `Zone ${w.area_id}`}
          </div>
        `;
        prevX = x; prevY = y;
      });

      graphHtml = `
        <div style="margin-bottom: 20px;">
          <h4 style="font-size: 13px; color: var(--text-muted); text-transform: uppercase; margin-bottom: 10px; font-family: var(--font-display);">Topological Route Graph</h4>
          <div style="position: relative; width: 100%; height: 240px; background: #eef2f6; border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; background-image: radial-gradient(var(--border) 1px, transparent 1px); background-size: 20px 20px;">
            <svg style="position: absolute; top:0; left:0; width:100%; height:100%; z-index:1; pointer-events:none;">
              ${svgLines}
            </svg>
            ${pointsHtml}
          </div>
        </div>
      `;
    }

    // 4. Build Timeline List
    let timelineHtml = `
      <div>
        <h4 style="font-size: 13px; color: var(--text-muted); text-transform: uppercase; margin-bottom: 10px; font-family: var(--font-display);">Waypoints</h4>
        <div style="display:flex; flex-direction:column; gap:8px;">
          ${wps.map((w, i) => `
            <div style="display:flex; align-items:center; gap: 12px; font-size: 13px; padding: 10px; border: 1px solid var(--border); border-radius: var(--radius-sm);">
              <div style="width:28px; height:28px; background:${w.status==='reached'?'var(--success-dim)':'var(--bg-primary)'}; color:${w.status==='reached'?'var(--success)':'var(--text-secondary)'}; border: 1px solid ${w.status==='reached'?'var(--success)':'var(--border)'}; display:flex; align-items:center; justify-content:center; border-radius:50%; font-weight:bold;">${i + 1}</div>
              <div style="flex:1;">
                <div style="font-weight:600; color:var(--text-primary);">${w.zone_name || `Zone ${w.area_id}`}</div>
                <div style="color:var(--text-muted); font-size: 11px;">
                  ${w.risk_score ? `Risk Score: <span style="color:var(--danger); font-weight:600;">${w.risk_score}</span> · ` : ''}
                  ETA: ${w.estimated_arrival ? fmtDate(w.estimated_arrival) : '--:--'}
                </div>
                ${p.status === 'active' && w.status !== 'reached' ? `
                  <div style="margin-top:6px;display:flex;gap:6px">
                    <button onclick="updateWaypoint(${w.id}, 'reached')" class="btn-sm btn-primary" style="padding:4px 8px;">✔ Done</button>
                    <button onclick="updateWaypoint(${w.id}, 'skipped')" class="btn-sm btn-danger" style="padding:4px 8px;">✖ Skip</button>
                  </div>
                ` : ''}
              </div>
              <div style="text-align:right;">
                <span style="font-size:10px; font-weight:bold; color:${w.status==='reached'?'var(--success)':w.status==='skipped'?'var(--danger)':'var(--text-muted)'}">${w.status.toUpperCase()}</span>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    document.getElementById('patrolDetailBody').innerHTML = teamHtml + detailsHtml + graphHtml + timelineHtml;
    document.getElementById('patrolDetailModal').classList.add('active');
  } catch (err) {
    showToast('Error loading patrol details', 'error');
  }
}

async function updateWaypoint(id, status) {
  try {
    await API.put(`/patrols/waypoint/${id}`, { status });

    showToast(`Zone marked as ${status}`, 'success');

    // reload modal
    const modal = document.getElementById('patrolDetailModal');
    const patrolId = modal.getAttribute('data-id');

    viewPatrol(patrolId);
  } catch {
    showToast('Failed to update waypoint', 'error');
  }
}

async function updateStatus(id, status) {
  const labels = { active: 'start', completed: 'complete', cancelled: 'cancel' };
  if (!confirm(`${labels[status]?.charAt(0).toUpperCase() + labels[status]?.slice(1)} this patrol?`)) return;
  try {
    await API.patrols.updateStatus(id, { status });
    showToast(`Patrol ${status}`, 'success');
    loadPatrols();
  } catch {
    showToast('Error updating patrol status', 'error');
  }
}

async function openAssignModal() {
  try {
    const [officersRes, zonesRes] = await Promise.all([
      API.officers.getAvailable(),
      API.crimes.getHotspots()
    ]);

    const officerSel = document.getElementById('patrolOfficer');
    officerSel.innerHTML = '<option value="">Select Available Officer</option>';
    (officersRes.data || []).forEach(o => {
      officerSel.innerHTML += `<option value="${o.id}">${o.designation} ${o.name} (${o.badge_number}) — ${o.shift}</option>`;
    });

    const zoneSel = document.getElementById('patrolZones');
    zoneSel.innerHTML = '';
    (zonesRes.data || []).forEach(z => {
      zoneSel.innerHTML += `<option value="${z.id}">${z.zone_name} (Risk: ${z.risk_score})</option>`;
    });

    const now = new Date();
    const end = new Date(now.getTime() + 4 * 3600000);
    document.getElementById('patrolStart').value = now.toISOString().slice(0, 16);
    document.getElementById('patrolEnd').value = end.toISOString().slice(0, 16);
    document.getElementById('patrolNotes').value = '';
    document.getElementById('routePreview').style.display = 'none';
    document.getElementById('assignModal').classList.add('active');
  } catch {
    showToast('Error loading data for assignment', 'error');
  }
}

function closeAssignModal() {
  document.getElementById('assignModal').classList.remove('active');
}

async function assignPatrol() {
  const officerId = document.getElementById('patrolOfficer').value;
  const selectedZones = [...document.getElementById('patrolZones').selectedOptions].map(o => o.value);
  const startTime = document.getElementById('patrolStart').value;
  const endTime = document.getElementById('patrolEnd').value;
  const notes = document.getElementById('patrolNotes').value;

  if (!officerId) { showToast('Please select an officer', 'error'); return; }
  if (!selectedZones.length) { showToast('Please select at least one zone', 'error'); return; }

  try {
    const res = await API.patrols.create({
      officer_id: parseInt(officerId),
      area_ids: selectedZones.map(Number),
      start_time: startTime,
      end_time: endTime,
      notes
    });

    // Show route preview
    const route = res.data?.route;
    if (route?.waypoints?.length) {
      document.getElementById('routePreview').style.display = 'block';
      document.getElementById('routePreviewContent').innerHTML = `
        <div style="color:var(--text-secondary)">
          ${route.waypoints.map((w, i) => `<span style="color:var(--accent)">${i + 1}.</span> ${w.zone_name}`).join(' → ')}
        </div>
        <div style="margin-top:6px;color:var(--text-muted)">
          Distance: ~${route.total_distance_km} km · Est. duration: ${route.estimated_duration_min} min
        </div>
      `;
    }

    showToast('Patrol route assigned successfully!', 'success');
    closeAssignModal();
    loadPatrols();
  } catch {
    showToast('Error assigning patrol. Officer may not be available.', 'error');
  }
}

function fmtDate(d) {
  return new Date(d).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true
  });
}

document.addEventListener('DOMContentLoaded', loadPatrols);
