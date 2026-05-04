async function loadOfficers() {
  const grid = document.getElementById('officersGrid');
  grid.innerHTML = '<div class="loading-spinner" style="grid-column:1/-1"></div>';

  const status = document.getElementById('filterStatus').value;
  const shift = document.getElementById('filterShift').value;
  const designation = document.getElementById('filterDesignation').value;

  let params = '?';
  if (status) params += `status=${status}&`;
  if (shift) params += `shift=${shift}&`;
  if (designation) params += `designation=${encodeURIComponent(designation)}&`;

  try {
    const res = await API.officers.getAll(params);
    const officers = res.data || [];

    const available = officers.filter(o => o.status === 'available').length;
    const onDuty = officers.filter(o => o.status === 'on_duty').length;
    const offDuty = officers.filter(o => o.status === 'off_duty').length;
    document.getElementById('officerSummary').innerHTML = `
      <span class="status-pill pill-available">${available} Available</span>
      <span class="status-pill pill-on_duty">${onDuty} On Duty</span>
      <span class="status-pill pill-off_duty">${offDuty} Off Duty</span>
      <span style="font-size:12px;color:var(--text-muted)">${officers.length} total</span>
    `;

    if (!officers.length) {
      grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><i class="fas fa-users-slash"></i><p>No officers found</p></div>';
      return;
    }

    grid.innerHTML = officers.map(o => `
      <div class="officer-card">
        <div class="officer-avatar">${initials(o.name)}</div>
        <div style="flex:1">
          <div style="display:flex;justify-content:space-between;align-items:flex-start">
            <div>
              <div class="officer-name">${o.name}</div>
              <div class="officer-designation">${o.designation} · ${o.badge_number}</div>
            </div>
            <span class="status-pill pill-${o.status}">${o.status.replace('_',' ')}</span>
          </div>
          <div class="officer-meta">
            <i class="fas fa-clock"></i> ${o.shift} shift &nbsp;·&nbsp;
            <i class="fas fa-route"></i> ${o.total_patrols || 0} patrols
          </div>
          ${o.phone ? `<div class="officer-meta"><i class="fas fa-phone"></i> ${o.phone}</div>` : ''}
          <div style="display:flex;gap:6px;margin-top:10px">
            <button class="btn-sm btn-secondary" style="font-size:11px" onclick="editOfficer(${o.id})">
              <i class="fas fa-edit"></i> Edit
            </button>
            <button class="btn-sm btn-danger" style="font-size:11px" onclick="deleteOfficer(${o.id}, '${o.name}')">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>
      </div>
    `).join('');
  } catch (err) {
    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><p>Error loading officers. Is the server running?</p></div>';
  }
}

function initials(name) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

function openOfficerModal() {
  document.getElementById('officerId').value = '';
  document.getElementById('officerName').value = '';
  document.getElementById('officerBadge').value = '';
  document.getElementById('officerDesignation').value = 'Constable';
  document.getElementById('officerPhone').value = '';
  document.getElementById('officerEmail').value = '';
  document.getElementById('officerShift').value = 'morning';
  document.getElementById('officerStatus').value = 'available';
  document.getElementById('officerModalTitle').innerHTML = '<i class="fas fa-user-plus"></i> Add Officer';
  document.getElementById('officerModal').classList.add('active');
}

function closeOfficerModal() {
  document.getElementById('officerModal').classList.remove('active');
}

async function editOfficer(id) {
  try {
    const res = await API.officers.getById(id);
    const o = res.data;
    document.getElementById('officerId').value = o.id;
    document.getElementById('officerName').value = o.name;
    document.getElementById('officerBadge').value = o.badge_number;
    document.getElementById('officerDesignation').value = o.designation;
    document.getElementById('officerPhone').value = o.phone || '';
    document.getElementById('officerEmail').value = o.email || '';
    document.getElementById('officerShift').value = o.shift;
    document.getElementById('officerStatus').value = o.status;
    document.getElementById('officerModalTitle').innerHTML = '<i class="fas fa-edit"></i> Edit Officer';
    document.getElementById('officerModal').classList.add('active');
  } catch {
    showToast('Error loading officer details', 'error');
  }
}

async function saveOfficer() {
  const id = document.getElementById('officerId').value;
  const data = {
    name: document.getElementById('officerName').value.trim(),
    badge_number: document.getElementById('officerBadge').value.trim(),
    designation: document.getElementById('officerDesignation').value,
    phone: document.getElementById('officerPhone').value.trim(),
    email: document.getElementById('officerEmail').value.trim(),
    shift: document.getElementById('officerShift').value,
    status: document.getElementById('officerStatus').value
  };

  if (!data.name) { showToast('Officer name is required', 'error'); return; }
  if (!data.badge_number) { showToast('Badge number is required', 'error'); return; }

  try {
    if (id) {
      await API.officers.update(id, data);
      showToast('Officer updated successfully', 'success');
    } else {
      await API.officers.create(data);
      showToast('Officer added successfully', 'success');
    }
    closeOfficerModal();
    loadOfficers();
  } catch (err) {
    showToast('Error saving officer. Badge number may already exist.', 'error');
  }
}

let pendingDeleteId = null;

function deleteOfficer(id, name) {
  document.getElementById('confirmTitle').textContent = 'Remove Officer';
  document.getElementById('confirmMessage').textContent = `Are you sure you want to remove officer "${name}" from the system?`;
  
  pendingDeleteId = id;
  
  document.getElementById('confirmModal').classList.add('active');
}

function closeConfirm() {
  document.getElementById('confirmModal').classList.remove('active');
  pendingDeleteId = null;
}

document.getElementById('confirmBtn').addEventListener('click', async () => {
  if (!pendingDeleteId) return;
  
  const idToDel = pendingDeleteId;
  
  closeConfirm(); 

  try {
    await API.officers.delete(idToDel);
    showToast('Officer removed', 'success');
    loadOfficers();
  } catch {
    showToast('Cannot delete officer on active patrol', 'error');
  }
});

document.addEventListener('DOMContentLoaded', loadOfficers);