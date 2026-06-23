import { api } from '@/lib/apiClient';

export const notificationsApi = {
  list: () => api.get<any[]>('/notifications'),
  create: (notif: Record<string, unknown>) =>
    api.post<{ id: string }>('/notifications', notif),
  markAllRead: () => api.post<void>('/notifications/read'),
  markRead: (id: string) =>
    api.post<void>(`/notifications/${encodeURIComponent(id)}/read`),
};
