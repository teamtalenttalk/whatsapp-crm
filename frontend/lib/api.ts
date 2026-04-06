const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8097';

function getToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('crm_token');
}

async function apiFetch(path: string, options: RequestInit = {}) {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API}${path}`, { ...options, headers });
  if (res.status === 401) {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('crm_token');
      window.location.href = '/login';
    }
    throw new Error('Unauthorized');
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

// Auth
export async function register(name: string, email: string, password: string) {
  return apiFetch('/api/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password }) });
}

export async function login(email: string, password: string) {
  return apiFetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
}

export async function getMe() {
  return apiFetch('/api/auth/me');
}

// Dashboard
export async function getDashboardStats() {
  return apiFetch('/api/dashboard/stats');
}

// WhatsApp
export async function getWaStatus() {
  return apiFetch('/api/whatsapp/status');
}

export async function connectWa() {
  return apiFetch('/api/whatsapp/connect', { method: 'POST' });
}

export async function disconnectWa() {
  return apiFetch('/api/whatsapp/disconnect', { method: 'POST' });
}

export async function sendWaMessage(to: string, message: string) {
  return apiFetch('/api/whatsapp/send', { method: 'POST', body: JSON.stringify({ to, message }) });
}

// Contacts
export async function getContacts(search?: string, stage?: string) {
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (stage) params.set('stage', stage);
  return apiFetch(`/api/contacts?${params}`);
}

export async function getContact(id: string) {
  return apiFetch(`/api/contacts/${id}`);
}

export async function createContact(data: { phone: string; name?: string; email?: string; stage?: string }) {
  return apiFetch('/api/contacts', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateContact(id: string, data: Record<string, unknown>) {
  return apiFetch(`/api/contacts/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export async function deleteContact(id: string) {
  return apiFetch(`/api/contacts/${id}`, { method: 'DELETE' });
}

// Messages
export async function getConversations() {
  return apiFetch('/api/messages');
}

export async function getMessages(contactId: string) {
  return apiFetch(`/api/messages/${contactId}`);
}

// Chatbot
export async function getChatbotConfig() {
  return apiFetch('/api/chatbot/config');
}

export async function updateChatbotConfig(data: Record<string, unknown>) {
  return apiFetch('/api/chatbot/config', { method: 'PUT', body: JSON.stringify(data) });
}
