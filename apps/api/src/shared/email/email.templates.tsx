// Branded, email-client-safe MainWRLD templates authored as React Email
// components and rendered to HTML for Resend. The visual design mirrors
// local/email-template.html (gradient header, rounded white card, feature
// grid, roadmap pills, social row, dark footer).
//
// Each builder returns a BuiltEmail { subject, html } — the html is produced
// by rendering the React tree synchronously (see renderEmail below) so
// EmailService.send() can post it straight to the Resend API.

import {
  Body,
  Button,
  Column,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from '@react-email/components';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// React Email's async render() lazy-imports react-dom/server, which breaks
// under Jest's CJS VM. We render synchronously with React's own static
// renderer and prepend the XHTML doctype email clients expect — same output,
// no dynamic import, and the builders stay plain synchronous functions.
const DOCTYPE =
  '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">';

function renderEmail(element: React.ReactElement): string {
  return `${DOCTYPE}${renderToStaticMarkup(element)}`;
}

// Brand tokens (mirror local/email-template.html).
const ACCENT = '#de3fb6';
const GRADIENT_FROM = '#eb6871';
const GRADIENT_TO = '#de3fb6';
const BUTTON_BORDER = '#b20bbb';
const INK = '#333333';
const MUTED = '#666666';
const CANVAS = '#f9f9f9';
const CARD = '#ffffff';
const FOOTER_BG = '#1a1a1a';
const FOOTER_TEXT = '#888888';

const SITE_URL = 'https://mainwrld.com';
const LOGO_URL = `${SITE_URL}/logo.png`;

const SOCIALS: { href: string; img: string; alt: string }[] = [
  {
    href: 'https://instagram.com/mainwrldapp',
    img: `${SITE_URL}/images/instagram.png`,
    alt: 'Instagram',
  },
  {
    href: 'https://youtube.com/@mainwrld',
    img: `${SITE_URL}/images/youtube.png`,
    alt: 'YouTube',
  },
  {
    href: 'https://tiktok.com/@mainwrld',
    img: `${SITE_URL}/images/tiktok.png`,
    alt: 'TikTok',
  },
];

// React auto-escapes any text rendered through JSX, so user-supplied values
// (display names, book titles, denial reasons) are safe by construction.
// Exported for callers that still build raw HTML fragments outside React.
export const escapeHtml = (s: string): string =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export interface BuiltEmail {
  subject: string;
  html: string;
}

interface Cta {
  label: string;
  url: string;
}

interface LayoutProps {
  preheader: string;
  heading: string;
  cta?: Cta;
  footnote?: string;
  children: React.ReactNode;
}

// --- shared styles -----------------------------------------------------------

const bodyStyle: React.CSSProperties = {
  backgroundColor: CANVAS,
  fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
  margin: 0,
  padding: 0,
};

const containerStyle: React.CSSProperties = {
  maxWidth: '600px',
  margin: '20px auto',
  backgroundColor: CARD,
  borderRadius: '16px',
  overflow: 'hidden',
  boxShadow: '0 4px 20px rgba(0,0,0,0.05)',
};

const headerStyle: React.CSSProperties = {
  backgroundColor: GRADIENT_TO,
  backgroundImage: `linear-gradient(135deg, ${GRADIENT_FROM} 0%, ${GRADIENT_TO} 100%)`,
  padding: '40px 20px',
  textAlign: 'center',
  color: '#ffffff',
};

const h1Style: React.CSSProperties = {
  margin: 0,
  fontSize: '28px',
  fontWeight: 800,
  letterSpacing: '-0.5px',
  color: '#ffffff',
  lineHeight: 1.2,
};

const contentStyle: React.CSSProperties = {
  padding: '40px',
  color: INK,
  lineHeight: 1.6,
  fontSize: '15px',
};

const paragraphStyle: React.CSSProperties = {
  margin: '0 0 14px',
  fontSize: '15px',
  lineHeight: 1.6,
  color: INK,
};

const buttonStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '14px 30px',
  backgroundColor: '#ffffff',
  color: ACCENT,
  textDecoration: 'none',
  borderRadius: '8px',
  fontWeight: 700,
  border: `2px solid ${BUTTON_BORDER}`,
  boxSizing: 'border-box',
};

const footnoteStyle: React.CSSProperties = {
  margin: '18px 0 0',
  fontSize: '12px',
  lineHeight: 1.6,
  color: MUTED,
};

const footerStyle: React.CSSProperties = {
  backgroundColor: FOOTER_BG,
  padding: '30px',
  textAlign: 'center',
};

const footerTextStyle: React.CSSProperties = {
  margin: 0,
  color: FOOTER_TEXT,
  fontSize: '12px',
};

// --- reusable pieces ---------------------------------------------------------

function Paragraph({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return <Text style={paragraphStyle}>{children}</Text>;
}

function SocialRow(): React.JSX.Element {
  return (
    <Section style={{ marginTop: '25px', textAlign: 'center' }}>
      {SOCIALS.map((s) => (
        <Link
          key={s.alt}
          href={s.href}
          style={{ margin: '0 8px', textDecoration: 'none' }}
        >
          <Img
            src={s.img}
            width="24"
            height="24"
            alt={s.alt}
            style={{ display: 'inline-block', border: 0 }}
          />
        </Link>
      ))}
    </Section>
  );
}

// Welcome-only colored feature grid (two rows of two cards).
function FeatureGrid(): React.JSX.Element {
  const cell: React.CSSProperties = {
    padding: '20px',
    borderRadius: '16px',
    color: '#ffffff',
    fontWeight: 'bold',
    textAlign: 'center',
  };
  return (
    <Section style={{ margin: '30px 0' }}>
      <Row>
        <Column style={{ padding: '0 8px 16px 0', width: '50%' }}>
          <div style={{ ...cell, backgroundColor: '#aa54d5' }}>
            Connect with Mutuals
          </div>
        </Column>
        <Column style={{ padding: '0 0 16px 8px', width: '50%' }}>
          <div style={{ ...cell, backgroundColor: '#de3fb6' }}>
            Discover new books
          </div>
        </Column>
      </Row>
      <Row>
        <Column style={{ padding: '0 8px 0 0', width: '50%' }}>
          <div style={{ ...cell, backgroundColor: '#feb758' }}>
            Support creatives
          </div>
        </Column>
        <Column style={{ padding: '0 0 0 8px', width: '50%' }}>
          <div style={{ ...cell, backgroundColor: '#eb6871' }}>
            Write a masterpiece
          </div>
        </Column>
      </Row>
    </Section>
  );
}

// Welcome-only "coming soon" roadmap card with pills.
function Roadmap(): React.JSX.Element {
  const pill: React.CSSProperties = {
    display: 'inline-block',
    padding: '6px 14px',
    borderRadius: '16px',
    fontSize: '12px',
    fontWeight: 700,
    color: '#ffffff',
    backgroundColor: '#616161',
    margin: '4px 2px',
    textDecoration: 'none',
  };
  return (
    <Section
      style={{
        backgroundColor: '#f8f8f8',
        border: '1px solid #eeeeee',
        padding: '25px',
        borderRadius: '16px',
        marginTop: '30px',
      }}
    >
      <Text
        style={{
          fontWeight: 700,
          fontSize: '10px',
          textTransform: 'uppercase',
          letterSpacing: '1px',
          color: '#999999',
          margin: '0 0 10px',
        }}
      >
        And this is just the beginning…
      </Text>
      <Text style={{ fontSize: '14px', margin: '0 0 15px', color: MUTED }}>
        Many cool features are coming soon like:
      </Text>
      <div style={{ lineHeight: '30px' }}>
        <span style={pill}>More Customization</span>
        <span style={pill}>Book Contests</span>
      </div>
    </Section>
  );
}

// --- layout shell ------------------------------------------------------------

function Layout({
  preheader,
  heading,
  cta,
  footnote,
  children,
}: LayoutProps): React.JSX.Element {
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Body style={bodyStyle}>
        <Preview>{preheader}</Preview>
        <Container style={containerStyle}>
          <Section style={headerStyle}>
            <Img
              src={LOGO_URL}
              alt="MainWRLD"
              width="120"
              style={{ display: 'block', margin: '0 auto 20px', border: 0 }}
            />
            <Heading as="h1" style={h1Style}>
              {heading}
            </Heading>
          </Section>
          <Section style={contentStyle}>
            {children}
            {cta ? (
              <Section style={{ textAlign: 'center', marginTop: '30px' }}>
                <Button href={cta.url} style={buttonStyle}>
                  {cta.label}
                </Button>
              </Section>
            ) : null}
            {footnote ? <Text style={footnoteStyle}>{footnote}</Text> : null}
            <SocialRow />
          </Section>
          <Section style={footerStyle}>
            <Text style={footerTextStyle}>
              &copy; 2026 MainWRLD. All rights reserved.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

// --- email components --------------------------------------------------------

function MembershipWelcome({
  displayName,
}: {
  displayName: string;
}): React.JSX.Element {
  return (
    <Layout
      preheader="Your MainWRLD+ membership is active. Here’s what you unlocked."
      heading="Welcome to MainWRLD+"
      cta={{ label: 'Open MainWRLD', url: SITE_URL }}
    >
      <Paragraph>Hi {displayName},</Paragraph>
      <Paragraph>
        Thank you for becoming a <strong>MainWRLD+</strong> member — your
        support keeps creators writing and the worlds growing.
      </Paragraph>
      <Paragraph>
        Your member perks are active on your account right now. Enjoy!
      </Paragraph>
    </Layout>
  );
}

function PointsPurchase({
  displayName,
  points,
}: {
  displayName: string;
  points: number;
}): React.JSX.Element {
  return (
    <Layout
      preheader={`${points} points have been added to your account.`}
      heading="Thanks for your purchase"
      cta={{ label: 'Go to MainWRLD', url: SITE_URL }}
    >
      <Paragraph>Hi {displayName},</Paragraph>
      <Paragraph>
        We've added <strong>{points} points</strong> to your MainWRLD account.
      </Paragraph>
      <Paragraph>Spend them on books, coupons, and more.</Paragraph>
    </Layout>
  );
}

function CouponPurchase({
  displayName,
  value,
}: {
  displayName: string;
  value: number;
}): React.JSX.Element {
  return (
    <Layout
      preheader={`Your $${value} coupon is ready to use.`}
      heading="Thanks for your purchase"
      cta={{ label: 'Go to MainWRLD', url: SITE_URL }}
    >
      <Paragraph>Hi {displayName},</Paragraph>
      <Paragraph>
        Your <strong>${value} coupon</strong> has been added to your account.
      </Paragraph>
      <Paragraph>Apply it at checkout the next time you buy a book.</Paragraph>
    </Layout>
  );
}

function BookPurchase({
  displayName,
  bookTitle,
}: {
  displayName: string;
  bookTitle: string;
}): React.JSX.Element {
  return (
    <Layout
      preheader={`"${bookTitle}" is now permanently in your library.`}
      heading="Thanks for your purchase"
      cta={{ label: 'Start reading', url: SITE_URL }}
    >
      <Paragraph>Hi {displayName},</Paragraph>
      <Paragraph>
        You bought <strong>"{bookTitle}"</strong> — it's now permanently yours
        and will stay in your library even if you remove it.
      </Paragraph>
      <Paragraph>Happy reading!</Paragraph>
    </Layout>
  );
}

function Welcome({
  displayName,
  username,
}: {
  displayName: string;
  username: string;
}): React.JSX.Element {
  return (
    <Layout
      preheader="Your MainWRLD account is ready — jump in and start building."
      heading={`Welcome to MainWRLD, ${displayName}!`}
      cta={{ label: 'ENTER MAINWRLD', url: SITE_URL }}
    >
      <Paragraph>Hi {displayName},</Paragraph>
      <Paragraph>
        Your account is live and your username is <strong>@{username}</strong>.
      </Paragraph>
      <Paragraph>
        A brand NEW social book app where creatives have all the power. Read
        stories from creators everywhere, write your own, and build out your
        world — MainWRLD was made for real community building. You can:
      </Paragraph>
      <FeatureGrid />
      <Roadmap />
    </Layout>
  );
}

function PasswordReset({ link }: { link: string }): React.JSX.Element {
  return (
    <Layout
      preheader="Reset your MainWRLD password — this link expires soon."
      heading="Reset your password"
      cta={{ label: 'Reset password', url: link }}
      footnote="Didn't request this? You can safely ignore this email — your password won't change."
    >
      <Paragraph>
        We got a request to reset the password for your MainWRLD account.
      </Paragraph>
      <Paragraph>
        Tap the button below to choose a new password. For your security, this
        link expires after a short while.
      </Paragraph>
    </Layout>
  );
}

function RenewalReminder({
  displayName,
  renewalDateLabel,
}: {
  displayName: string;
  renewalDateLabel: string;
}): React.JSX.Element {
  return (
    <Layout
      preheader={`Your membership renews on ${renewalDateLabel}.`}
      heading="Your membership renews soon"
      cta={{ label: 'Manage membership', url: SITE_URL }}
    >
      <Paragraph>Hi {displayName},</Paragraph>
      <Paragraph>
        This is a friendly reminder that your <strong>MainWRLD+</strong>{' '}
        membership will renew on <strong>{renewalDateLabel}</strong> — about 7
        days from now.
      </Paragraph>
      <Paragraph>
        No action is needed to stay a member. If you'd like to make changes, you
        can manage your membership in Settings.
      </Paragraph>
    </Layout>
  );
}

function MonetizationApproved({
  displayName,
  bookTitle,
}: {
  displayName: string;
  bookTitle: string;
}): React.JSX.Element {
  return (
    <Layout
      preheader={`"${bookTitle}" is approved for sale on MainWRLD.`}
      heading="Your monetization request was accepted"
      cta={{ label: 'View your book', url: SITE_URL }}
    >
      <Paragraph>Hi {displayName},</Paragraph>
      <Paragraph>
        Good news — your request to monetize <strong>"{bookTitle}"</strong> has
        been accepted. Readers can now purchase it, and you'll earn 80% of every
        sale.
      </Paragraph>
      <Paragraph>
        You can track sales and payouts from your earnings settings.
      </Paragraph>
    </Layout>
  );
}

function MonetizationDenied({
  displayName,
  bookTitle,
  reason,
}: {
  displayName: string;
  bookTitle: string;
  reason: string;
}): React.JSX.Element {
  return (
    <Layout
      preheader={`An update on your request to monetize "${bookTitle}".`}
      heading="Your monetization request was denied"
      cta={{ label: 'Open MainWRLD', url: SITE_URL }}
    >
      <Paragraph>Hi {displayName},</Paragraph>
      <Paragraph>
        Your request to monetize <strong>"{bookTitle}"</strong> was denied
        because of: <strong>{reason}</strong>.
      </Paragraph>
      <Paragraph>
        If you think this was a mistake or you've addressed the issue, you may
        be able to submit again from the book's menu.
      </Paragraph>
    </Layout>
  );
}

// --- builders (render React -> HTML for Resend) ------------------------------

export function membershipWelcomeEmail(displayName: string): BuiltEmail {
  return {
    subject: 'Thank you for becoming a MainWRLD+ member',
    html: renderEmail(<MembershipWelcome displayName={displayName} />),
  };
}

export function pointsPurchaseEmail(
  displayName: string,
  points: number,
): BuiltEmail {
  return {
    subject: 'Thanks for your MainWRLD purchase',
    html: renderEmail(
      <PointsPurchase displayName={displayName} points={points} />,
    ),
  };
}

export function couponPurchaseEmail(
  displayName: string,
  value: number,
): BuiltEmail {
  return {
    subject: 'Thanks for your MainWRLD purchase',
    html: renderEmail(
      <CouponPurchase displayName={displayName} value={value} />,
    ),
  };
}

export function bookPurchaseEmail(
  displayName: string,
  bookTitle: string,
): BuiltEmail {
  return {
    subject: 'Thanks for your MainWRLD book purchase',
    html: renderEmail(
      <BookPurchase displayName={displayName} bookTitle={bookTitle} />,
    ),
  };
}

export function welcomeEmail(
  displayName: string,
  username: string,
): BuiltEmail {
  return {
    subject: `Welcome to MainWRLD, ${displayName}`,
    html: renderEmail(
      <Welcome displayName={displayName} username={username} />,
    ),
  };
}

// `link` is the Admin-SDK-minted reset action link (carries the oobCode the
// app's ResetPasswordView handles).
export function passwordResetEmail(link: string): BuiltEmail {
  return {
    subject: 'Reset your MainWRLD password',
    html: renderEmail(<PasswordReset link={link} />),
  };
}

export function renewalReminderEmail(
  displayName: string,
  renewalDateLabel: string,
): BuiltEmail {
  return {
    subject: 'Your MainWRLD+ membership renews in 7 days',
    html: renderEmail(
      <RenewalReminder
        displayName={displayName}
        renewalDateLabel={renewalDateLabel}
      />,
    ),
  };
}

export function monetizationApprovedEmail(
  displayName: string,
  bookTitle: string,
): BuiltEmail {
  return {
    subject: 'Your monetization request has been accepted',
    html: renderEmail(
      <MonetizationApproved displayName={displayName} bookTitle={bookTitle} />,
    ),
  };
}

export function monetizationDeniedEmail(
  displayName: string,
  bookTitle: string,
  reason: string,
): BuiltEmail {
  return {
    subject: 'Your monetization request has been denied',
    html: renderEmail(
      <MonetizationDenied
        displayName={displayName}
        bookTitle={bookTitle}
        reason={reason}
      />,
    ),
  };
}
