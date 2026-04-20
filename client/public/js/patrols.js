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
    const wps = p.waypoints || [];

    document.getElementById('patrolDetailBody').innerHTML = `
      <div style="display:grid;gap:14px">
        <div style="display:flex;gap:10px;align-items:center">
          <span class="status-badge status-${p.status}">${p.status.toUpperCase()}</span>
          <span style="font-size:13px;color:var(--text-secondary)">${p.officer_name} · ${p.designation} · ${p.badge_number}</span>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:12px">
          <div><span style="color:var(--text-muted)">Start:</span> <span style="color:var(--text-primary)">${p.start_time ? fmtDate(p.start_time) : '—'}</span></div>
          <div><span style="color:var(--text-muted)">End:</span> <span style="color:var(--text-primary)">${p.end_time ? fmtDate(p.end_time) : 'Ongoing'}</span></div>
        </div>
        ${p.notes ? `<div style="font-size:12px;color:var(--text-muted);font-style:italic">${p.notes}</div>` : ''}
        ${wps.length ? `
          <div>
            <div style="font-family:var(--font-display);font-size:12px;color:var(--accent);letter-spacing:1px;margin-bottom:8px">WAYPOINTS</div>
            ${wps.map((w, i) => `
              <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
                <div style="width:24px;height:24px;background:${w.status==='reached'?'var(--success-dim)':'var(--border)'};border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-family:var(--font-display);color:${w.status==='reached'?'var(--success)':'var(--text-muted)'}">${i + 1}</div>
                <div style="flex:1;font-size:12px">
                  <div style="color:var(--text-primary)">${w.zone_name || `Zone ${w.area_id}`}</div>
                  <div style="color:var(--text-muted)">${w.estimated_arrival ? 'ETA: ' + fmtDate(w.estimated_arrival) : ''}</div>
                </div>
                <span style="font-size:10px;color:${w.status==='reached'?'var(--success)':w.status==='skipped'?'var(--danger)':'var(--text-muted)'}">${w.status.toUpperCase()}</span>
              </div>
            `).join('')}
          </div>
        ` : '<div style="font-size:12px;color:var(--text-muted)">No waypoints recorded</div>'}
      </div>
    `;
    document.getElementById('patrolDetailModal').classList.add('active');
  } catch {
    showToast('Error loading patrol details', 'error');
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
