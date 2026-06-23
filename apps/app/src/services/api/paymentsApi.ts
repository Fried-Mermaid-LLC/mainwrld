import { api } from '@/lib/apiClient';

export interface AccountStatus {
  stripeAccountId?: string;
  payoutsEnabled: boolean;
  chargesEnabled: boolean;
  detailsSubmitted: boolean;
}

export const paymentsApi = {
  // ---- Stripe Connect (seller) ----
  createAccountLink: (mode?: string, origin?: string) =>
    api.post<{ url: string }>('/payments/stripe/account-link', { mode, origin }),
  syncAccountStatus: (mode?: string) =>
    api.get<AccountStatus>(
      `/payments/stripe/account-status${mode ? `?mode=${mode}` : ''}`
    ),
  createDashboardLink: (mode?: string) =>
    api.post<{ url: string }>('/payments/stripe/dashboard-link', { mode }),
  getSellerBalance: (mode?: string) =>
    api.get<{ availableUsd: number; pendingUsd: number }>(
      `/payments/stripe/balance${mode ? `?mode=${mode}` : ''}`
    ),

  // ---- Monetization lifecycle ----
  submitMonetization: (bookId: string, priceUsd: number) =>
    api.post<{ ok: boolean }>('/payments/monetization/requests', {
      bookId,
      priceUsd,
    }),
  reviewMonetization: (
    bookId: string,
    decision: 'approve' | 'deny',
    reason?: string
  ) =>
    api.post<{ ok: boolean }>(
      `/payments/monetization/${encodeURIComponent(bookId)}/review`,
      { decision, reason }
    ),

  // ---- Reader cash checkout ----
  createBookCheckout: (params: {
    bookId: string;
    mode?: string;
    origin?: string;
    couponId?: string;
    nativeReturn?: boolean;
  }) => api.post<{ url: string }>('/payments/stripe/book-checkout', params),

  // ---- Membership ----
  cancelMembership: (mode?: string) =>
    api.post<{ ok: boolean; cancelAtPeriodEnd: boolean }>(
      '/membership/cancel',
      { mode }
    ),

  // ---- Apple IAP ----
  verifyAppleReceipt: (params: {
    productId: string;
    transactionId: string;
    appStoreReceipt?: string;
  }) =>
    api.post<{
      credited: boolean;
      pointsAdded?: number;
      isPremium?: boolean;
      couponAdded?: { id: string; value: number; used: boolean };
    }>('/iap/verify-apple', params),
};
