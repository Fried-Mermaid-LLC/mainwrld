import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthUser } from './auth-user.interface';
import { ROLES_KEY } from './auth.decorators';

// Runs after AuthGuard. Enforces `@Roles('admin')` against the `admin` claim
// on req.user. No `@Roles` on a route => allowed.
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles?.length) return true;

    const req = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    if (roles.includes('admin') && req.user?.admin !== true) {
      throw new ForbiddenException('Admin only');
    }
    return true;
  }
}
