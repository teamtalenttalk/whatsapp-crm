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

// WhatsApp (legacy single-device)
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

// Devices
export async function getDevices() { return apiFetch('/api/devices'); }
export async function createDevice(name: string) { return apiFetch('/api/devices', { method: 'POST', body: JSON.stringify({ name }) }); }
export async function deleteDevice(id: string) { return apiFetch(`/api/devices/${id}`, { method: 'DELETE' }); }
export async function connectDevice(id: string) { return apiFetch(`/api/devices/${id}/connect`, { method: 'POST' }); }
export async function disconnectDevice(id: string) { return apiFetch(`/api/devices/${id}/disconnect`, { method: 'POST' }); }
export async function getDeviceStatus(id: string) { return apiFetch(`/api/devices/${id}/status`); }

// Welcome Messages
export async function getWelcomeMessages() { return apiFetch('/api/welcome-messages'); }
export async function createWelcomeMessage(data: Record<string, unknown>) { return apiFetch('/api/welcome-messages', { method: 'POST', body: JSON.stringify(data) }); }
export async function updateWelcomeMessage(id: string, data: Record<string, unknown>) { return apiFetch(`/api/welcome-messages/${id}`, { method: 'PUT', body: JSON.stringify(data) }); }
export async function deleteWelcomeMessage(id: string) { return apiFetch(`/api/welcome-messages/${id}`, { method: 'DELETE' }); }

// Auto Replies
export async function getAutoReplies() { return apiFetch('/api/auto-replies'); }
export async function createAutoReply(data: Record<string, unknown>) { return apiFetch('/api/auto-replies', { method: 'POST', body: JSON.stringify(data) }); }
export async function updateAutoReply(id: string, data: Record<string, unknown>) { return apiFetch(`/api/auto-replies/${id}`, { method: 'PUT', body: JSON.stringify(data) }); }
export async function deleteAutoReply(id: string) { return apiFetch(`/api/auto-replies/${id}`, { method: 'DELETE' }); }

// Templates
export async function getTemplates() { return apiFetch('/api/templates'); }
export async function createTemplate(data: Record<string, unknown>) { return apiFetch('/api/templates', { method: 'POST', body: JSON.stringify(data) }); }
export async function updateTemplate(id: string, data: Record<string, unknown>) { return apiFetch(`/api/templates/${id}`, { method: 'PUT', body: JSON.stringify(data) }); }
export async function deleteTemplate(id: string) { return apiFetch(`/api/templates/${id}`, { method: 'DELETE' }); }

// Unsubscribes
export async function getUnsubscribes() { return apiFetch('/api/unsubscribes'); }
export async function addUnsubscribe(phone: string, name?: string) { return apiFetch('/api/unsubscribes', { method: 'POST', body: JSON.stringify({ phone, name }) }); }
export async function importUnsubscribes(phones: string[]) { return apiFetch('/api/unsubscribes/import', { method: 'POST', body: JSON.stringify({ phones }) }); }
export async function deleteUnsubscribe(id: string) { return apiFetch(`/api/unsubscribes/${id}`, { method: 'DELETE' }); }

// Number Filter
export async function getFilterResults() { return apiFetch('/api/number-filter'); }
export async function checkNumbers(deviceId: string, phones: string[]) { return apiFetch('/api/number-filter/check', { method: 'POST', body: JSON.stringify({ device_id: deviceId, phones }) }); }
export async function clearFilterResults() { return apiFetch('/api/number-filter', { method: 'DELETE' }); }

// Bulk Send
export async function sendBulkMessages(data: Record<string, unknown>) { return apiFetch('/api/send-message/bulk', { method: 'POST', body: JSON.stringify(data) }); }

// Send Message (enhanced)
export const sendBulkMessage = (data: Record<string, unknown>) =>
  apiFetch('/api/send-message/send', { method: 'POST', body: JSON.stringify(data) });

// Campaigns
export const getCampaigns = () => apiFetch('/api/campaigns');
export const getCampaignDetails = (id: string) => apiFetch(`/api/campaigns/${id}`);
export const startCampaign = (id: string) => apiFetch(`/api/campaigns/${id}/start`, { method: 'POST' });
export const deleteCampaign = (id: string) => apiFetch(`/api/campaigns/${id}`, { method: 'DELETE' });

// File Upload
export async function uploadFile(file: File) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('crm_token') : null;
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${API}/api/upload`, {
    method: 'POST',
    headers: token ? { 'Authorization': `Bearer ${token}` } : {},
    body: formData,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Upload failed');
  }
  return res.json();
}

// Report
export async function getReport(from?: string, to?: string) {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  return apiFetch(`/api/report?${params}`);
}

// Group Grabber
export async function getGroups(deviceId: string) { return apiFetch(`/api/group-grabber/groups?deviceId=${deviceId}`); }
export async function getGroupMembers(deviceId: string, groupId: string) { return apiFetch(`/api/group-grabber/groups/${encodeURIComponent(groupId)}/members?deviceId=${deviceId}`); }
export async function exportGroupMembers(data: Record<string, unknown>) { return apiFetch('/api/group-grabber/export', { method: 'POST', body: JSON.stringify(data) }); }
export async function addGroupToContacts(data: Record<string, unknown>) { return apiFetch('/api/group-grabber/add-to-contacts', { method: 'POST', body: JSON.stringify(data) }); }

// Received Messages
export async function getReceivedMessages(page = 1, limit = 50) { return apiFetch(`/api/received-messages?page=${page}&limit=${limit}`); }
export async function clearReceivedMessages() { return apiFetch('/api/received-messages', { method: 'DELETE' }); }
export async function exportReceivedMessages() { return apiFetch('/api/received-messages/export'); }

// Integrations
export async function getIntegrations() { return apiFetch('/api/integrations'); }
export async function updateIntegration(provider: string, data: Record<string, unknown>) { return apiFetch(`/api/integrations/${provider}`, { method: 'PUT', body: JSON.stringify(data) }); }

// Settings
export async function getSettings() { return apiFetch('/api/settings'); }
export async function updateSettings(data: Record<string, unknown>) { return apiFetch('/api/settings', { method: 'PUT', body: JSON.stringify(data) }); }
