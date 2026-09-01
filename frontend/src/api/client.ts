import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
});

// Request interceptor — attach JWT
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor — handle 401, auto-refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const { data } = await axios.post(`${API_BASE}/api/auth/refresh`, {}, { withCredentials: true });
        localStorage.setItem('accessToken', data.accessToken);
        originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(originalRequest);
      } catch {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('user');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;

// API helper functions
export const authApi = {
  login: (email: string, password: string) => api.post('/api/auth/login', { email, password }),
  refresh: () => api.post('/api/auth/refresh'),
  me: () => api.get('/api/auth/me'),
  logout: () => api.post('/api/auth/logout'),
};

export const reportsApi = {
  summary: (params: Record<string, string>) => api.get('/api/reports/summary', { params }),
  registrations: (params: Record<string, string>) => api.get('/api/registrations', { params }),
  recent: (limit = 10) => api.get('/api/reports/recent', { params: { limit } }),
  eventParticipants: (event: string, params: Record<string, string>) =>
    api.get('/api/reports/event-participants', { params: { event, ...params } }),
  forecast: (days = 14) => api.get('/api/forecast', { params: { days } }),
};

export const syncApi = {
  trigger: () => api.post('/api/sync/trigger'),
  status: () => api.get('/api/sync/status'),
  errors: (params: Record<string, string>) => api.get('/api/sync/errors', { params }),
};

export const exportApi = {
  csv: (params: Record<string, string>) =>
    api.get('/api/export/csv', { params, responseType: 'blob' }),
  xlsx: (params: Record<string, string>) =>
    api.get('/api/export/xlsx', { params, responseType: 'blob' }),
};

export const auditApi = {
  logs: (params: Record<string, string>) => api.get('/api/audit-logs', { params }),
};

export const pdfApi = {
  daily: (date: string) =>
    api.get(`/api/reports/daily/${date}`, { responseType: 'blob' }),
  today: () =>
    api.get('/api/reports/daily/today', { responseType: 'blob' }),
  report: (params: Record<string, string>) =>
    api.get('/api/reports/pdf', { params, responseType: 'blob' }),
};

export const settingsApi = {
  get: () => api.get('/api/settings'),
  updateGoal: (target: number) => api.put('/api/settings/goal', { target }),
};
