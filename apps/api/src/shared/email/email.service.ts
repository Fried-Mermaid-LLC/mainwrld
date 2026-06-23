import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Firestore } from 'firebase-admin/firestore';
import type { AppConfiguration } from '../../infra/config/configuration';
import {
  COLLECTIONS,
  FIRESTORE,
} from '../../infra/firebase/firebase.constants';

// Resend's shared sender works without domain verification. Keep the display
// name as "MainWRLD".
const FROM = 'MainWRLD <noreply@mainwrld.com>';

export interface SendResult {
  ok: boolean;
  status?: number;
  error?: string;
}

export interface UserContact {
  email: string | null;
  displayName: string;
  username: string;
}

// Shared transactional-email service (ported from functions/src/email.ts).
// Every customer-facing email goes through `send()` so they share one Resend
// integration and the branded layout in email.templates.ts.
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(
    private readonly config: ConfigService<AppConfiguration, true>,
    @Inject(FIRESTORE) private readonly db: Firestore,
  ) {}

  // Best-effort send via Resend. Never throws — returns {ok:false,…} on any
  // failure so callers decide whether a miss should block their flow (only the
  // welcome path does; everything else is fire-and-forget).
  async send(to: string, subject: string, html: string): Promise<SendResult> {
    const key = this.config.get('secrets', { infer: true }).resendApiKey;
    if (!key || !to) {
      this.logger.log(`email skipped (hasKey=${!!key}, hasTo=${!!to})`);
      return { ok: false, error: 'missing key or recipient' };
    }
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({ from: FROM, to, subject, html }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        this.logger.warn(
          `Resend non-2xx status=${res.status} subject="${subject}" ${detail}`,
        );
        return { ok: false, status: res.status, error: detail };
      }
      this.logger.log(`email sent to=${to} subject="${subject}"`);
      return { ok: true, status: res.status };
    } catch (err) {
      this.logger.error(`email failed subject="${subject}"`, err as Error);
      return { ok: false, error: (err as Error)?.message };
    }
  }

  // Resolve a user's email + display name from their Firestore profile, server-
  // side. Never trust a client-supplied recipient — this keeps every email
  // locked to the account owner's own address.
  async userContact(uid?: string | null): Promise<UserContact> {
    if (!uid) return { email: null, displayName: 'there', username: '' };
    try {
      const snap = await this.db.collection(COLLECTIONS.users).doc(uid).get();
      const data = (snap.data() as Record<string, unknown>) || {};
      return {
        email: (data.email as string) || null,
        displayName:
          (data.displayName as string) || (data.username as string) || 'there',
        username: (data.username as string) || '',
      };
    } catch {
      return { email: null, displayName: 'there', username: '' };
    }
  }
}
