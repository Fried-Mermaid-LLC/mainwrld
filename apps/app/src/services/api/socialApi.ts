import { api } from '@/lib/apiClient';

export const socialApi = {
  list: () => api.get<any[]>('/relationships'),
  exists: (target: string) =>
    api.get<{ exists: boolean }>(
      `/relationships/exists?target=${encodeURIComponent(target)}`
    ),
  add: (target: string) => api.post<void>('/relationships', { target }),
  remove: (target: string) =>
    api.del<void>(`/relationships?target=${encodeURIComponent(target)}`),
};
