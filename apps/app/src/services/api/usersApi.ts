import { api } from '@/lib/apiClient';

export const usersApi = {
  list: () => api.get<any[]>('/users'),
  getMe: () => api.get<any>('/users/me'),
  getById: (uid: string) => api.get<any>(`/users/${uid}`),
  getByUsername: (username: string) =>
    api.get<any>(`/users/by-username/${encodeURIComponent(username)}`),
  checkUsername: (username: string) =>
    api.get<{ available: boolean }>(
      `/users/check-username?username=${encodeURIComponent(username)}`
    ),
  // Signup profile creation (Auth account already exists).
  createProfile: (data: {
    username: string;
    displayName: string;
    birthDate: string;
  }) => api.post<any>('/users', data),
  patchMe: (data: Record<string, unknown>) =>
    api.patch<void>('/users/me', data),
  // Server-authoritative daily points claim (cooldown + 25/day cap).
  claimDaily: () =>
    api.post<{
      claimed: boolean;
      awarded: number;
      nextAvailableAt: number | null;
      user: any;
    }>('/users/me/claim-daily'),
  // Spend 150 points for a coupon-wheel spin (coupon stays client-managed).
  spin: () => api.post<{ ok: boolean; points: number }>('/users/me/spin'),
  sendWelcomeEmail: () => api.post<{ success: boolean }>('/users/me/welcome-email'),
  deleteMe: () => api.del<{ deletedUid: string }>('/users/me'),

  addFcmToken: (token: string) =>
    api.post<void>('/users/me/fcm-tokens', { token }),
  removeFcmToken: (token: string) =>
    api.del<void>(`/users/me/fcm-tokens/${encodeURIComponent(token)}`),
  addToLibrary: (bookId: string) =>
    api.post<void>('/users/me/library', { bookId }),
  removeFromLibrary: (bookId: string) =>
    api.del<void>(`/users/me/library/${encodeURIComponent(bookId)}`),
  getPurchases: () => api.get<any[]>('/users/me/purchases'),
};
