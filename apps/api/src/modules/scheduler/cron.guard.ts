import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { AppConfiguration } from '../../infra/config/configuration';

// Protects the /internal/cron/* endpoints. Cloud Scheduler sends the shared
// secret in the `x-cron-secret` header. (OIDC is a stronger alternative for a
// follow-up.) Runs after the global AuthGuard, which the routes mark @Public().
@Injectable()
export class CronGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService<AppConfiguration, true>,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const expected = this.config.get('internalCronSecret', { infer: true });
    const provided = req.headers['x-cron-secret'];
    if (!expected || provided !== expected) {
      throw new UnauthorizedException('Invalid cron secret');
    }
    return true;
  }
}
