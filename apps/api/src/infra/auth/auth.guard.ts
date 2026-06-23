import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Auth } from 'firebase-admin/auth';
import type { Request } from 'express';
import { FIREBASE_AUTH } from '../firebase/firebase.constants';
import type { AuthUser } from './auth-user.interface';
import { IS_PUBLIC_KEY } from './auth.decorators';

// Global guard. Verifies the `Authorization: Bearer <idToken>` header via
// firebase-admin and attaches the decoded identity (uid + custom claims) to
// `req.user`. Routes marked `@Public()` are skipped.
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(FIREBASE_AUTH) private readonly auth: Auth,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }
    const token = header.slice('Bearer '.length).trim();

    try {
      // checkRevoked=true closes the window after a ban revokes refresh tokens.
      const decoded = await this.auth.verifyIdToken(token, true);
      req.user = {
        uid: decoded.uid,
        email: decoded.email,
        username:
          typeof decoded.username === 'string' ? decoded.username : undefined,
        admin: decoded.admin === true,
        banned: decoded.banned === true,
      };
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
