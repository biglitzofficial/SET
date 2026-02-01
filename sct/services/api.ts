// API Service for Backend Communication
const API_BASE_URL = 'http://localhost:5000/api';

// Token Management
export const setAuthToken = (token: string) => {
  localStorage.setItem('authToken', token);
};

export const getAuthToken = () => {
  return localStorage.getItem('authToken');
};

export const clearAuthToken = () => {
  localStorage.removeItem('authToken');
};

// Generic API Request Function
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getAuthToken();
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  };

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  return response.json();
}

// Auth API
export const authAPI = {
  login: async (username: string, password: string) => {
    const data = await apiRequest<{ token: string; user: any }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    setAuthToken(data.token);
    return data;
  },
  
  logout: () => {
    clearAuthToken();
  },
  
  getCurrentUser: () => {
    return apiRequest<any>('/auth/user');
  },
};

// Customer API
export const customerAPI = {
  getAll: () => apiRequest<any[]>('/customers'),
  
  getById: (id: string) => apiRequest<any>(`/customers/${id}`),
  
  create: (customer: any) => 
    apiRequest<any>('/customers', {
      method: 'POST',
      body: JSON.stringify(customer),
    }),
  
  update: (id: string, customer: any) =>
    apiRequest<any>(`/customers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(customer),
    }),
  
  delete: (id: string) =>
    apiRequest<void>(`/customers/${id}`, {
      method: 'DELETE',
    }),
};

// Invoice API
export const invoiceAPI = {
  getAll: () => apiRequest<any[]>('/invoices'),
  
  getById: (id: string) => apiRequest<any>(`/invoices/${id}`),
  
  create: (invoice: any) =>
    apiRequest<any>('/invoices', {
      method: 'POST',
      body: JSON.stringify(invoice),
    }),
  
  update: (id: string, invoice: any) =>
    apiRequest<any>(`/invoices/${id}`, {
      method: 'PUT',
      body: JSON.stringify(invoice),
    }),
  
  void: (id: string) =>
    apiRequest<any>(`/invoices/${id}/void`, {
      method: 'POST',
    }),
  
  delete: (id: string) =>
    apiRequest<void>(`/invoices/${id}`, {
      method: 'DELETE',
    }),
};

// Payment API
export const paymentAPI = {
  getAll: () => apiRequest<any[]>('/payments'),
  
  getById: (id: string) => apiRequest<any>(`/payments/${id}`),
  
  create: (payment: any) =>
    apiRequest<any>('/payments', {
      method: 'POST',
      body: JSON.stringify(payment),
    }),
  
  update: (id: string, payment: any) =>
    apiRequest<any>(`/payments/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payment),
    }),
  
  delete: (id: string) =>
    apiRequest<void>(`/payments/${id}`, {
      method: 'DELETE',
    }),
};

// Reports API
export const reportsAPI = {
  getDashboardStats: () => apiRequest<any>('/reports/dashboard'),
  
  getGeneralLedger: (params?: any) => {
    const query = params ? `?${new URLSearchParams(params)}` : '';
    return apiRequest<any[]>(`/reports/general-ledger${query}`);
  },
  
  getOutstandingReport: () => apiRequest<any>('/reports/outstanding'),
};

// Settings API
export const settingsAPI = {
  get: () => apiRequest<any>('/settings'),
  
  update: (settings: any) =>
    apiRequest<any>('/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    }),
  
  getUsers: () => apiRequest<any[]>('/settings/users'),
  
  createUser: (user: any) =>
    apiRequest<any>('/settings/users', {
      method: 'POST',
      body: JSON.stringify(user),
    }),
  
  updateUser: (id: string, user: any) =>
    apiRequest<any>(`/settings/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(user),
    }),
  
  getBankAccounts: () => apiRequest<any[]>('/settings/bank-accounts'),
  
  getAuditLogs: () => apiRequest<any[]>('/settings/audit-logs'),
};

// Chit Groups API
export const chitAPI = {
  getAll: () => apiRequest<any[]>('/chit-groups'),
  
  getById: (id: string) => apiRequest<any>(`/chit-groups/${id}`),
  
  create: (chitGroup: any) =>
    apiRequest<any>('/chit-groups', {
      method: 'POST',
      body: JSON.stringify(chitGroup),
    }),
  
  update: (id: string, chitGroup: any) =>
    apiRequest<any>(`/chit-groups/${id}`, {
      method: 'PUT',
      body: JSON.stringify(chitGroup),
    }),
  
  recordAuction: (id: string, auctionData: any) =>
    apiRequest<any>(`/chit-groups/${id}/auction`, {
      method: 'POST',
      body: JSON.stringify(auctionData),
    }),
};

// Liabilities API
export const liabilityAPI = {
  getAll: () => apiRequest<any[]>('/liabilities'),
  
  create: (liability: any) =>
    apiRequest<any>('/liabilities', {
      method: 'POST',
      body: JSON.stringify(liability),
    }),
  
  update: (id: string, liability: any) =>
    apiRequest<any>(`/liabilities/${id}`, {
      method: 'PUT',
      body: JSON.stringify(liability),
    }),
};

// Investments API
export const investmentAPI = {
  getAll: () => apiRequest<any[]>('/investments'),
  
  create: (investment: any) =>
    apiRequest<any>('/investments', {
      method: 'POST',
      body: JSON.stringify(investment),
    }),
  
  update: (id: string, investment: any) =>
    apiRequest<any>(`/investments/${id}`, {
      method: 'PUT',
      body: JSON.stringify(investment),
    }),
  
  recordTransaction: (id: string, transaction: any) =>
    apiRequest<any>(`/investments/${id}/transaction`, {
      method: 'POST',
      body: JSON.stringify(transaction),
    }),
};
