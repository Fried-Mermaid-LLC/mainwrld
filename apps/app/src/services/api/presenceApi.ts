import { api } from '@/lib/apiClient';

export const presenceApi = {
  heartbeat: (activity?: string, currentBookId?: string | null) =>
    api.put<void>('/presence/heartbeat', { activity, currentBookId }),
  offline: () => api.post<void>('/presence/offline'),
};
