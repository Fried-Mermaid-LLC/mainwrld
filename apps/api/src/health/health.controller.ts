import { Controller, Get, Inject, VERSION_NEUTRAL } from '@nestjs/common';
import type { Firestore } from 'firebase-admin/firestore';
import { ApiTags } from '@nestjs/swagger';
import { FIRESTORE } from '../infra/firebase/firebase.constants';
import { Public } from '../infra/auth/auth.decorators';

// Version-neutral + excluded from the global `/api` prefix in main.ts, so these
// live at `/healthz` and `/readyz` for Cloud Run startup/liveness probes.
@ApiTags('health')
@Controller({ version: VERSION_NEUTRAL })
export class HealthController {
  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  @Public()
  @Get('healthz')
  liveness() {
    return { status: 'ok' };
  }

  @Public()
  @Get('readyz')
  async readiness() {
    // Lightweight Firestore round-trip to confirm credentials + connectivity.
    await this.db.collection('appConfig').limit(1).get();
    return { status: 'ready' };
  }
}
