import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import type { AppConfiguration } from '../../infra/config/configuration';
import {
  COLLECTIONS,
  FIRESTORE,
} from '../../infra/firebase/firebase.constants';
import { ProfanityService } from '../../shared/profanity/profanity.service';

export interface ModerationVerdict {
  flagged: boolean;
  topCategory?: string;
  score?: number;
}

interface ModerationResponse {
  results?: Array<{
    flagged: boolean;
    categories: Record<string, boolean>;
    category_scores: Record<string, number>;
  }>;
}

// UGC moderation (ported from functions/src/moderate.ts). Two layers:
//   1. curated profanity filter (obscenity) — always on for identity/metadata
//      text (usernames, titles, comments, chat); skipped for chapter prose.
//   2. OpenAI Moderation API — hate/harassment/sexual/violent; runs when the
//      key is configured. Never fails closed: no key => profanity layer only.
//
// In the API these are called INLINE from write endpoints (pre-moderation): a
// flagged write is rejected and `logFlag` records it for the admin audit trail.
// OpenAI moderation categories that are NEVER allowed, even in a work the
// author flagged as Mature. Mature fiction may contain sexual/violent themes,
// but child sexual content, illegal content, hate, harassment, and self-harm
// promotion are always rejected. (Kept in sync with functions/src/moderate.ts,
// which cannot import from apps/api.)
const ALWAYS_BLOCKED = new Set<string>([
  'sexual/minors',
  'illicit',
  'illicit/violent',
  'hate',
  'hate/threatening',
  'harassment',
  'harassment/threatening',
  'self-harm',
  'self-harm/intent',
  'self-harm/instructions',
]);

@Injectable()
export class ModerationService {
  private readonly logger = new Logger(ModerationService.name);

  constructor(
    private readonly config: ConfigService<AppConfiguration, true>,
    private readonly profanity: ProfanityService,
    @Inject(FIRESTORE) private readonly db: Firestore,
  ) {}

  private get apiKey(): string | undefined {
    return this.config.get('secrets', { infer: true }).openaiApiKey;
  }

  private async moderateText(
    text: string,
    mature: boolean,
  ): Promise<ModerationVerdict> {
    const apiKey = this.apiKey;
    if (!apiKey) return { flagged: false };
    if (!text || !text.trim()) return { flagged: false };
    try {
      const res = await fetch('https://api.openai.com/v1/moderations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model: 'omni-moderation-latest', input: text }),
      });
      if (!res.ok) {
        this.logger.warn(`moderation api non-2xx status=${res.status}`);
        return { flagged: false };
      }
      const data = (await res.json()) as ModerationResponse;
      const r = data.results?.[0];
      if (!r) return { flagged: false };
      const active = Object.entries(r.categories)
        .filter(([, on]) => on)
        .map(([cat]) => cat);
      // Mature works: only the always-blocked categories count as a violation
      // (sexual/violence themes are permitted). Non-mature works: any flagged
      // category is a violation — the author can flag the work Mature to allow
      // mature themes.
      const violating = mature
        ? active.filter((cat) => ALWAYS_BLOCKED.has(cat))
        : active;
      if (violating.length === 0) return { flagged: false };
      const top = violating
        .map((cat) => [cat, r.category_scores[cat] ?? 0] as const)
        .sort(([, a], [, b]) => b - a)[0];
      return { flagged: true, topCategory: top?.[0], score: top?.[1] };
    } catch (err) {
      this.logger.warn(`moderation api error: ${(err as Error)?.message}`);
      return { flagged: false };
    }
  }

  // Combined verdict. checkProfanity=false for chapter body prose so legitimate
  // swearing in fiction is not removed (OpenAI still screens it). `mature`
  // relaxes the OpenAI layer to permit sexual/violent themes in works flagged
  // Mature, while still rejecting always-blocked categories.
  async screen(
    text: string,
    checkProfanity = true,
    mature = false,
  ): Promise<ModerationVerdict> {
    if (checkProfanity && this.profanity.contains(text)) {
      return { flagged: true, topCategory: 'profanity' };
    }
    return this.moderateText(text, mature);
  }

  // Write an auto-moderation record to `reports` for the admin audit trail.
  async logFlag(
    kind: 'Comment' | 'Book' | 'Chat',
    targetId: string,
    authorUsername: string | undefined,
    reason: string,
    score: number | undefined,
  ): Promise<void> {
    const id = `auto-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await this.db.collection(COLLECTIONS.reports).add({
      id,
      type: kind,
      targetId,
      reportedBy: 'system',
      reason: `auto-moderation: ${reason}${score ? ` (${score.toFixed(3)})` : ''}`,
      authorUsername: authorUsername ?? null,
      timestamp: new Date().toISOString(),
      status: 'resolved',
      autoModerated: true,
      createdAt: FieldValue.serverTimestamp(),
    });
  }
}
