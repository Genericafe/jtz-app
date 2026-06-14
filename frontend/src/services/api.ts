import axios from 'axios';

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL ?? '/api' });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('jtz_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('jtz_token');
      localStorage.removeItem('jtz_user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export const authApi = {
  login: (email: string, password: string) => api.post('/auth/login', { email, password }),
  register: (data: object) => api.post('/auth/register', data),
};

export const runnersApi = {
  list: () => api.get('/runners'),
  get: (id: number) => api.get(`/runners/${id}`),
  me: () => api.get('/runners/me'),
  updateMe: (data: object) => api.put('/runners/me', data),
  create: (data: object) => api.post('/runners', data),
  update: (id: number, data: object) => api.put(`/runners/${id}`, data),
  deactivate: (id: number) => api.delete(`/runners/${id}`),
  reactivate: (id: number) => api.put(`/runners/${id}`, { activo: true }),
  permanentDelete: (id: number) => api.delete(`/runners/${id}/permanent`),
  addLog:    (id: number, data: object) => api.post(`/runners/${id}/logs`, data),
  deleteLog: (id: number, logId: number) => api.delete(`/runners/${id}/logs/${logId}`),
  bulkEmail: (data: object) => api.post('/runners/bulk-email', data),
};

export const plansApi = {
  list: () => api.get('/plans'),
  get: (id: number) => api.get(`/plans/${id}`),
  preview: (data: object) => api.post('/plans/preview', data),
  generate: (data: object) => api.post('/plans/generate', data),
  create: (data: object) => api.post('/plans', data),
  update: (id: number, data: object) => api.put(`/plans/${id}`, data),
  updateDay: (dayId: number, data: object) => api.put(`/plans/day/${dayId}`, data),
  assign: (id: number, data: object) => api.post(`/plans/${id}/assign`, data),
  delete: (id: number) => api.delete(`/plans/${id}`),
  toggleTemplate: (id: number) => api.post(`/plans/${id}/template`, {}),
  getPreferences: () => api.get('/plans/preferences'),
  savePreferences: (data: object) => api.put('/plans/preferences', data),
};

export const aiApi = {
  improveText: (texto: string, contexto?: string) =>
    api.post('/ai/improve-text', { texto, contexto }),
};

export const eventsApi = {
  list: () => api.get('/events'),
  get: (id: number) => api.get(`/events/${id}`),
  create: (data: object) => api.post('/events', data),
  update: (id: number, data: object) => api.put(`/events/${id}`, data),
  delete: (id: number) => api.delete(`/events/${id}`),
  register: (id: number, runnerId: number) => api.post(`/events/${id}/register`, { runnerId }),
};

export const paymentsApi = {
  list: () => api.get('/payments'),
  stats: () => api.get('/payments/stats'),
  create: (data: object) => api.post('/payments', data),
  markPaid: (id: number) => api.put(`/payments/${id}/pay`),
  update: (id: number, data: object) => api.put(`/payments/${id}`, data),
};

export const productsApi = {
  list: () => api.get('/products'),
  create: (data: object) => api.post('/products', data),
  update: (id: number, data: object) => api.put(`/products/${id}`, data),
  orders: () => api.get('/products/orders'),
  createOrder: (data: object) => api.post('/products/orders', data),
  updateOrder: (id: number, estado: string) => api.put(`/products/orders/${id}`, { estado }),
  myOrders: () => api.get('/products/orders/mine'),
  buyNow: (data: object) => api.post('/products/orders/self', data),
  deleteProduct: (id: number) => api.delete(`/products/${id}`),
};

export const announcementsApi = {
  list: () => api.get('/announcements'),
  create: (data: object) => api.post('/announcements', data),
  update: (id: number, data: object) => api.put(`/announcements/${id}`, data),
  delete: (id: number) => api.delete(`/announcements/${id}`),
};

export const publicApi = {
  getEvent: (id: number) => api.get(`/public/events/${id}`),
  registerFree: (id: number, data: object) => api.post(`/public/events/${id}/register`, data),
  checkout: (id: number, data: object) => api.post(`/public/events/${id}/checkout`, data),
  verifySession: (sessionId: string) => api.get(`/public/verify/${sessionId}`),
};

export const settingsApi = {
  getEmailConfig: () => api.get('/settings/email'),
  saveEmailConfig: (data: object) => api.post('/settings/email', data),
  testEmailConfig: () => api.post('/settings/email/test'),
  deleteEmailConfig: () => api.delete('/settings/email'),
};

export const leadsApi = {
  list: (eventId: number) => api.get(`/coach/events/${eventId}/leads`),
  exportUrl: (eventId: number) => `/api/coach/events/${eventId}/leads/export`,
  broadcast: (eventId: number, data: object) => api.post(`/coach/events/${eventId}/broadcast`, data),
  updateStatus: (leadId: number, estado: string) => api.put(`/coach/leads/${leadId}`, { estado }),
  delete: (leadId: number) => api.delete(`/coach/leads/${leadId}`),
};

export const stripeApi = {
  createCheckout:      (paymentId: number)                     => api.post(`/stripe/checkout/${paymentId}`),
  createOrderCheckout: (data: object)                          => api.post('/stripe/checkout/order', data),
  verifyPayment:       (sessionId: string, paymentId: string)  => api.get(`/stripe/verify?session_id=${sessionId}&payment_id=${paymentId}`),
  verifyOrderPayment:  (sessionId: string, orderId: string)    => api.get(`/stripe/verify-order?session_id=${sessionId}&order_id=${orderId}`),
};

export const chatApi = {
  conversations: () => api.get('/chat'),
  messages: (runnerId: number) => api.get(`/chat/${runnerId}`),
  send: (runnerId: number, content: string) => api.post(`/chat/${runnerId}`, { content }),
};

export const integrationsApi = {
  stravaStatus:       ()             => api.get('/integrations/strava/status'),
  stravaConnect:      ()             => api.get('/integrations/strava/connect'),
  stravaDisconnect:   ()             => api.post('/integrations/strava/disconnect'),
  stravaSync:         ()             => api.post('/integrations/strava/sync'),
  getActivities:      ()             => api.get('/integrations/activities'),
  getActivity:        (id: number)   => api.get(`/integrations/activities/${id}`),
  getDayActivities:   (diaId: number) => api.get(`/integrations/activities/day/${diaId}`),
  logActivity:        (d: object)    => api.post('/integrations/activities', d),
  confirmActivity:    (id: number)   => api.patch(`/integrations/activities/${id}/confirm`, {}),
  unconfirmActivity:  (id: number)   => api.patch(`/integrations/activities/${id}/unconfirm`, {}),
  deleteActivity:     (id: number)   => api.delete(`/integrations/activities/${id}`),
};

export default api;
