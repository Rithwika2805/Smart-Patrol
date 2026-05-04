const API_BASE = 'http://localhost:5000/api';

// JWT token
const getToken = () => localStorage.getItem('token');

const request = async (endpoint, options = {}) => {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };

  const token = getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
    
    if (res.status === 401 || res.status === 403) {
      localStorage.removeItem('token');
      window.location.href = 'login.html';
      throw new Error('Unauthorized');
    }

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  } catch (error) {
    console.error("API Error:", error);
    throw error;
  }
};

const API = {
  get: (endpoint) => request(endpoint),
  
  post: (endpoint, data) => request(endpoint, { 
    method: 'POST', 
    body: JSON.stringify(data) 
  }),
  
  put: (endpoint, data) => request(endpoint, { 
    method: 'PUT', 
    body: JSON.stringify(data) 
  }),
  
  delete: (endpoint) => request(endpoint, { 
    method: 'DELETE' 
  }),

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
    suggest: (data = {}) => API.post('/patrols/suggest', data)
  },

  stations: {
    getAll: (params = '') => API.get(`/stations${params}`),
    getById: (id) => API.get(`/stations/${id}`)
  }
};

// TOAST NOTIFICATIONS 
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

// DATETIME
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

// SIDEBAR TOGGLE
document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.getElementById('sidebarToggle');
  const sidebar = document.getElementById('sidebar');
  const main = document.getElementById('mainContent');

  toggle?.addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');
    main.classList.toggle('expanded');
  });
});

// RISK COLOR HELPER
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

// SECURE LOGOUT
function logout() {
  localStorage.removeItem('token');
  
  showToast('Logging out...', 'info');
  
  setTimeout(() => {
    window.location.href = 'login.html';
  }, 500);
}