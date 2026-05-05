let patrolMapInstance = null;

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
    const rawPatrols = res.data || [];

    if (!rawPatrols.length) {
      wrap.innerHTML = '<div class="empty-state" style="padding:60px"><i class="fas fa-route"></i><p>No patrols found</p></div>';
      return;
    }

    // Group patrols by route and time to combine teams into single rows
    const groupedMap = new Map();
    rawPatrols.forEach(p => {
      const key = `${p.start_time}_${p.end_time}_${p.status}`;
      if (!groupedMap.has(key)) {
        groupedMap.set(key, { ...p, team: [], patrol_ids: [] });
      }
      const group = groupedMap.get(key);
      group.team.push(p.officer_name.split(' ')[0]);
      group.patrol_ids.push(p.id);
    });
    
    const patrols = Array.from(groupedMap.values());

    wrap.innerHTML = `
      <div style="overflow-x:auto">
        <table class="data-table">
          <thead>
            <tr>
              <th>#</th><th>Officer / Team</th><th>Designation</th><th>Status</th>
              <th>Start Time</th><th>End Time</th><th>Notes</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${patrols.map(p => `
              <tr>
                <td style="color:var(--text-muted)">${p.patrol_ids[0]}</td>
                <td class="bold">
                  ${p.team.length > 1 
                    ? `Team (${p.team.length}) <div style="font-size:11px;font-weight:normal;color:var(--text-muted)">${p.team.join(', ')}</div>` 
                    : p.officer_name}
                </td>
                <td style="font-size:12px;color:var(--accent)">${p.team.length > 1 ? 'Team Patrol' : p.designation}</td>
                <td><span class="status-badge status-${p.status}">${p.status}</span></td>
                <td style="font-size:12px">${p.start_time ? fmtDate(p.start_time) : '—'}</td>
                <td style="font-size:12px">${p.end_time ? fmtDate(p.end_time) : '—'}</td>
                <td style="font-size:11px;color:var(--text-muted);max-width:140px;overflow:hidden;text-overflow:ellipsis">${p.notes || '—'}</td>
                <td>
                  <div style="display:flex;gap:6px">
                    <button class="btn-sm btn-secondary" style="padding:4px 8px" onclick="viewPatrol(${p.patrol_ids[0]})" title="View Route"><i class="fas fa-eye"></i></button>
                    ${p.status === 'scheduled' ? `
                      <button class="btn-sm btn-primary" style="padding:4px 8px" onclick="updateStatus('${p.patrol_ids.join(',')}', 'active')" title="Start Patrol"><i class="fas fa-play"></i></button>
                    ` : ''}
                    ${p.status === 'active' ? `
                      <button class="btn-sm btn-secondary" style="padding:4px 8px;border-color:var(--success);color:var(--success)" onclick="updateStatus('${p.patrol_ids.join(',')}', 'completed')" title="Complete"><i class="fas fa-check"></i></button>
                    ` : ''}
                    ${['scheduled','active'].includes(p.status) ? `
                      <button class="btn-sm btn-danger" style="padding:4px 8px" onclick="updateStatus('${p.patrol_ids.join(',')}', 'cancelled')" title="Cancel"><i class="fas fa-ban"></i></button>
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
    const rawPatrols = res.data || [];

    if (!rawPatrols.length) {
      wrap.innerHTML = '<div class="empty-state" style="padding:60px"><i class="fas fa-satellite-dish"></i><p>No active patrols right now</p></div>';
      return;
    }

    // Group active patrols
    const groupedMap = new Map();
    rawPatrols.forEach(p => {
      const key = `${p.start_time}_${p.end_time}`;
      if (!groupedMap.has(key)) {
        groupedMap.set(key, { ...p, team: [] });
      }
      groupedMap.get(key).team.push(p.officer_name.split(' ')[0]);
    });
    
    const patrols = Array.from(groupedMap.values());

    wrap.innerHTML = `
      <div style="padding:12px 16px;background:var(--danger-dim);border-bottom:1px solid var(--border);font-size:12px;color:var(--danger);display:flex;align-items:center;gap:8px">
        <span class="pulse-dot" style="background:var(--danger)"></span>
        LIVE — ${patrols.length} active patrol unit${patrols.length > 1 ? 's' : ''} in progress
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px;padding:16px">
        ${patrols.map(p => `
          <div style="background:var(--bg-secondary);border:1px solid var(--border);border-left:3px solid var(--success);border-radius:8px;padding:14px">
            <div style="display:flex;justify-content:space-between;margin-bottom:8px">
              <div>
                <div style="font-size:14px;font-weight:500;color:var(--text-primary)">
                  ${p.team.length > 1 ? `Team (${p.team.length}): ${p.team.join(', ')}` : p.officer_name}
                </div>
                <div style="font-size:11px;color:var(--accent)">
                  ${p.team.length > 1 ? 'Team Patrol' : `${p.designation} · ${p.badge_number}`}
                </div>
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
    
    let routeData = {};
    try { 
      routeData = typeof p.route_data === 'string' ? JSON.parse(p.route_data) : p.route_data; 
    } catch(e) {
      routeData = {};
    }

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

    let detailsHtml = `
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px; font-size: 13px;">
        <div><strong>Start:</strong> <span style="color:var(--text-primary)">${p.start_time ? fmtDate(p.start_time) : '—'}</span></div>
        <div><strong>End:</strong> <span style="color:var(--text-primary)">${p.end_time ? fmtDate(p.end_time) : 'Ongoing'}</span></div>
        <div><strong>Metrics:</strong> ~${routeData?.total_distance_km || 0} km / ${routeData?.estimated_duration_min || 0} min</div>
        <div><strong>Status:</strong> <span class="status-badge status-${p.status}">${p.status.toUpperCase()}</span></div>
      </div>
      ${p.notes ? `<div style="font-size:12px;color:var(--text-muted);font-style:italic;margin-bottom:20px;">${p.notes}</div>` : ''}
    `;

    let mapHtml = `
      <div style="margin-bottom: 20px;">
        <h4 style="font-size: 13px; color: var(--text-muted); text-transform: uppercase; margin-bottom: 10px; font-family: var(--font-display);">Interactive Route Map</h4>
        <div id="patrolMap" style="width: 100%; height: 260px; border: 1px solid var(--border); border-radius: var(--radius); background: #eef2f6; z-index: 1;"></div>
      </div>
    `;

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

    document.getElementById('patrolDetailBody').innerHTML = teamHtml + detailsHtml + mapHtml + timelineHtml;
    document.getElementById('patrolDetailModal').classList.add('active'); 

    setTimeout(() => {
      if (patrolMapInstance) {
        patrolMapInstance.remove();
      }

      if (wps.length > 0) {
        patrolMapInstance = L.map('patrolMap', { zoomControl: false }).setView([wps[0].lat, wps[0].lng], 14);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OSM'
        }).addTo(patrolMapInstance);

        const latLngs = wps.map(w => L.latLng(w.lat, w.lng));

        L.Routing.control({
          waypoints: latLngs,
          router: L.Routing.osrmv1({
            serviceUrl: 'https://router.project-osrm.org/route/v1'
          }),
          lineOptions: {
            styles: [
              { color: '#1e3799', weight: 8, opacity: 0.8 },
              { color: '#00d4ff', weight: 4, opacity: 1, dashArray: '8, 6' }
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
        }).addTo(patrolMapInstance);
      }
    }, 100);
  } catch (err) {
    showToast('Error loading patrol details', 'error');
  }
}

async function updateWaypoint(id, status) {
  try {
    await API.put(`/patrols/waypoint/${id}`, { status });

    showToast(`Zone marked as ${status}`, 'success');

    const modal = document.getElementById('patrolDetailModal');
    const patrolId = modal.getAttribute('data-id');

    viewPatrol(patrolId);
  } catch {
    showToast('Failed to update waypoint', 'error');
  }
}

let pendingAction = null;

function updateStatus(idsString, status) {
  const labels = { active: 'Start', completed: 'Complete', cancelled: 'Cancel' };
  const actionWord = labels[status] || 'Update';
  
  document.getElementById('confirmTitle').textContent = `${actionWord} Patrol`;
  document.getElementById('confirmMessage').textContent = `Are you sure you want to ${actionWord.toLowerCase()} this patrol?`;
  
  pendingAction = { idsString, status };
  
  document.getElementById('confirmModal').classList.add('active');
}

function closeConfirm() {
  document.getElementById('confirmModal').classList.remove('active');
  pendingAction = null;
}

document.getElementById('confirmBtn').addEventListener('click', async () => {
  if (!pendingAction) return;
  
  const { idsString, status } = pendingAction;
  
  closeConfirm(); 

  try {
    const ids = String(idsString).split(',');
    await Promise.all(ids.map(id => API.patrols.updateStatus(id, { status })));
    
    showToast(`Patrol marked as ${status}`, 'success');
    loadPatrols();
  } catch {
    showToast('Error updating patrol status', 'error');
  }
});

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