import { StripeService } from './stripe.service';
import { fakeConfig } from '../../testing/test-utils';

describe('StripeService', () => {
  it('forMode returns a client in test and live modes', () => {
    const svc = new StripeService(fakeConfig() as any);
    expect(svc.forMode('test')).toBeDefined();
    expect(svc.forMode('live')).toBeDefined();
  });

  it('forMode throws when the selected key is missing', () => {
    const svc = new StripeService(
      fakeConfig({ secrets: { stripeTestSecretKey: '' } }) as any,
    );
    expect(() => svc.forMode('test')).toThrow('not configured');
  });

  it('optional returns null when the key is missing (no throw)', () => {
    const svc = new StripeService(
      fakeConfig({ secrets: { stripeTestSecretKey: '' } }) as any,
    );
    expect(svc.optional('test')).toBeNull();
  });

  it('optional returns a client when configured', () => {
    const svc = new StripeService(fakeConfig() as any);
    expect(svc.optional('test')).not.toBeNull();
  });
});
