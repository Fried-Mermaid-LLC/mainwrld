import {
  bookPurchaseEmail,
  couponPurchaseEmail,
  escapeHtml,
  membershipWelcomeEmail,
  monetizationApprovedEmail,
  monetizationDeniedEmail,
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

  it('welcomeEmail includes the username and escapes the display name', () => {
    const m = welcomeEmail('<b>Bob</b>', 'bob');
    expect(m.subject).toContain('Bob');
    expect(m.html).toContain('@bob');
    // React auto-escapes interpolated text, so the raw tags never reach the DOM.
    expect(m.html).toContain('&lt;b&gt;Bob&lt;/b&gt;');
    expect(m.html).not.toContain('<b>Bob</b>');
    expect(m.html).toContain('<!DOCTYPE html');
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

  it('monetization templates surface the book title and reason', () => {
    const approved = monetizationApprovedEmail('Al', 'My Book');
    expect(approved.subject).toContain('accepted');
    expect(approved.html).toContain('My Book');

    const denied = monetizationDeniedEmail('Al', 'My Book', 'policy review');
    expect(denied.subject).toContain('denied');
    expect(denied.html).toContain('policy review');
  });

  it('passwordResetEmail embeds the reset link', () => {
    const m = passwordResetEmail('https://reset.link/oob');
    expect(m.html).toContain('https://reset.link/oob');
  });
});
