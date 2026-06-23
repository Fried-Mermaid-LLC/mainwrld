import { MembershipService } from './membership.service';
import { FakeFirestore } from '../../testing/test-utils';

describe('MembershipService', () => {
  let fs: FakeFirestore;
  let stripe: { optional: jest.Mock };
  let svc: MembershipService;

  beforeEach(() => {
    fs = new FakeFirestore();
    stripe = {
      optional: jest.fn(() => ({
        subscriptions: {
          update: jest.fn(async () => ({ cancel_at_period_end: true })),
        },
      })),
    };
    svc = new MembershipService(fs as any, stripe as any);
  });

  it('rejects when there is no active membership', async () => {
    fs.seed('users/u1', { isPremium: false });
    await expect(svc.cancel('u1')).rejects.toThrow('active membership');
  });

  it('rejects an Apple-managed subscription', async () => {
    fs.seed('users/u1', { isPremium: true, premiumProvider: 'apple' });
    await expect(svc.cancel('u1')).rejects.toThrow('App Store');
  });

  it('rejects when the user is missing', async () => {
    await expect(svc.cancel('nope')).rejects.toThrow('not found');
  });

  it('sets cancel_at_period_end on Stripe and records the cancel intent', async () => {
    fs.seed('users/u1', {
      isPremium: true,
      premiumProvider: 'stripe',
      stripeSubscriptionId: 'sub_1',
    });
    const res = await svc.cancel('u1', 'test');
    expect(res.ok).toBe(true);
    expect(res.cancelAtPeriodEnd).toBe(true);
    const u = fs.dump('users/u1')!;
    expect(u.membershipAutoRenew).toBe(false);
    expect(u.premiumCancelAtPeriodEnd).toBe(true);
    expect(u.membershipCancelledAt).toBeDefined();
  });

  it('still records intent when there is no subscription id', async () => {
    fs.seed('users/u1', { isPremium: true, premiumProvider: 'stripe' });
    const res = await svc.cancel('u1');
    expect(res.ok).toBe(true);
    expect(res.cancelAtPeriodEnd).toBe(false);
    expect(fs.dump('users/u1')!.membershipAutoRenew).toBe(false);
  });
});
