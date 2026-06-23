import { SchedulerJobsService } from './scheduler-jobs.service';
import { FakeFirestore, createFakeEmail } from '../../testing/test-utils';

describe('SchedulerJobsService', () => {
  let fs: FakeFirestore;
  let email: ReturnType<typeof createFakeEmail>;
  let spotlight: { rotate: jest.Mock };
  let svc: SchedulerJobsService;

  beforeEach(() => {
    fs = new FakeFirestore();
    email = createFakeEmail();
    spotlight = { rotate: jest.fn(async () => ({ ok: true, bookId: 'b1' })) };
    svc = new SchedulerJobsService(fs as any, spotlight as any, email as any);
  });

  it('rotateSpotlight delegates to SpotlightService', async () => {
    const res = await svc.rotateSpotlight();
    expect(spotlight.rotate).toHaveBeenCalled();
    expect(res.bookId).toBe('b1');
  });

  it('pruneExpiredMessages deletes only old non-member messages', async () => {
    const old = new Date(Date.now() - 400 * 864e5).toISOString();
    const recent = new Date().toISOString();
    fs.seed('chatMessages/m1', { senderIsPremium: false, timestamp: old });
    fs.seed('chatMessages/m2', { senderIsPremium: false, timestamp: recent });
    fs.seed('chatMessages/m3', { senderIsPremium: true, timestamp: old });
    const res = await svc.pruneExpiredMessages();
    expect(res.totalDeleted).toBe(1);
    expect(fs.dump('chatMessages/m1')).toBeUndefined();
    expect(fs.dump('chatMessages/m2')).toBeDefined();
    expect(fs.dump('chatMessages/m3')).toBeDefined();
  });

  it('sendRenewalReminders emails members in the 7-day window and stamps dedupe', async () => {
    const renewalAt = Date.now() + 6.5 * 864e5;
    fs.seed('users/u1', {
      isPremium: true,
      premiumRenewalAt: renewalAt,
      email: 'a@b.com',
      displayName: 'Al',
    });
    const res = await svc.sendRenewalReminders();
    expect(res.sent).toBe(1);
    expect(email.send).toHaveBeenCalled();
    expect(fs.dump('users/u1')!.renewalReminderSentForAt).toBe(renewalAt);
  });

  it('skips already-reminded and cancelled members', async () => {
    const renewalAt = Date.now() + 6.5 * 864e5;
    fs.seed('users/u1', {
      isPremium: true,
      premiumRenewalAt: renewalAt,
      renewalReminderSentForAt: renewalAt,
      email: 'a@b.com',
    });
    fs.seed('users/u2', {
      isPremium: true,
      premiumRenewalAt: renewalAt,
      premiumCancelAtPeriodEnd: true,
      email: 'c@d.com',
    });
    const res = await svc.sendRenewalReminders();
    expect(res.sent).toBe(0);
    expect(res.skipped).toBe(2);
    expect(email.send).not.toHaveBeenCalled();
  });
});
