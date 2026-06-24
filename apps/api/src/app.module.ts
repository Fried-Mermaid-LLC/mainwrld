import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { AppConfigModule } from './infra/config/config.module';
import type { AppConfiguration } from './infra/config/configuration';
import { FirebaseModule } from './infra/firebase/firebase.module';
import { AuthGuard } from './infra/auth/auth.guard';
import { RolesGuard } from './infra/auth/roles.guard';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { HealthModule } from './health/health.module';
import { EmailModule } from './shared/email/email.module';
import { ProfanityModule } from './shared/profanity/profanity.module';
import { ModerationModule } from './modules/moderation/moderation.module';
import { RewardsModule } from './modules/rewards/rewards.module';
import { BooksModule } from './modules/books/books.module';
import { SpotlightModule } from './modules/spotlight/spotlight.module';
import { SocialModule } from './modules/social/social.module';
import { CommentsModule } from './modules/comments/comments.module';
import { ReportsModule } from './modules/reports/reports.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { UsersModule } from './modules/users/users.module';
import { ChaptersModule } from './modules/chapters/chapters.module';
import { PublicModule } from './modules/public/public.module';
import { AuthApiModule } from './modules/auth/auth.module';
import { AdminModule } from './modules/admin/admin.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { MembershipModule } from './modules/membership/membership.module';
import { IapModule } from './modules/iap/iap.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { ChatModule } from './modules/chat/chat.module';
import { PresenceModule } from './modules/presence/presence.module';
import { SchedulerModule } from './modules/scheduler/scheduler.module';
import { StreamModule } from './modules/stream/stream.module';

@Module({
  imports: [
    AppConfigModule,
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfiguration, true>) => ({
        pinoHttp: {
          level:
            config.get('nodeEnv', { infer: true }) === 'production'
              ? 'info'
              : 'debug',
          // Cloud Logging reads `message`; keep auth tokens out of logs.
          messageKey: 'message',
          redact: ['req.headers.authorization'],
        },
      }),
    }),
    FirebaseModule,
    EmailModule,
    ProfanityModule,
    ModerationModule,
    RewardsModule,
    BooksModule,
    SpotlightModule,
    SocialModule,
    CommentsModule,
    ReportsModule,
    NotificationsModule,
    UsersModule,
    ChaptersModule,
    PublicModule,
    AuthApiModule,
    AdminModule,
    PaymentsModule,
    MembershipModule,
    IapModule,
    WebhooksModule,
    ChatModule,
    PresenceModule,
    SchedulerModule,
    StreamModule,
    HealthModule,
  ],
  providers: [
    // Order matters: AuthGuard populates req.user, RolesGuard reads it.
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
