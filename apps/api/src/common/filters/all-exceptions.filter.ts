import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { PinoLogger } from 'nestjs-pino';

// Stable string codes the client maps to the legacy callable error semantics
// (e.g. `permission-denied`, `failed-precondition`). Mirrors the HttpsError
// vocabulary the app already branches on.
const STATUS_TO_CODE: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'invalid-argument',
  [HttpStatus.UNAUTHORIZED]: 'unauthenticated',
  [HttpStatus.FORBIDDEN]: 'permission-denied',
  [HttpStatus.NOT_FOUND]: 'not-found',
  [HttpStatus.CONFLICT]: 'already-exists',
  [HttpStatus.PRECONDITION_FAILED]: 'failed-precondition',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'invalid-argument',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'failed-precondition',
  [HttpStatus.TOO_MANY_REQUESTS]: 'resource-exhausted',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'unavailable',
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'internal',
};

interface ErrorBody {
  statusCode: number;
  code: string;
  message: string;
}

// Normalizes every thrown error into `{ statusCode, code, message }`. Services
// may throw a native Nest exception with a `{ code, message }` payload to carry
// a domain-specific code (e.g. `payouts-required`); otherwise the code is
// derived from the HTTP status.
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(AllExceptionsFilter.name);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const body = this.toBody(exception);

    if (body.statusCode >= 500) {
      this.logger.error(
        { err: exception, path: req.url, method: req.method },
        body.message,
      );
    } else {
      this.logger.warn(
        { path: req.url, method: req.method, code: body.code },
        body.message,
      );
    }

    res.status(body.statusCode).json(body);
  }

  private toBody(exception: unknown): ErrorBody {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      let code = STATUS_TO_CODE[status] ?? 'error';
      let message = exception.message;

      if (typeof response === 'object' && response !== null) {
        const r = response as Record<string, unknown>;
        if (typeof r.code === 'string') code = r.code;
        if (typeof r.message === 'string') message = r.message;
        else if (Array.isArray(r.message)) message = r.message.join(', ');
      }
      return { statusCode: status, code, message };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'internal',
      message: 'Internal server error',
    };
  }
}
