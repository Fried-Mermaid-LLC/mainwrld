import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  PreconditionFailedException,
} from '@nestjs/common';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import {
  allowedPriceTiers,
  isChapterPublished,
  publishedCount,
  PRICE_TIERS,
} from '@mainwrld/types';
import type { ChapterMeta } from '@mainwrld/types';
import type { AuthUser } from '../../infra/auth/auth-user.interface';
import {
  COLLECTIONS,
  FIRESTORE,
} from '../../infra/firebase/firebase.constants';
import { MonetizationEffectsService } from './monetization-effects.service';
import { PaymentsService } from './payments.service';

@Injectable()
export class MonetizationService {
  private readonly logger = new Logger(MonetizationService.name);

  constructor(
    @Inject(FIRESTORE) private readonly db: Firestore,
    private readonly payments: PaymentsService,
    private readonly effects: MonetizationEffectsService,
  ) {}

  // Minimum reader-like count across the PUBLISHED chapters. Likes are indexed
  // by absolute chapter order; published chapters are no longer a [0, count)
  // prefix, so we read the like at each published position via the per-chapter
  // flag (legacy docs fall back to the prefix inside isChapterPublished).
  private minLikesPerPublishedChapter(book: Record<string, unknown>): number {
    const meta = (book.chapterMeta as ChapterMeta[]) || [];
    const chaptersCount = (book.chaptersCount as number) || 0;
    const arr: number[] = Array.isArray(book.likes)
      ? (book.likes as number[])
      : [typeof book.likes === 'number' ? (book.likes as number) : 0];
    const published: number[] = [];
    const len = Math.max(meta.length, chaptersCount);
    for (let i = 0; i < len; i++) {
      if (isChapterPublished(meta, i, chaptersCount)) published.push(arr[i] || 0);
    }
    return published.length ? Math.min(...published) : 0;
  }

  private canMonetize(book: Record<string, unknown>): boolean {
    return !book.permanentlyDemonetized && !book.wasMonetizedBefore;
  }

  async submit(
    user: AuthUser,
    bookId: string,
    priceUsd: number,
  ): Promise<{ ok: boolean }> {
    const found = await this.payments.findBookByIdField(bookId);
    if (!found) throw new NotFoundException('Book not found.');
    const book = found.data;
    if (book.authorUid !== user.uid) {
      throw new ForbiddenException('Not your book.');
    }
    if (book.isDraft === true) {
      throw new PreconditionFailedException(
        'Publish the book before monetizing.',
      );
    }
    const isAdmin = user.admin;
    if (!this.canMonetize(book)) {
      throw new PreconditionFailedException(
        'This book can’t be monetized again.',
      );
    }
    if (book.takenDown === true) {
      throw new PreconditionFailedException(
        'This book was taken down and can’t be monetized.',
      );
    }

    // Server-truth chapter count caps the client-writable count. The published
    // count is derived from the per-chapter flags (falling back to the legacy
    // prefix for un-migrated docs).
    const realChapters = (await found.ref.collection('chapters').count().get())
      .data().count;
    const effectiveChapters = Math.min(
      publishedCount(
        book.chapterMeta as ChapterMeta[] | undefined,
        book.chaptersCount as number | undefined,
      ),
      realChapters,
    );

    if (!isAdmin) {
      // The "completed" gate was removed; the published requirement is already
      // enforced by the isDraft check above (applies to everyone).
      if (effectiveChapters < 5) {
        throw new PreconditionFailedException('Need at least 5 chapters.');
      }
      if (this.minLikesPerPublishedChapter(book) < 100) {
        throw new PreconditionFailedException('Need 100+ likes per chapter.');
      }
      const published = new Date(book.publishedDate as string);
      const days = Math.ceil(
        Math.abs(Date.now() - published.getTime()) / (1000 * 60 * 60 * 24),
      );
      if (days < 21) {
        throw new PreconditionFailedException('Must be published 21+ days.');
      }
      if (((book.monetizationAttempts as number) || 0) >= 2) {
        throw new PreconditionFailedException('Maximum 2 attempts reached.');
      }
      if (!allowedPriceTiers(effectiveChapters).includes(priceUsd)) {
        throw new PreconditionFailedException(
          'Price not allowed for this chapter count.',
        );
      }
    } else if (!PRICE_TIERS.includes(priceUsd as (typeof PRICE_TIERS)[number])) {
      throw new BadRequestException('Invalid price tier.');
    }
    if (book.monetizationStatus === 'pending') {
      throw new PreconditionFailedException('A request is already pending.');
    }

    // Payout gate — trustworthy mirror booleans (Cloud-Functions/API-written).
    const userSnap = await this.db
      .collection(COLLECTIONS.users)
      .doc(user.uid)
      .get();
    const userData = (userSnap.data() as Record<string, unknown>) || {};
    if (userData.payoutsEnabled !== true || !userData.stripeAccountId) {
      throw new PreconditionFailedException(
        'Set up your payout account first (payouts not enabled).',
      );
    }

    await found.ref.update({
      monetizationStatus: 'pending',
      requestedPrice: priceUsd,
      monetizationRequestedAt: new Date().toISOString(),
      monetizationAttempts: ((book.monetizationAttempts as number) || 0) + 1,
      sellerUid: user.uid,
      sellerStripeAccountId: userData.stripeAccountId,
      monetizationAdminBypass: isAdmin,
      monetizationDenialReason: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    this.logger.log(`submitMonetizationRequest ${bookId} $${priceUsd}`);
    return { ok: true };
  }

  async review(
    adminUsername: string,
    reviewerUid: string,
    bookId: string,
    decision: 'approve' | 'deny',
    reason?: string,
  ): Promise<{ ok: boolean }> {
    const found = await this.payments.findBookByIdField(bookId);
    if (!found) throw new NotFoundException('Book not found.');
    const book = found.data;
    // Monetization review is an independent gate: the requester/payee-seller
    // and the approver must be different people. An admin who authored (or is
    // the seller of) this book may not review their own request — otherwise the
    // person who profits unilaterally approves their own sale.
    if (book.authorUid === reviewerUid || book.sellerUid === reviewerUid) {
      throw new ForbiddenException(
        'You cannot review your own book’s monetization request.',
      );
    }
    const nowIso = new Date().toISOString();

    if (decision === 'approve') {
      if (book.isDraft === true) {
        throw new PreconditionFailedException(
          'Book is a draft — publish it first.',
        );
      }
      if (!this.canMonetize(book) || book.takenDown === true) {
        throw new PreconditionFailedException(
          'This book can’t be monetized again.',
        );
      }
      const price = book.requestedPrice as number | undefined;
      if (typeof price !== 'number' || price <= 0) {
        throw new PreconditionFailedException(
          'No requested price on this book.',
        );
      }
      if (!PRICE_TIERS.includes(price as (typeof PRICE_TIERS)[number])) {
        throw new PreconditionFailedException('Invalid requested price tier.');
      }
      if (book.monetizationAdminBypass !== true) {
        const realChapters = (
          await found.ref.collection('chapters').count().get()
        ).data().count;
        const effectiveChapters = Math.min(
          (book.chaptersCount as number) || 0,
          realChapters,
        );
        if (!allowedPriceTiers(effectiveChapters).includes(price)) {
          throw new PreconditionFailedException(
            'Requested price is no longer valid for this book’s chapter count.',
          );
        }
      }
      if (!book.sellerStripeAccountId) {
        throw new PreconditionFailedException(
          'Seller has no connected payout account.',
        );
      }
      await found.ref.update({
        monetizationStatus: 'approved',
        isMonetized: true,
        isFree: false,
        price,
        monetizationReviewedAt: nowIso,
        monetizationReviewedBy: adminUsername,
        updatedAt: FieldValue.serverTimestamp(),
      });
      this.logger.log(`reviewMonetization approved ${bookId} $${price}`);
      // Inline onBookMonetized (approved) side-effects.
      await this.effects.onApproved(bookId, {
        ...book,
        isMonetized: true,
        price,
      });
      return { ok: true };
    }

    // deny
    const trimmed = String(reason || '').trim();
    if (!trimmed) {
      throw new BadRequestException('A denial reason is required.');
    }
    await found.ref.update({
      monetizationStatus: 'denied',
      monetizationDenialReason: trimmed,
      monetizationReviewedAt: nowIso,
      monetizationReviewedBy: adminUsername,
      updatedAt: FieldValue.serverTimestamp(),
    });
    this.logger.log(`reviewMonetization denied ${bookId}`);
    await this.effects.onDenied(bookId, book, trimmed);
    return { ok: true };
  }
}
