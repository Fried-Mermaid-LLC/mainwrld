import * as iap from '@/services/iap';
import { paymentsApi, type AccountStatus } from '@/services/api/paymentsApi';

export type { AccountStatus };

// Opens a Stripe-hosted URL (onboarding / checkout / dashboard). On iOS, open in
// an in-app browser; on web, navigate the tab.
export const openStripeUrl = async (url: string): Promise<void> => {
  if (iap.isNativeIAPAvailable()) {
    const { Browser } = await import('@capacitor/browser');
    await Browser.open({ url });
    return;
  }
  window.location.href = url;
};

// Stripe Connect mode is explicit (VITE_STRIPE_MODE), defaulting to test so
// device/dev testing is safe. The mode + origin are forwarded to the API which
// picks the matching key and builds correct return/success URLs.
const MODE: 'live' | 'test' =
  import.meta.env.VITE_STRIPE_MODE === 'live' ? 'live' : 'test';
const origin = () =>
  typeof window !== 'undefined' ? window.location.origin : '';

export const createOnboardingLink = (): Promise<{ url: string }> =>
  paymentsApi.createAccountLink(MODE, origin());

export const getAccountStatus = (): Promise<AccountStatus> =>
  paymentsApi.syncAccountStatus(MODE);

export const getDashboardLink = (): Promise<{ url: string }> =>
  paymentsApi.createDashboardLink(MODE);

export const getBalance = (): Promise<{
  availableUsd: number;
  pendingUsd: number;
}> => paymentsApi.getSellerBalance(MODE);

export const submitMonetizationRequest = (
  bookId: string,
  priceUsd: number
): Promise<{ ok: boolean }> =>
  paymentsApi.submitMonetization(bookId, priceUsd);

export const reviewMonetization = (
  bookId: string,
  decision: 'approve' | 'deny',
  reason?: string
): Promise<{ ok: boolean }> =>
  paymentsApi.reviewMonetization(bookId, decision, reason);

export const cancelMembership = (): Promise<{
  ok: boolean;
  cancelAtPeriodEnd: boolean;
}> => paymentsApi.cancelMembership(MODE);

// Cash purchase — the only way to buy a book. On iOS the return deep-links back
// into the app (nativeReturn) so the server points success/cancel at the bounce page.
export const createBookCheckout = (
  bookId: string,
  couponId?: string
): Promise<{ url: string }> =>
  paymentsApi.createBookCheckout({
    bookId,
    mode: MODE,
    origin: origin(),
    couponId,
    nativeReturn: iap.isNativeIAPAvailable(),
  });
