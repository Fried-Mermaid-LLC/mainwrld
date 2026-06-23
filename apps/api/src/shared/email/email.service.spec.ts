import { EmailService } from './email.service';
import { FakeFirestore, fakeConfig } from '../../testing/test-utils';

describe('EmailService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('skips send when no Resend key is configured', async () => {
    const svc = new EmailService(
      fakeConfig() as any,
      new FakeFirestore() as any,
    );
    const res = await svc.send('to@test.com', 'sub', '<p>x</p>');
    expect(res.ok).toBe(false);
  });

  it('posts to Resend when a key is set', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue({ ok: true, status: 200 });
    global.fetch = fetchMock as any;
    const svc = new EmailService(
      fakeConfig({ secrets: { resendApiKey: 're_x' } }) as any,
      new FakeFirestore() as any,
    );
    const res = await svc.send('to@test.com', 'sub', '<p>x</p>');
    expect(res.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('returns ok:false on a non-2xx Resend response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 422,
      text: async () => 'bad',
    }) as any;
    const svc = new EmailService(
      fakeConfig({ secrets: { resendApiKey: 're_x' } }) as any,
      new FakeFirestore() as any,
    );
    const res = await svc.send('to@test.com', 'sub', '<p>x</p>');
    expect(res.ok).toBe(false);
    expect(res.status).toBe(422);
  });

  it('userContact resolves from the users doc', async () => {
    const fs = new FakeFirestore();
    fs.seed('users/u1', { email: 'a@b.com', displayName: 'Al', username: 'al' });
    const svc = new EmailService(fakeConfig() as any, fs as any);
    expect(await svc.userContact('u1')).toEqual({
      email: 'a@b.com',
      displayName: 'Al',
      username: 'al',
    });
  });

  it('userContact falls back for a missing uid', async () => {
    const svc = new EmailService(
      fakeConfig() as any,
      new FakeFirestore() as any,
    );
    expect(await svc.userContact(null)).toEqual({
      email: null,
      displayName: 'there',
      username: '',
    });
  });
});
