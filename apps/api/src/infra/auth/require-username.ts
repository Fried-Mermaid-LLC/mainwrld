import { ForbiddenException } from '@nestjs/common';
import type { AuthUser } from './auth-user.interface';

// Username-keyed collections (relationships, chatMessages, notifications,
// comments) need the `username` custom claim. Throw a clear error if it's
// missing rather than writing a malformed record.
export function requireUsername(user: AuthUser): string {
  if (!user.username) {
    throw new ForbiddenException({
      code: 'failed-precondition',
      message: 'Username claim required; re-authenticate',
    });
  }
  return user.username;
}
