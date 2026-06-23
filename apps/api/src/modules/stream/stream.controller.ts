import { Controller, type MessageEvent, Sse } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { CurrentUser } from '../../infra/auth/auth.decorators';
import type { AuthUser } from '../../infra/auth/auth-user.interface';
import { requireUsername } from '../../infra/auth/require-username';
import { StreamService } from './stream.service';

// SSE endpoints. Authenticated via the global AuthGuard (Bearer from the
// client's fetch-event-source — EventSource can't carry headers).
@ApiTags('stream')
@ApiBearerAuth()
@Controller({ path: 'stream', version: '1' })
export class StreamController {
  constructor(private readonly stream: StreamService) {}

  @Sse('chat')
  chat(@CurrentUser() user: AuthUser): Observable<MessageEvent> {
    return this.stream.chatStream(requireUsername(user));
  }

  @Sse('notifications')
  notifications(@CurrentUser() user: AuthUser): Observable<MessageEvent> {
    return this.stream.notificationStream(requireUsername(user));
  }
}
