import { api } from '@/lib/apiClient';
import type { ReportReason } from '@/types';

export const adminApi = {
  // reports
  listReports: () => api.get<any[]>('/reports'),
  fileReport: (data: {
    type: 'Book' | 'Comment' | 'User';
    targetId: string;
    reason?: ReportReason;
  }) => api.post<{ id: string }>('/reports', data),
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
  // Counterpart to addStrike. `strikes` is a server-managed/protected field, so
  // reducing it must go through this admin endpoint — a profile PATCH would drop
  // it (own profile) or no-op (another user's).
  removeStrike: (uid: string) =>
    api.del<{ strikes: number }>(
      `/admin/users/${encodeURIComponent(uid)}/strikes`
    ),

  // Terminal book take-down. Stamps server-managed flags (takenDown/isMonetized)
  // that the author-facing PATCH /books/:id whitelists away, so it must run
  // through this admin endpoint.
  takeDownBook: (bookId: string) =>
    api.post<{ bookId: string }>(
      `/admin/books/${encodeURIComponent(bookId)}/takedown`
    ),

  rotateSpotlight: () => api.post<{ ok: boolean; bookId?: string }>('/spotlight/rotate'),
};
