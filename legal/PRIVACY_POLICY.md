# MainWRLD Privacy Policy

_Last updated: TBD — fill in before publishing._

This is a working template. Items in **{{curly braces}}** must be
filled by the client (Mocha Mattel) before this policy is published.
The substantive sections describe what the app actually collects and
why — those should remain factual. The brand-specific bits are placeholders.

App Store reviewers will read this page; the App Privacy Nutrition
Label set in App Store Connect must agree with what is declared
here. Keep them in sync.

---

## 1. Who we are

MainWRLD ("we", "us") is operated by **{{Mocha Mattel — legal entity
or trading name}}**. You can reach us at **{{support@mainwrld.com}}**.

## 2. What this policy covers

This policy describes the personal information collected, used, and
shared when you use the MainWRLD mobile app and the related website
at https://mainwrld.com.

## 3. Information we collect

**You provide us with:**

- **Email address** — used for sign-in and password reset.
- **Username** — public identifier inside MainWRLD.
- **Display name** — public.
- **Date of birth** — used to restrict explicit content for users
  under 16 and to confirm the user is old enough to use the service.
  Not displayed to other users.
- **Password** — handled by Firebase Authentication and never stored
  in our own systems in cleartext.
- **Content you create** — books, chapters, comments, chat messages,
  reports, avatar customization. Stored in Firestore.
- **Reports of other users' content** — recorded for moderation.

**Collected automatically:**

- Firebase generates a per-user identifier (Firebase UID) we use to
  link your account record to your data.

**We do NOT collect:**

- Location (GPS, IP-based, or otherwise).
- Photographs or camera access.
- Contact list, calendar, or other device data.
- Third-party advertising identifiers.

## 4. How we use information

Strictly to operate the service:
- Authenticate you;
- Show your content to other users where you have chosen it should
  be visible;
- Apply our community guidelines and respond to reports;
- Communicate with you about your account (welcome email via Resend
  on first sign-up; password reset emails via Firebase).

We do not use your information for advertising, analytics, profiling,
or any third-party purpose.

## 5. Who we share information with

- **Firebase (Google)** — backend storage and authentication. Google
  acts as a data processor on our behalf.
- **Stripe (web version only)** — payment processing for the web.
  On iOS all in-app purchases go through Apple's In-App Purchase and
  Stripe is not invoked. Stripe receives only the data required to
  complete a transaction.
- **Resend** — to send the welcome email after sign-up.
- **OpenAI Moderation API** — content of public comments and book
  chapters is sent to OpenAI's moderation endpoint to detect
  prohibited content. OpenAI does not store this content per its
  terms.
- **Apple** — receipt verification for In-App Purchases.

We do not sell personal information to third parties.

## 6. Data retention

- **Account data** — kept while your account is active.
- **Content you have published** — kept while your account is
  active.
- **Account deletion** — when you delete your account in
  Settings → "Permanently Delete Account", your profile, books,
  comments, chats, relationships, notifications, and authored
  reports are removed within 30 days. The Firebase Auth record is
  deleted immediately.
- **Backups** — operational backups retained for up to 90 days for
  disaster recovery; deleted data is purged from backups within
  that window.

## 7. Your rights

You can:
- Access — request a copy of your data at **{{support@mainwrld.com}}**.
- Correct — edit profile fields directly inside the app, or contact
  support for fields not editable in-app.
- Delete — use Settings → "Permanently Delete Account" inside the
  app, or contact support.
- Object/restrict processing — contact support.

If you are in the EU/UK, you have additional rights under GDPR
including the right to lodge a complaint with your local data
protection authority. The data controller is **{{Mocha Mattel — legal
entity}}**.

If you are in California, you have rights under the CCPA including
the right to know and the right to delete; instructions above apply.

## 8. Children

MainWRLD is not directed to children under 13. If you are between
13 and 16 (or the age of digital consent in your country) you may
register, but explicit content (books marked as such by their authors)
is hidden from your account.

If a parent or guardian believes a child under 13 has registered,
please contact **{{support@mainwrld.com}}** and we will delete the
account.

## 9. Security

Data in transit is protected by TLS. Data at rest is encrypted by
the underlying Firebase infrastructure. Passwords are stored hashed
by Firebase Authentication and we never see them in cleartext.

## 10. Changes to this policy

Material changes will be announced inside the app at least 7 days
before they take effect.

## 11. Contact

Questions? Email **{{support@mainwrld.com}}**.
