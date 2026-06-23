import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import type { AuthUser } from './auth-user.interface';

// `@Public()` — skip AuthGuard for this route (login-adjacent, webhooks, og).
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

// `@Roles('admin')` — require the given role (checked by RolesGuard).
export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

// `@CurrentUser()` → AuthUser; `@CurrentUser('uid')` → that field.
export const CurrentUser = createParamDecorator(
  (data: keyof AuthUser | undefined, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest<{ user?: AuthUser }>();
    return data ? req.user?.[data] : req.user;
  },
);
