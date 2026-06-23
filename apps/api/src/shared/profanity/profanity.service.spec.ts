import { ProfanityService } from './profanity.service';

describe('ProfanityService', () => {
  const svc = new ProfanityService();

  it('flags obvious profanity', () => {
    expect(svc.contains('you absolute shithead')).toBe(true);
  });

  it('passes clean text', () => {
    expect(svc.contains('a perfectly normal sentence')).toBe(false);
  });

  it('treats empty/nullish as clean', () => {
    expect(svc.contains('')).toBe(false);
    expect(svc.contains(null)).toBe(false);
    expect(svc.contains(undefined)).toBe(false);
  });

  it('does not false-positive on the Scunthorpe problem', () => {
    expect(svc.contains('I live in Scunthorpe')).toBe(false);
  });
});
