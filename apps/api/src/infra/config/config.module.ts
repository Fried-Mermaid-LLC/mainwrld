import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { configuration } from './configuration';

// Global config: loads + validates env once (cached) into the typed nested
// shape from `configuration()`. Inject `ConfigService<AppConfiguration, true>`
// anywhere and read with `{ infer: true }`.
@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [configuration],
    }),
  ],
})
export class AppConfigModule {}
