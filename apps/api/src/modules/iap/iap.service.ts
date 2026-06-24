import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  PreconditionFailedException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import {
  AppStoreServerAPIClient,
  Environment,
  ProductType,
  SignedDataVerifier,
} from '@apple/app-store-server-library';
import type { AppConfiguration } from '../../infra/config/configuration';
import type { AuthUser } from '../../infra/auth/auth-user.interface';
import {
  COLLECTIONS,
  FIRESTORE,
} from '../../infra/firebase/firebase.constants';
import { EmailService } from '../../shared/email/email.service';
import {
  couponPurchaseEmail,
  membershipWelcomeEmail,
  pointsPurchaseEmail,
} from '../../shared/email/email.templates';

// IAP product maps. NOTE: keep in sync with app/iap.ts IAP_PRODUCTS and the
// Stripe webhook SKU maps (candidate to consolidate into @mainwrld/types).
const POINTS_BY_PRODUCT: Record<string, number> = {
  'mainwrld.points_100': 100,
  'mainwrld.points_300': 300,
  'mainwrld.points_500': 500,
  'mainwrld.points_1000': 1000,
};
const PREMIUM_PRODUCT_IDS = new Set(['mainwrld.premium_yearly']);
const COUPON_VALUE_BY_PRODUCT: Record<string, number> = {
  'mainwrld.coupon_100': 1,
  'mainwrld.coupon_300': 3,
  'mainwrld.coupon_500': 5,
  'mainwrld.coupon_1000': 10,
};

export interface VerifyResult {
  credited: boolean;
  pointsAdded?: number;
  isPremium?: boolean;
  couponAdded?: { id: string; value: number; used: boolean };
}

@Injectable()
export class IapService {
  private readonly logger = new Logger(IapService.name);

  constructor(
    private readonly config: ConfigService<AppConfiguration, true>,
    @Inject(FIRESTORE) private readonly db: Firestore,
    private readonly email: EmailService,
  ) {}

  async verifyApple(
    user: AuthUser,
    productId: string,
    transactionId: string,
  ): Promise<VerifyResult> {
    if (!productId || !transactionId) {
      throw new BadRequestException('productId and transactionId required.');
    }

    const apple = this.config.get('secrets', { infer: true }).apple;
    const { issuerId, keyId, bundleId, privateKey } = apple;
    const envRaw = apple.env || 'Sandbox';
    if (!issuerId || !keyId || !bundleId || !privateKey) {
      throw new PreconditionFailedException({
        code: 'failed-precondition',
        message: 'Apple credentials are not configured.',
      });
    }
    const env =
      envRaw.toLowerCase() === 'production'
        ? Environment.PRODUCTION
        : Environment.SANDBOX;

    // Fetch the signed transaction from Apple.
    // NOTE(risk, 1:1 with original): the `not-found` throw below sits inside the
    // try, so an empty signedTx is reported to the client as 503 'unavailable'
    // rather than 404. Preserved as-is; candidate to move the check outside.
    let signedTx: string;
    try {
      const client = new AppStoreServerAPIClient(
        privateKey,
        keyId,
        issuerId,
        bundleId,
        env,
      );
      const info = await client.getTransactionInfo(transactionId);
      signedTx = info.signedTransactionInfo ?? '';
      if (!signedTx)
        throw new NotFoundException('Transaction not found at Apple.');
    } catch (err) {
      this.logger.error(
        `verifyAppleReceipt: getTransactionInfo failed for ${user.uid}`,
        err as Error,
      );
      throw new ServiceUnavailableException(
        'Could not reach Apple to verify the receipt.',
      );
    }

    // Verify signature + decode.
    // NOTE(risk, 1:1): appAppleId is passed undefined — fine for Sandbox, but
    // Production verification technically needs the numeric App Apple ID.
    let payload: Record<string, unknown>;
    try {
      const verifier = new SignedDataVerifier(
        [],
        true,
        env,
        bundleId,
        undefined,
      );
      payload = (await verifier.verifyAndDecodeTransaction(
        signedTx,
      )) as unknown as Record<string, unknown>;
    } catch (err) {
      this.logger.error(
        `verifyAppleReceipt: signature verification failed for ${user.uid}`,
        err as Error,
      );
      throw new ForbiddenException({
        code: 'permission-denied',
        message: 'Receipt signature invalid.',
      });
    }

    // Sanity checks.
    if (payload.transactionId !== transactionId) {
      throw new ForbiddenException({
        code: 'permission-denied',
        message: 'Transaction ID mismatch.',
      });
    }
    if (payload.productId !== productId) {
      throw new ForbiddenException({
        code: 'permission-denied',
        message: 'Product ID mismatch.',
      });
    }
    if (payload.bundleId && payload.bundleId !== bundleId) {
      throw new ForbiddenException({
        code: 'permission-denied',
        message: 'Bundle ID mismatch.',
      });
    }

    // Subscription expiry gate.
    if (payload.productType === ProductType.AUTO_RENEWABLE) {
      const exp = (payload.expiresDate as number) ?? 0;
      if (exp > 0 && exp < Date.now()) return { credited: false };
    }

    const txRef = this.db
      .collection(COLLECTIONS.iapTransactions)
      .doc(transactionId);
    const userRef = this.db.collection(COLLECTIONS.users).doc(user.uid);
    const expiresMs = (payload.expiresDate as number) ?? 0;

    const txOutcome = await this.db.runTransaction(async (t) => {
      const existing = await t.get(txRef);
      if (existing.exists) {
        return {
          result: { credited: true, pointsAdded: 0 } as VerifyResult,
          newly: false,
        };
      }
      const userSnap = await t.get(userRef);
      if (!userSnap.exists) {
        throw new NotFoundException('User profile missing.');
      }
      const points = POINTS_BY_PRODUCT[productId];
      const isPremiumProduct = PREMIUM_PRODUCT_IDS.has(productId);
      const couponValue = COUPON_VALUE_BY_PRODUCT[productId];
      const result: VerifyResult = { credited: true };

      if (points) {
        t.update(userRef, { points: FieldValue.increment(points) });
        result.pointsAdded = points;
      }
      if (isPremiumProduct) {
        t.update(userRef, {
          isPremium: true,
          premiumSince: new Date().toISOString(),
          membershipStartDate: Date.now(),
          premiumProvider: 'apple',
          premiumCancelAtPeriodEnd: false,
          ...(expiresMs ? { premiumRenewalAt: expiresMs } : {}),
        });
        result.isPremium = true;
      }
      if (couponValue) {
        const coupon = {
          id: `buy_${transactionId}`,
          value: couponValue,
          used: false,
        };
        t.update(userRef, { coupons: FieldValue.arrayUnion(coupon) });
        result.couponAdded = coupon;
      }

      t.set(txRef, {
        uid: user.uid,
        productId,
        transactionId,
        pointsAdded: result.pointsAdded ?? 0,
        isPremium: !!isPremiumProduct,
        couponValue: couponValue ?? 0,
        createdAt: FieldValue.serverTimestamp(),
        env: envRaw,
      });
      return { result, newly: true };
    });

    if (txOutcome.newly) {
      const buyer = await this.email.userContact(user.uid);
      const to = user.email ?? buyer.email;
      if (to) {
        const r = txOutcome.result;
        const mail = r.isPremium
          ? membershipWelcomeEmail(buyer.displayName)
          : r.pointsAdded
            ? pointsPurchaseEmail(buyer.displayName, r.pointsAdded)
            : r.couponAdded
              ? couponPurchaseEmail(buyer.displayName, r.couponAdded.value)
              : undefined;
        if (mail) await this.email.send(to, mail.subject, mail.html);
      }
    }

    return txOutcome.result;
  }
}
