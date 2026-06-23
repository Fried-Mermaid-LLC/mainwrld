import { api } from '@/lib/apiClient';

export const adminApi = {
  // reports
  listReports: () => api.get<any[]>('/reports'),
  fileReport: (data: { type: 'Book' | 'Comment' | 'User'; targetId: string }) =>
    api.post<{ id: string }>('/reports', data),
  updateReportStatus: (
    id: string,
    status: 'pending' | 'resolved' | 'dismissed'
  ) => api.patch<void>(`/reports/${encodeURIComponent(id)}`, { status }),

  // moderation (pre-signup, public)
  moderateUsername: (username: string, displayName: string) =>
    api.post<{ flagged: boolean; category: string | null }>(
      '/moderation/username',
      { username, displayName }
    ),

  // admin actions
  setAdmin: (uid: string, admin: boolean) =>
    api.post<{ uid: string; admin: boolean }>(
      `/admin/users/${encodeURIComponent(uid)}/admin`,
      { admin }
    ),
  ban: (uid: string) =>
    api.post<{ bannedUid: string }>(
      `/admin/users/${encodeURIComponent(uid)}/ban`
    ),
  unban: (uid: string) =>
    api.post<{ unbannedUid: string }>(
      `/admin/users/${encodeURIComponent(uid)}/unban`
    ),
  addStrike: (uid: string, reportId?: string) =>
    api.post<{ strikes: number; banned: boolean }>(
      `/admin/users/${encodeURIComponent(uid)}/strikes`,
      { reportId }
    ),

  rotateSpotlight: () => api.post<{ ok: boolean; bookId?: string }>('/spotlight/rotate'),
};
