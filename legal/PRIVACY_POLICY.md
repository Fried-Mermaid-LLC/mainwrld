# MainWRLD Privacy Policy

**Effective date / last updated: 2026-06-16**

This Privacy Policy explains how MainWRLD ("MainWRLD," the "App," "we," "us," or "our") collects, uses, shares, and protects information when you use the MainWRLD iOS application and the MainWRLD website. By creating an account or using MainWRLD, you agree to the practices described in this Privacy Policy.

## 1. Who We Are and How to Contact Us

MainWRLD is operated by **Fried Mermaid LLC**, the controller responsible for your personal data.

- **Legal entity:** Fried Mermaid LLC
- **Business address:** 418 Broadway Ste N, Albany, NY 12207-2922, United States
- **Contact for support, privacy questions, data-rights requests, and legal notices:** hello@mainwrld.com
- **Website:** https://mainwrld.com
- **Terms of Service:** https://mainwrld.com/terms
- **This Privacy Policy:** https://mainwrld.com/privacy

MainWRLD is a creative social platform where users create and read stories ("books" and "chapters"), comment, send direct messages, customize an avatar, and earn or purchase in-app points and an optional "MainWRLD+" premium membership. MainWRLD is available as an iOS app (built with Capacitor) and as a web build.

You can reach a real, monitored human at **hello@mainwrld.com** for any privacy or safety matter.

## 2. Scope of This Policy

This Privacy Policy applies to both the MainWRLD iOS app and the MainWRLD web build. Where a practice applies only to one platform, we say so explicitly (for example, certain payment processing applies only to the web build, and certain purchase-verification applies only to iOS).

## 3. The Data We Collect

We collect only the categories of data described below. We have designed MainWRLD to collect the minimum data needed to operate the service. Section 5 explains specifically what we do **not** collect.

### 3.1 Information You Provide When You Create and Use an Account

| Data | When collected | Where stored |
|---|---|---|
| **Email address** | At signup | Firebase Authentication; your user profile record; and a username-to-email lookup record (see Section 3.6 below for an important disclosure about this record) |
| **Password** | At signup, login, password change | Firebase Authentication only, where it is hashed and salted. We never store your password in our database, and we cannot read it. |
| **Username** | At signup | Your user profile record and a username lookup record |
| **Display name** | At signup | Your user profile record; also shown alongside books you write and comments you post |
| **Date of birth** | At signup | Your user profile record (see Section 3.6 for sensitive-data handling) |
| **Avatar configuration** | When you customize your avatar | Your user profile record (e.g., gender, body, face, hair, and outfit selections, and your avatar's 3D-world coordinates). Avatar "position" is a coordinate inside our 3D world only — it is **not** geographic location. |

### 3.2 Content You Create (User-Generated Content)

When you use MainWRLD's creative and social features, we collect and store the content you create:

- **Books and chapters:** title, tagline, genres, hashtags, body content, chapter titles and chapter content, cover image/color, and a self-declared "explicit" flag.
- **Comments:** the comment text and the book/chapter it relates to.
- **Direct messages (chat):** the message text, sender and recipient usernames, timestamps, and read status. **Direct messages are not end-to-end encrypted.** They are stored in our database in plain text and can be accessed by us for safety, moderation, and legal-compliance purposes.
- **Reports:** when you report a user, book, or comment, we store the report type, the target, your username as reporter, a timestamp, and the report status.
- **Relationships:** "admire"/follow relationships you create (the usernames involved and a timestamp).
- **Likes and library activity:** the books and comments you like, the books you own or have purchased.

### 3.3 Account, Status, and Activity Data We Generate

In the course of operating your account, we generate and store:

- A **user identifier (UID)** assigned by Firebase Authentication, used to associate your account with your content.
- **Account creation timestamp**, and **created/updated timestamps** on your content.
- **Online/presence and activity status** (for example, online/offline and whether you are "Reading," "Writing," or "Idle").
- **Points, membership, and moderation counters**, including your points balance and daily-earned points, premium status and start dates, "strikes," admirer/mutual counts, ban status, and related daily-reset timestamps.
- **Reading progress**, such as your current chapter and scroll position within a book, so you can resume reading where you left off.

Reading progress is first maintained on your device as you read and is then saved to your user profile record on our servers (as part of your account profile) so that your place is preserved across sessions and devices. It is not shared with any third party beyond our database provider (see Section 6) and is deleted when you delete your account (see Section 10).

### 3.4 Purchase and Transaction Data

- **On iOS**, purchases of points and the MainWRLD+ membership are made through **Apple In-App Purchase**. When you purchase, your device provides a transaction identifier, product identifier, and a signed App Store receipt, which we send to our server to verify the purchase and credit your account. We store a transaction record containing your UID, the product purchased, the transaction identifier, the points or premium granted, a timestamp, and the App Store environment. **Apple, not MainWRLD, handles your payment and billing information; we never see your card or billing details.**
- **On the web build**, payments are processed by **Stripe** on Stripe-hosted checkout pages. **Card and payment details are entered on Stripe's pages and are never collected by or transmitted through MainWRLD.**

### 3.5 Information Stored Locally on Your Device

On iOS, MainWRLD stores small amounts of transient state on your device (using local device storage / iOS UserDefaults) to reconcile in-app purchases — for example, markers indicating a pending points purchase, pending premium upgrade, pending purchase, or a pending coupon. This data supports purchase reliability and is not, by itself, transmitted to us as analytics or tracking data.

### 3.6 Sensitive Data and an Important Transparency Disclosure

- **Date of birth.** We collect your full date of birth at signup and retain it on your profile. We use it to support age-related features (see Section 7). Your date of birth is not displayed in the standard profile views of the app.
- **Email in a username-lookup record.** To allow you to sign in using your username, MainWRLD maintains a lookup record that maps each username to its associated email address. **We want to be transparent that this lookup record is readable by others, meaning an email address associated with a known or guessed username could be exposed.** We are disclosing this directly so you can make informed choices about the email address you use. If you have concerns about this, contact us at hello@mainwrld.com.
- **Passwords** are handled exclusively by Firebase Authentication, are hashed and salted, and are never stored in our database. Password resets are sent to your email address via Firebase's password-reset email.

## 4. How and Why We Use Your Data

We use the data described above only for the following purposes:

| Purpose | Data used |
|---|---|
| **Create and secure your account; authenticate logins** | Email, password (via Firebase Auth), username, UID |
| **Provide core features** — publishing books/chapters, commenting, direct messaging, avatar customization, admiring/following, likes, your library, and resuming your place in a book | Content you create, display name, username, avatar configuration, likes, library/ownership data, reading progress |
| **Operate the points and MainWRLD+ membership systems** | Points balances and counters, premium status, transaction records |
| **Verify and credit purchases; provide Restore Purchases (iOS)** | Transaction identifier, product identifier, signed receipt, UID |
| **Show presence and activity** so the social experience works | Online/presence and activity status |
| **Moderate content and keep the community safe** (automated and manual review; acting on reports; strikes/bans) | Books, chapters, comments, reports, and related profile/status fields |
| **Communicate with you**, including a welcome email and account/password emails | Email address, display name, username |
| **Support age-related features** | Date of birth |
| **Comply with law, enforce our Terms, and protect rights and safety** | As reasonably necessary across the above categories |

We do **not** use your data for third-party advertising, cross-app/cross-site tracking, or behavioral profiling, and we do **not** sell your personal information.

## 5. What We Do NOT Collect

Based on how MainWRLD is actually built, we affirmatively confirm that the App does **not** collect or access any of the following:

- **No precise or geographic location.** MainWRLD does not request or use device location, GPS, or any location permission. (Avatar "position" refers only to coordinates within our virtual 3D world.)
- **No camera or microphone access.** MainWRLD requests no camera or microphone permission.
- **No photo library access.** MainWRLD requests no access to your device photos.
- **No contacts, calendar, or motion data.**
- **No advertising identifier (IDFA) and no App Tracking Transparency tracking.** MainWRLD does not access the IDFA, does not link the AdSupport/App Tracking Transparency frameworks, and declares no tracking. We do not show ads and do not integrate any advertising SDK.
- **No third-party analytics SDK and no crash-reporting SDK.** MainWRLD does not integrate Crashlytics, Sentry, Bugsnag, or similar tools. A Firebase "measurement ID" value is present in our Firebase configuration, but the App never initializes Firebase Analytics (it does not call `getAnalytics` or load the Firebase Analytics module), and no analytics events are collected or sent. We do not use Firebase Analytics to collect data about you.
- **No hardware or device-level identifiers.** We do not collect the iOS vendor identifier (IDFV), the advertising identifier (IDFA), or any other device/hardware identifier. The only persistent account identifier we use is a Firebase-assigned **UID**, which is an account identifier (not a device identifier) and is described in Section 3.3.
- **No push notifications / no push tokens.** MainWRLD does not register for or use Apple Push Notifications; notifications are delivered in-app only.

If we ever change any of these practices, we will update this Privacy Policy and the App Store privacy disclosures before the change takes effect.

## 6. Third Parties With Whom We Share Data

We share data only with the service providers below, each only to the extent necessary to provide the service indicated. We require these providers to protect data consistent with this Policy and applicable law. We do not sell your personal information, and we do not share it for cross-context behavioral advertising.

| Third party | Role | Platform | What it receives |
|---|---|---|---|
| **Google Firebase (Firebase Authentication)** | Account authentication | iOS + web | Email, password (hashed by Firebase), UID, authentication token |
| **Google Firebase (Cloud Firestore)** | Primary database for your profile and content | iOS + web | Your profile (including email, date of birth, and reading progress), books, chapters, comments, direct messages, relationships, reports, likes, library, points/membership/status fields, and transaction records |
| **Google Firebase (Cloud Functions)** | Server-side functions for account deletion, purchase verification, content moderation, and account claims | iOS + web | UID, purchase/receipt data, and the profile/content reads needed to perform each function |
| **OpenAI (Moderation API)** | Automated content moderation (when enabled) | iOS + web (server-side) | When automated moderation is enabled, the text of your comments, and book titles, synopses/taglines, and chapter content, are sent for automated classification of objectionable content. See Section 8 for when this applies. |
| **Apple (App Store Server API)** | In-app purchase receipt verification | iOS | Transaction identifier, product identifier, and the signed transaction/receipt data |
| **Apple (StoreKit / In-App Purchase)** | Processing in-app purchases | iOS | Your purchase intent; your Apple ID payment and billing details are handled entirely by Apple — MainWRLD does not receive them |
| **Stripe** | Payment processing for the web build | Web only | Payment and card data, which you enter directly on Stripe-hosted pages; MainWRLD does not receive or store card data |
| **Resend** | Sending transactional email (e.g., welcome email) | Web (server-side) | Your email address, display name, and username |
| **Google Fonts** | Serving fonts/icons on the website | Web only | When the website loads fonts, Google may receive your IP address and browser user-agent as an inherent part of the request. This does not occur in the native iOS app's standard operation. |

Because our Firebase backend (Cloud Firestore and Cloud Functions) is operated by Google Cloud, your data is stored and processed on Google's infrastructure in the United States. As an inherent part of operating these platforms, Google and Apple may log technical information (such as IP addresses) on their own servers; MainWRLD itself does not collect or instrument IP-address, user-agent, session, or behavioral telemetry.

We may also disclose information if required to do so by law, to respond to lawful requests and legal process, to enforce our Terms, or to protect the rights, property, or safety of MainWRLD, our users, or others.

## 7. Children's Privacy

MainWRLD is **not directed to children under 13**, and we do not knowingly collect personal information from children under 13. As a condition of our Terms of Service, you must be at least 13 years old to create a MainWRLD account.

- **Age information.** We collect your date of birth at signup. We use date of birth to support age-related features within the App, including identifying users under 16 for the purpose of restricting certain explicit content in parts of the experience.
- **Explicit content gating.** Authors must mark books containing mature content with an "explicit" flag, which displays an "Explicit" badge. The App restricts explicit content from users identified as under 16 in certain areas of the experience, such as the Explore feed. Please be aware that this gating depends on author self-declaration and on the date of birth provided at signup, that it currently applies to limited surfaces of the App rather than to every screen, and that it may not prevent all access to mature content in every part of the App (for example, where a book is opened directly, through the library, or via search). It also may not apply where a date of birth has not been provided. We continue to improve and expand these protections. Parents or guardians who believe a minor has provided us personal information, or who have concerns about content, should contact us at hello@mainwrld.com.

If we learn that we have collected personal information from a child under 13 without appropriate consent, we will delete that information promptly. To request such deletion, contact hello@mainwrld.com.

## 8. Content Moderation and Community Safety

To keep MainWRLD safe, we use both automated and human content moderation:

- A client-side word filter screens certain fields (such as usernames, display names, comments, chat messages, and book/chapter titles and taglines) at the time of submission.
- A server-side automated moderation layer, **when enabled**, sends the text of comments and book titles, synopses/taglines, and chapter content to **OpenAI's Moderation API** for classification, and may remove flagged content. This automated layer is enabled when our service is configured with the relevant credentials; when it is not enabled, this server-side classification does not run and no such content is sent to OpenAI, though the other moderation measures described here still apply.
- Our team reviews user reports and may remove content, issue strikes, or ban accounts.

For details on reporting, blocking, and our handling of objectionable content, please see our Terms of Service at https://mainwrld.com/terms. The data flows involved in moderation are described in Sections 3, 4, and 6 above.

## 9. Data Retention

- **Account and profile data** (including email, username, display name, date of birth, avatar configuration, reading progress, and status/points/membership fields) is retained for as long as your account remains active.
- **Content you create** (books, chapters, comments, direct messages, relationships, likes, reports) is retained while your account is active or until you delete the specific content (where the App provides that option) or delete your account.
- **Purchase/transaction records** are retained as needed to verify purchases, prevent duplicate crediting, support Restore Purchases, and meet our legal, accounting, and audit obligations.
- **Locally stored purchase-reconciliation state** on your device is transient and is cleared in the normal course of completing or reconciling a purchase, or when you delete the App.

When you delete your account (see Section 10), we delete the associated data as described there. We may retain limited information where necessary to comply with legal obligations, resolve disputes, prevent fraud or abuse, or enforce our agreements.

## 10. Your Rights and Choices, Including In-App Account Deletion

### 10.1 Access, Correction, and Deletion

You can access and update much of your profile information directly within the App. To request access to, correction of, or deletion of your personal data, or to withdraw consent, contact us at **hello@mainwrld.com**. We will respond consistent with applicable law.

### 10.2 In-App Account Deletion (Required by Apple Guideline 5.1.1(v))

You can permanently delete your MainWRLD account and your associated data from **within the App**, without contacting us:

> **Settings → "Permanently Delete Account" → confirm in the "Delete Account?" dialog.**

When you confirm, MainWRLD runs a server-side deletion that removes:

- your username lookup record;
- your books and your comments;
- your direct messages (those you sent and received);
- your admire/follow relationships;
- your notifications;
- the reports you filed;
- your user profile record (including your reading progress); and
- your authentication account itself.

After deletion you are signed out, and the account can no longer be used. This in-app deletion path satisfies Apple App Store Review Guideline 5.1.1(v). If you experience any problem deleting your account in the App, contact hello@mainwrld.com for assistance.

### 10.3 Withdrawing Consent and Communication Preferences

You may withdraw consent to our processing by deleting your account as described above or by contacting hello@mainwrld.com. Transactional emails (such as account and password emails) are part of operating your account.

## 11. Your Regional Privacy Rights

### 11.1 European Economic Area and United Kingdom (GDPR / UK GDPR)

If you are in the EEA or the UK, Fried Mermaid LLC is the controller of your personal data. Our legal bases for processing include: **performance of a contract** (to provide the App and your account), **legitimate interests** (to operate, secure, and improve the service and to keep the community safe through moderation), **consent** (where required), and **compliance with legal obligations**.

You have the right to **access**, **rectify**, **erase**, **restrict** or **object** to processing, **data portability**, and to **withdraw consent** at any time. You also have the right to lodge a complaint with your local supervisory authority. Because our infrastructure is operated in the United States, your data may be **transferred to and processed in the United States**; we rely on appropriate safeguards and your information remains protected under this Policy. To exercise any right, contact hello@mainwrld.com.

### 11.2 California (CCPA/CPRA)

If you are a California resident, you have the right to **know/access** the personal information we collect and how we use and disclose it, to request **correction**, to request **deletion**, and to be free from **discrimination** for exercising your rights. The categories of personal information we collect and the parties with whom we share it are described in Sections 3 and 6.

**We do not sell your personal information, and we do not share it for cross-context behavioral advertising.** To exercise your California rights, contact hello@mainwrld.com. You may use an authorized agent to submit a request, subject to verification.

### 11.3 Other Jurisdictions

Residents of other U.S. states and other countries may have similar rights under applicable law. Contact hello@mainwrld.com and we will honor rights as required by the laws that apply to you.

## 12. Security

We take reasonable and appropriate measures to protect your data, including:

- **Encryption in transit** for communications between the App, our backend, and our service providers.
- **Managed, hardened infrastructure** provided by Google Firebase / Google Cloud, with **encryption at rest** for stored data.
- **Authentication and access controls**, including hashed-and-salted password storage handled by Firebase Authentication (we never store your password) and server-side access rules that restrict who can read and write data.
- **Administrative restrictions** so that sensitive moderation actions (such as reviewing reports, issuing strikes, and banning) are limited to authorized administrators.

No method of transmission or storage is completely secure, and we cannot guarantee absolute security. Please use a strong, unique password and keep your login credentials confidential. Remember that direct messages are not end-to-end encrypted (see Section 3.2).

## 13. International Data Transfers

MainWRLD is operated from the United States, and our service providers (including Google Firebase/Google Cloud, OpenAI, Apple, Stripe, and Resend) process data in the United States and potentially other countries where they operate. By using MainWRLD, you understand that your information will be processed in the United States. Where required, we rely on appropriate legal mechanisms and safeguards for such transfers, and your data remains protected under this Policy.

## 14. Changes to This Privacy Policy

We may update this Privacy Policy from time to time. When we do, we will revise the "Effective date / last updated" date at the top of this document and post the updated Policy at https://mainwrld.com/privacy. If we make material changes, we will provide additional notice as appropriate (for example, by in-app notice or by email to the address associated with your account). Your continued use of MainWRLD after the updated Policy takes effect constitutes acceptance of the changes.

## 15. Governing Law

This Privacy Policy and any dispute arising out of or relating to it or to your privacy are governed by the laws of the **State of New York, United States**, without regard to its conflict-of-laws principles, except where mandatory consumer-protection or data-protection laws of your jurisdiction apply.

## 16. Contact Us

If you have questions, requests, or concerns about this Privacy Policy or your personal data, contact us:

**Fried Mermaid LLC**
418 Broadway Ste N
Albany, NY 12207-2922
United States
Email: hello@mainwrld.com
Website: https://mainwrld.com
