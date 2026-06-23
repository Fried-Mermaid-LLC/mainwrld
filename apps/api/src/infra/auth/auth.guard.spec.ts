import {
  ArgumentsHost,
  ExecutionContext,
  ForbiddenException,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from './auth.guard';
import { RolesGuard } from './roles.guard';
import { CronGuard } from '../../modules/scheduler/cron.guard';
import { AllExceptionsFilter } from '../../common/filters/all-exceptions.filter';
import type { AuthUser } from './auth-user.interface';
import { createFakeAuth, fakeConfig } from '../../testing/test-utils';

// Minimal ExecutionContext: only the methods the guards reach for.
function makeContext(over: {
  req?: Record<string, unknown>;
  handler?: unknown;
  cls?: unknown;
}): ExecutionContext {
  const req = over.req ?? {};
  return {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => ({}),
    }),
    getHandler: () => over.handler ?? (() => undefined),
    getClass: () => over.cls ?? class {},
  } as unknown as ExecutionContext;
}

// Minimal ArgumentsHost for the exception filter; captures the response.
function makeHost(): {
  host: ArgumentsHost;
  res: { statusCode?: number; body?: unknown };
} {
  const res: { statusCode?: number; body?: unknown } = {};
  const response = {
    status: jest.fn((code: number) => {
      res.statusCode = code;
      return response;
    }),
    json: jest.fn((body: unknown) => {
      res.body = body;
      return response;
    }),
  };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({ url: '/x', method: 'POST' }),
    }),
  } as unknown as ArgumentsHost;
  return { host, res };
}

describe('auth guards + filter', () => {
  describe('AuthGuard', () => {
    let reflector: { getAllAndOverride: jest.Mock };
    let auth: ReturnType<typeof createFakeAuth>;
    let guard: AuthGuard;

    beforeEach(() => {
      reflector = { getAllAndOverride: jest.fn() };
      auth = createFakeAuth();
      guard = new AuthGuard(reflector as unknown as Reflector, auth as any);
    });

    it('allows a @Public() route without inspecting headers', async () => {
      reflector.getAllAndOverride.mockReturnValue(true);
      const ctx = makeContext({ req: { headers: {} } });
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(auth.verifyIdToken).not.toHaveBeenCalled();
    });

    it('rejects a missing bearer token with Unauthorized', async () => {
      reflector.getAllAndOverride.mockReturnValue(false);
      const ctx = makeContext({ req: { headers: {} } });
      await expect(guard.canActivate(ctx)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(guard.canActivate(ctx)).rejects.toThrow(
        'Missing bearer token',
      );
    });

    it('rejects a non-bearer Authorization scheme', async () => {
      reflector.getAllAndOverride.mockReturnValue(false);
      const ctx = makeContext({
        req: { headers: { authorization: 'Basic abc' } },
      });
      await expect(guard.canActivate(ctx)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('verifies a valid token with checkRevoked and populates req.user', async () => {
      reflector.getAllAndOverride.mockReturnValue(false);
      auth.verifyIdToken.mockResolvedValue({
        uid: 'u9',
        email: 'u9@test.com',
        username: 'bob',
        admin: true,
        banned: false,
      });
      const req: { headers: Record<string, string>; user?: AuthUser } = {
        headers: { authorization: 'Bearer good-token' },
      };
      const ctx = makeContext({ req });
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      // checkRevoked=true closes the post-ban window.
      expect(auth.verifyIdToken).toHaveBeenCalledWith('good-token', true);
      expect(req.user).toEqual({
        uid: 'u9',
        email: 'u9@test.com',
        username: 'bob',
        admin: true,
        banned: false,
      });
    });

    it('normalizes non-string/absent claims to undefined/false', async () => {
      reflector.getAllAndOverride.mockReturnValue(false);
      auth.verifyIdToken.mockResolvedValue({ uid: 'u1', username: 42 });
      const req: { headers: Record<string, string>; user?: AuthUser } = {
        headers: { authorization: 'Bearer t' },
      };
      const ctx = makeContext({ req });
      await guard.canActivate(ctx);
      expect(req.user).toEqual({
        uid: 'u1',
        email: undefined,
        username: undefined,
        admin: false,
        banned: false,
      });
    });

    it('rejects an invalid/expired token with Unauthorized', async () => {
      reflector.getAllAndOverride.mockReturnValue(false);
      auth.verifyIdToken.mockRejectedValue(new Error('token expired'));
      const ctx = makeContext({
        req: { headers: { authorization: 'Bearer bad' } },
      });
      await expect(guard.canActivate(ctx)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(guard.canActivate(ctx)).rejects.toThrow(
        'Invalid or expired token',
      );
    });
  });

  describe('RolesGuard', () => {
    let reflector: { getAllAndOverride: jest.Mock };
    let guard: RolesGuard;

    beforeEach(() => {
      reflector = { getAllAndOverride: jest.fn() };
      guard = new RolesGuard(reflector as unknown as Reflector);
    });

    it('allows when no @Roles metadata is present', () => {
      reflector.getAllAndOverride.mockReturnValue(undefined);
      const ctx = makeContext({ req: { user: undefined } });
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('allows when @Roles is an empty array', () => {
      reflector.getAllAndOverride.mockReturnValue([]);
      const ctx = makeContext({ req: { user: undefined } });
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('forbids a non-admin user on an admin route', () => {
      reflector.getAllAndOverride.mockReturnValue(['admin']);
      const ctx = makeContext({ req: { user: { admin: false } } });
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(ctx)).toThrow('Admin only');
    });

    it('allows an admin user on an admin route', () => {
      reflector.getAllAndOverride.mockReturnValue(['admin']);
      const ctx = makeContext({ req: { user: { admin: true } } });
      expect(guard.canActivate(ctx)).toBe(true);
    });
  });

  describe('CronGuard', () => {
    let guard: CronGuard;

    beforeEach(() => {
      guard = new CronGuard(fakeConfig() as any);
    });

    it('rejects a missing x-cron-secret header', () => {
      const ctx = makeContext({ req: { headers: {} } });
      expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
      expect(() => guard.canActivate(ctx)).toThrow('Invalid cron secret');
    });

    it('rejects a wrong x-cron-secret header', () => {
      const ctx = makeContext({
        req: { headers: { 'x-cron-secret': 'nope' } },
      });
      expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
    });

    it('allows the correct x-cron-secret header', () => {
      const ctx = makeContext({
        req: { headers: { 'x-cron-secret': 'cron-secret' } },
      });
      expect(guard.canActivate(ctx)).toBe(true);
    });
  });

  describe('AllExceptionsFilter', () => {
    let logger: { setContext: jest.Mock; error: jest.Mock; warn: jest.Mock };
    let filter: AllExceptionsFilter;

    beforeEach(() => {
      logger = { setContext: jest.fn(), error: jest.fn(), warn: jest.fn() };
      filter = new AllExceptionsFilter(logger as any);
    });

    it('maps ForbiddenException to permission-denied (403) and warns', () => {
      const { host, res } = makeHost();
      filter.catch(new ForbiddenException('Admin only'), host);
      expect(res.statusCode).toBe(HttpStatus.FORBIDDEN);
      expect(res.body).toEqual({
        statusCode: HttpStatus.FORBIDDEN,
        code: 'permission-denied',
        message: 'Admin only',
      });
      expect(logger.warn).toHaveBeenCalled();
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('honors a domain-specific code carried in the exception payload', () => {
      const { host, res } = makeHost();
      filter.catch(
        new ForbiddenException({ code: 'payouts-required', message: 'no' }),
        host,
      );
      expect(res.body).toEqual({
        statusCode: HttpStatus.FORBIDDEN,
        code: 'payouts-required',
        message: 'no',
      });
    });

    it('maps a plain Error to a 500 internal error and logs error', () => {
      const { host, res } = makeHost();
      filter.catch(new Error('boom'), host);
      expect(res.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(res.body).toEqual({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        code: 'internal',
        message: 'Internal server error',
      });
      expect(logger.error).toHaveBeenCalled();
      expect(logger.warn).not.toHaveBeenCalled();
    });
  });
});
