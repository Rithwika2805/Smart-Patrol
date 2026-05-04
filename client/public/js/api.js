const API_BASE = 'http://localhost:5000/api';

const API = {
  async get(endpoint) {
    const res = await fetch(`${API_BASE}${endpoint}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },

  async post(endpoint, data) {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },

  async put(endpoint, data) {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },

  async delete(endpoint) {
    const res = await fetch(`${API_BASE}${endpoint}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },

  // Endpoints
  crimes: {
    getAll: (params = '') => API.get(`/crimes${params}`),
    getById: (id) => API.get(`/crimes/${id}`),
    getStats: () => API.get('/crimes/stats'),
    getHotspots: () => API.get('/crimes/hotspots'),
    create: (data) => API.post('/crimes', data),
    update: (id, data) => API.put(`/crimes/${id}`, data),
    delete: (id) => API.delete(`/crimes/${id}`),
    predictRisk: (data) => API.post('/crimes/predict-risk', data)
  },

  officers: {
    getAll: (params = '') => API.get(`/officers${params}`),
    getById: (id) => API.get(`/officers/${id}`),
    getAvailable: (shift = '') => API.get(`/officers/available${shift ? `?shift=${shift}` : ''}`),
    create: (data) => API.post('/officers', data),
    update: (id, data) => API.put(`/officers/${id}`, data),
    delete: (id) => API.delete(`/officers/${id}`)
  },

  patrols: {
    getAll: (params = '') => API.get(`/patrols${params}`),
    getById: (id) => API.get(`/patrols/${id}`),
    getActive: () => API.get('/patrols/active'),
    getAnalytics: () => API.get('/patrols/analytics'),
    create: (data) => API.post('/patrols', data),
    updateStatus: (id, data) => API.put(`/patrols/${id}/status`, data),
    suggest: () => API.post('/patrols/suggest', {})
  },

  stations: {
    getAll: (params = '') => API.get(`/stations${params}`),
    getById: (id) => API.get(`/stations/${id}`)
  }
};

// ── TOAST NOTIFICATIONS ──
function showToast(message, type = 'info') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', info: 'fa-info-circle' };
  toast.className = `toast ${type}`;
  toast.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i> ${message}`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = '0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ── DATETIME ──
function updateDatetime() {
  const el = document.getElementById('datetime');
  if (!el) return;
  const now = new Date();
  el.textContent = now.toLocaleString('en-IN', {
    weekday: 'short', day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
  });
}

setInterval(updateDatetime, 1000);
updateDatetime();

// ── SIDEBAR TOGGLE ──
document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.getElementById('sidebarToggle');
  const sidebar = document.getElementById('sidebar');
  const main = document.getElementById('mainContent');

  toggle?.addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');
    main.classList.toggle('expanded');
  });
});

// ── RISK COLOR HELPER ──
function getRiskClass(score) {
  if (score >= 90) return 'risk-critical';
  if (score >= 70) return 'risk-high';
  if (score >= 45) return 'risk-medium';
  return 'risk-low';
}

function getRiskBarColor(score) {
  if (score >= 90) return '#ff4757';
  if (score >= 70) return '#ffa502';
  if (score >= 45) return '#00d4ff';
  return '#2ed573';
}

function timeAgo(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
