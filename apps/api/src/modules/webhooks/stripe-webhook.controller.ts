import { Controller, Headers, Post, Req, Res } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Public } from '../../infra/auth/auth.decorators';
import { StripeWebhookService } from './stripe-webhook.service';

@ApiTags('webhooks')
@Controller({ path: 'webhooks', version: '1' })
export class StripeWebhookController {
  constructor(private readonly webhook: StripeWebhookService) {}

  // Public (Stripe-signed, not Firebase-authed). Uses the raw body preserved by
  // `rawBody: true` in main.ts for HMAC signature verification.
  @Public()
  @Post('stripe')
  async stripe(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') sig: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const rawBody = req.rawBody;
    if (!rawBody) {
      res.status(400).send('Missing raw body');
      return;
    }
    const result = await this.webhook.handle(rawBody, sig);
    res.status(result.status).send(result.body);
  }
}
