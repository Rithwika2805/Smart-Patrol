async function loadCrimes() {
  const wrap = document.getElementById('crimesTableWrap');
  wrap.innerHTML = '<div class="loading-spinner"></div>';

  const type = document.getElementById('filterType').value;
  const status = document.getElementById('filterStatus').value;
  const start = document.getElementById('filterStart').value;
  const end = document.getElementById('filterEnd').value;

  let params = '?limit=200';
  if (type) params += `&type=${encodeURIComponent(type)}`;
  if (status) params += `&status=${status}`;
  if (start) params += `&startDate=${start}`;
  if (end) params += `&endDate=${end}`;

  try {
    const res = await API.crimes.getAll(params);
    const crimes = res.data || [];
    document.getElementById('crimeCount').textContent = `${crimes.length} records found`;

    if (!crimes.length) {
      wrap.innerHTML = '<div class="empty-state" style="padding:60px"><i class="fas fa-folder-open"></i><p>No crime records found</p></div>';
      return;
    }

    wrap.innerHTML = `
      <div style="overflow-x:auto">
        <table class="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Type</th>
              <th>Zone</th>
              <th>Severity</th>
              <th>Status</th>
              <th>Occurred At</th>
              <th>Reported By</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${crimes.map(c => `
              <tr>
                <td style="color:var(--text-muted)">${c.id}</td>
                <td class="bold">${c.crime_type}</td>
                <td>${c.zone_name || '<span style="color:var(--text-muted)">Unknown</span>'}</td>
                <td><span class="status-pill" style="background:${sevBg(c.severity)};color:${sevColor(c.severity)}">${c.severity?.toUpperCase()}</span></td>
                <td><span class="status-badge status-${c.status}">${c.status}</span></td>
                <td style="font-size:12px">${new Date(c.occurred_at).toLocaleString('en-IN', {day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}</td>
                <td style="font-size:12px;color:var(--text-muted)">${c.reported_by || '—'}</td>
                <td>
                  <div style="display:flex;gap:6px">
                    <button class="btn-sm btn-secondary" style="padding:4px 8px" onclick="viewCrime(${c.id})" title="View"><i class="fas fa-eye"></i></button>
                    <button class="btn-sm btn-secondary" style="padding:4px 8px" onclick="editCrime(${c.id})" title="Edit"><i class="fas fa-edit"></i></button>
                    <button class="btn-sm btn-danger" style="padding:4px 8px" onclick="deleteCrime(${c.id})" title="Delete"><i class="fas fa-trash"></i></button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    wrap.innerHTML = '<div class="empty-state"><p>Error loading crimes. Is the server running?</p></div>';
  }
}

function sevBg(s) {
  return s === 'critical' || s === 'high' ? 'rgba(255,71,87,0.15)'
    : s === 'medium' ? 'rgba(255,165,2,0.15)' : 'rgba(46,213,115,0.15)';
}
function sevColor(s) {
  return s === 'critical' || s === 'high' ? '#ff4757' : s === 'medium' ? '#ffa502' : '#2ed573';
}

async function loadZones() {
  try {
    const res = await API.crimes.getHotspots();
    const sel = document.getElementById('crimeArea');
    (res.data || []).forEach(h => {
      const opt = document.createElement('option');
      opt.value = h.id;
      opt.textContent = `${h.zone_name} (Risk: ${h.risk_score})`;
      sel.appendChild(opt);
    });
  } catch {}
}

function openCrimeModal(crime = null) {
  document.getElementById('crimeId').value = '';
  document.getElementById('crimeType').value = '';
  document.getElementById('crimeSeverity').value = 'medium';
  document.getElementById('crimeArea').value = '';
  document.getElementById('crimeStatus').value = 'open';
  document.getElementById('crimeDesc').value = '';
  document.getElementById('crimeReportedBy').value = '';
  document.getElementById('crimeOccurredAt').value = new Date().toISOString().slice(0,16);
  document.getElementById('modalTitle').innerHTML = '<i class="fas fa-file-circle-plus"></i> New Crime Report';
  document.getElementById('crimeModal').classList.add('active');
}

function closeCrimeModal() {
  document.getElementById('crimeModal').classList.remove('active');
}

async function editCrime(id) {
  try {
    const res = await API.crimes.getById(id);
    const c = res.data;
    document.getElementById('crimeId').value = c.id;
    document.getElementById('crimeType').value = c.crime_type;
    document.getElementById('crimeSeverity').value = c.severity;
    document.getElementById('crimeArea').value = c.area_id || '';
    document.getElementById('crimeStatus').value = c.status;
    document.getElementById('crimeDesc').value = c.description || '';
    document.getElementById('crimeReportedBy').value = c.reported_by || '';
    document.getElementById('crimeOccurredAt').value = new Date(c.occurred_at).toISOString().slice(0,16);
    document.getElementById('modalTitle').innerHTML = '<i class="fas fa-edit"></i> Edit Crime Report';
    document.getElementById('crimeModal').classList.add('active');
  } catch {
    showToast('Error loading crime details', 'error');
  }
}

async function viewCrime(id) {
  try {
    const res = await API.crimes.getById(id);
    const c = res.data;
    document.getElementById('viewCrimeBody').innerHTML = `
      <div style="display:grid;gap:12px">
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <span class="status-badge status-${c.status}">${c.status.toUpperCase()}</span>
          <span class="status-pill" style="background:${sevBg(c.severity)};color:${sevColor(c.severity)}">${c.severity?.toUpperCase()}</span>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          ${field('Crime Type', c.crime_type)}
          ${field('Zone', c.zone_name || 'Unknown')}
          ${field('Risk Score', c.risk_score ? `${c.risk_score}/100` : 'N/A')}
          ${field('Occurred At', new Date(c.occurred_at).toLocaleString('en-IN'))}
          ${field('Reported By', c.reported_by || '—')}
          ${field('FIR Number', c.fir_number || 'Not assigned')}
        </div>
        ${c.description ? `<div style="background:var(--bg-primary);border:1px solid var(--border);border-radius:6px;padding:12px;font-size:13px;color:var(--text-secondary)">${c.description}</div>` : ''}
      </div>
    `;
    document.getElementById('viewCrimeModal').classList.add('active');
  } catch {
    showToast('Error loading crime details', 'error');
  }
}

function field(label, value) {
  return `<div>
    <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px">${label}</div>
    <div style="font-size:13px;color:var(--text-primary)">${value}</div>
  </div>`;
}

async function saveCrime() {
  const id = document.getElementById('crimeId').value;
  const data = {
    crime_type: document.getElementById('crimeType').value,
    severity: document.getElementById('crimeSeverity').value,
    area_id: document.getElementById('crimeArea').value,
    status: document.getElementById('crimeStatus').value,
    description: document.getElementById('crimeDesc').value,
    reported_by: document.getElementById('crimeReportedBy').value,
    occurred_at: document.getElementById('crimeOccurredAt').value
  };

  if (!data.crime_type) { showToast('Please select a crime type', 'error'); return; }
  if (!data.area_id) { showToast('Please select a zone/area', 'error'); return; }

  try {
    if (id) {
      await API.crimes.update(id, data);
      showToast('Crime report updated', 'success');
    } else {
      await API.crimes.create(data);
      showToast('Crime report created', 'success');
    }
    closeCrimeModal();
    loadCrimes();
  } catch (err) {
    showToast('Error saving crime report', 'error');
  }
}

async function deleteCrime(id) {
  if (!confirm('Delete this crime record? This cannot be undone.')) return;
  try {
    await API.crimes.delete(id);
    showToast('Crime record deleted', 'success');
    loadCrimes();
  } catch {
    showToast('Error deleting crime record', 'error');
  }
}

function resetFilters() {
  document.getElementById('filterType').value = '';
  document.getElementById('filterStatus').value = '';
  document.getElementById('filterStart').value = '';
  document.getElementById('filterEnd').value = '';
  loadCrimes();
}

document.addEventListener('DOMContentLoaded', () => {
  loadZones();
  loadCrimes();
});