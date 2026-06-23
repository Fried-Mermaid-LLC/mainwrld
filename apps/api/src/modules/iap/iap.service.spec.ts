// Mock the Apple App Store Server library. getTransactionInfo always returns a
// signed blob; verifyAndDecodeTransaction returns a payload the test controls
// via `decodedPayload`. ProductType.AUTO_RENEWABLE is re-exported for the
// subscription-expiry gate.
const getTransactionInfo = jest.fn(async () => ({ signedTransactionInfo: 'x' }));
let decodedPayload: Record<string, unknown>;
const verifyAndDecodeTransaction = jest.fn(async () => decodedPayload);

jest.mock('@apple/app-store-server-library', () => ({
  AppStoreServerAPIClient: jest.fn().mockImplementation(() => ({
    getTransactionInfo,
  })),
  SignedDataVerifier: jest.fn().mockImplementation(() => ({
    verifyAndDecodeTransaction,
  })),
  Environment: { PRODUCTION: 'Production', SANDBOX: 'Sandbox' },
  ProductType: { AUTO_RENEWABLE: 'AUTO_RENEWABLE' },
}));

import { IapService } from './iap.service';
import {
  FakeFirestore,
  createFakeEmail,
  fakeConfig,
  makeAuthUser,
} from '../../testing/test-utils';

describe('IapService', () => {
  let fs: FakeFirestore;
  let email: ReturnType<typeof createFakeEmail>;
  let svc: IapService;

  const buildPayload = (over: Record<string, unknown> = {}) => ({
    transactionId: 'tx1',
    productId: 'mainwrld.points_100',
    bundleId: 'com.mainwrld',
    ...over,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    fs = new FakeFirestore();
    fs.seed('users/u1', { points: 50 });
    email = createFakeEmail();
    svc = new IapService(fakeConfig() as any, fs as any, email as any);
    decodedPayload = buildPayload();
  });

  describe('happy paths', () => {
    it('credits points and writes the iapTransactions doc', async () => {
      decodedPayload = buildPayload({ productId: 'mainwrld.points_300' });
      const res = await svc.verifyApple(
        makeAuthUser(),
        'mainwrld.points_300',
        'tx1',
      );
      expect(res).toEqual({ credited: true, pointsAdded: 300 });

      // points incremented from the seeded 50.
      expect(fs.dump('users/u1')!.points).toBe(350);

      const tx = fs.dump('iapTransactions/tx1')!;
      expect(tx).toMatchObject({
        uid: 'u1',
        productId: 'mainwrld.points_300',
        transactionId: 'tx1',
        pointsAdded: 300,
        isPremium: false,
        couponValue: 0,
        env: 'Sandbox',
      });

      expect(email.send).toHaveBeenCalledTimes(1);
    });

    it('grants premium and stamps premium fields', async () => {
      decodedPayload = buildPayload({
        productId: 'mainwrld.premium_yearly',
        productType: 'AUTO_RENEWABLE',
        expiresDate: Date.now() + 365 * 864e5,
      });
      const res = await svc.verifyApple(
        makeAuthUser(),
        'mainwrld.premium_yearly',
        'tx1',
      );
      expect(res).toMatchObject({ credited: true, isPremium: true });

      const u = fs.dump('users/u1')!;
      expect(u.isPremium).toBe(true);
      expect(u.premiumProvider).toBe('apple');
      expect(u.premiumCancelAtPeriodEnd).toBe(false);
      expect(typeof u.premiumRenewalAt).toBe('number');

      const tx = fs.dump('iapTransactions/tx1')!;
      expect(tx.isPremium).toBe(true);
      expect(email.send).toHaveBeenCalledTimes(1);
    });

    it('adds a coupon via arrayUnion', async () => {
      decodedPayload = buildPayload({ productId: 'mainwrld.coupon_500' });
      const res = await svc.verifyApple(
        makeAuthUser(),
        'mainwrld.coupon_500',
        'tx1',
      );
      expect(res).toEqual({
        credited: true,
        couponAdded: { id: 'buy_tx1', value: 5, used: false },
      });

      const u = fs.dump('users/u1')!;
      expect(u.coupons).toContainEqual({ id: 'buy_tx1', value: 5, used: false });

      const tx = fs.dump('iapTransactions/tx1')!;
      expect(tx.couponValue).toBe(5);
      expect(email.send).toHaveBeenCalledTimes(1);
    });
  });

  describe('replay / idempotency', () => {
    it('returns {credited:true,pointsAdded:0} without re-crediting or emailing', async () => {
      // Pre-existing transaction doc => replay.
      fs.seed('iapTransactions/tx1', {
        uid: 'u1',
        productId: 'mainwrld.points_100',
        transactionId: 'tx1',
        pointsAdded: 100,
      });

      const res = await svc.verifyApple(
        makeAuthUser(),
        'mainwrld.points_100',
        'tx1',
      );
      expect(res).toEqual({ credited: true, pointsAdded: 0 });

      // Points untouched (still the seeded 50), no email.
      expect(fs.dump('users/u1')!.points).toBe(50);
      expect(email.send).not.toHaveBeenCalled();
    });
  });

  describe('sanity-check rejections', () => {
    it('rejects a transactionId mismatch with permission-denied', async () => {
      decodedPayload = buildPayload({ transactionId: 'other' });
      await expect(
        svc.verifyApple(makeAuthUser(), 'mainwrld.points_100', 'tx1'),
      ).rejects.toThrow('Transaction ID mismatch.');
      expect(fs.dump('iapTransactions/tx1')).toBeUndefined();
    });

    it('rejects a productId mismatch with permission-denied', async () => {
      decodedPayload = buildPayload({ productId: 'mainwrld.points_999' });
      await expect(
        svc.verifyApple(makeAuthUser(), 'mainwrld.points_100', 'tx1'),
      ).rejects.toThrow('Product ID mismatch.');
    });

    it('rejects a bundleId mismatch with permission-denied', async () => {
      decodedPayload = buildPayload({ bundleId: 'com.evil' });
      await expect(
        svc.verifyApple(makeAuthUser(), 'mainwrld.points_100', 'tx1'),
      ).rejects.toThrow('Bundle ID mismatch.');
    });
  });

  describe('subscription expiry gate', () => {
    it('returns {credited:false} for an expired AUTO_RENEWABLE and writes nothing', async () => {
      decodedPayload = buildPayload({
        productId: 'mainwrld.premium_yearly',
        productType: 'AUTO_RENEWABLE',
        expiresDate: Date.now() - 1000,
      });
      const res = await svc.verifyApple(
        makeAuthUser(),
        'mainwrld.premium_yearly',
        'tx1',
      );
      expect(res).toEqual({ credited: false });

      // No transaction recorded, no premium granted, no email.
      expect(fs.dump('iapTransactions/tx1')).toBeUndefined();
      expect(fs.dump('users/u1')!.isPremium).toBeUndefined();
      expect(email.send).not.toHaveBeenCalled();
    });
  });

  describe('precondition / input guards', () => {
    it('throws failed-precondition when Apple creds are missing', async () => {
      const cfg = fakeConfig({
        secrets: {
          apple: {
            issuerId: '',
            keyId: '',
            bundleId: '',
            privateKey: '',
            env: 'Sandbox',
          },
        },
      });
      const noCreds = new IapService(cfg as any, fs as any, email as any);
      await expect(
        noCreds.verifyApple(makeAuthUser(), 'mainwrld.points_100', 'tx1'),
      ).rejects.toThrow('Apple credentials are not configured.');
    });

    it('rejects missing productId / transactionId', async () => {
      await expect(
        svc.verifyApple(makeAuthUser(), '', 'tx1'),
      ).rejects.toThrow('productId and transactionId required.');
      await expect(
        svc.verifyApple(makeAuthUser(), 'mainwrld.points_100', ''),
      ).rejects.toThrow('productId and transactionId required.');
    });
  });
});
