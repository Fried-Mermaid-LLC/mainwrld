import {
  bookPurchaseEmail,
  couponPurchaseEmail,
  emailLayout,
  escapeHtml,
  membershipWelcomeEmail,
  passwordResetEmail,
  pointsPurchaseEmail,
  renewalReminderEmail,
  welcomeEmail,
} from './email.templates';

describe('email.templates', () => {
  it('escapes HTML special chars', () => {
    expect(escapeHtml('<script>"&"</script>')).toBe(
      '&lt;script&gt;&quot;&amp;&quot;&lt;/script&gt;',
    );
  });

  it('emailLayout renders heading + body + optional cta', () => {
    const html = emailLayout({
      heading: 'Hi',
      bodyHtml: '<p>body</p>',
      cta: { label: 'Go', url: 'https://x.test' },
    });
    expect(html).toContain('Hi');
    expect(html).toContain('<p>body</p>');
    expect(html).toContain('https://x.test');
    expect(html).toContain('<!DOCTYPE html>');
  });

  it('welcomeEmail includes the username and escapes the display name', () => {
    const m = welcomeEmail('<b>Bob</b>', 'bob');
    expect(m.subject).toContain('Bob');
    expect(m.html).toContain('@bob');
    expect(m.html).toContain('&lt;b&gt;Bob&lt;/b&gt;');
  });

  it('purchase templates surface the amounts', () => {
    expect(pointsPurchaseEmail('Al', 300).html).toContain('300 points');
    expect(couponPurchaseEmail('Al', 5).html).toContain('$5');
    expect(bookPurchaseEmail('Al', 'My Book').html).toContain('My Book');
    expect(membershipWelcomeEmail('Al').subject).toContain('member');
    expect(renewalReminderEmail('Al', 'July 1, 2026').html).toContain(
      'July 1, 2026',
    );
  });

  it('passwordResetEmail embeds the reset link', () => {
    const m = passwordResetEmail('https://reset.link/oob');
    expect(m.html).toContain('https://reset.link/oob');
  });
});
