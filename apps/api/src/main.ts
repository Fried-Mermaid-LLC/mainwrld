import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import type { AppConfiguration } from './infra/config/configuration';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    // Preserve the raw request body so the Stripe webhook can verify the HMAC
    // signature against the exact bytes Stripe signed.
    rawBody: true,
  });

  app.useLogger(app.get(Logger));

  const config: ConfigService<AppConfiguration, true> = app.get(ConfigService);

  // Book/chapter payloads can be large; lift the default 100kb limit.
  app.useBodyParser('json', { limit: '5mb' });
  app.useBodyParser('urlencoded', { extended: true, limit: '5mb' });

  // `/api/v1/...` for features; health probes stay at the root.
  app.setGlobalPrefix('api', { exclude: ['healthz', 'readyz'] });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.useGlobalPipes(
    new ValidationPipe({
      // whitelist strips unknown props; NOT forbidNonWhitelisted — the client
      // sends rich legacy objects (e.g. full book docs) and extra fields should
      // be dropped silently, not rejected. Server-managed fields are guarded by
      // per-domain denylists (books/users/chapters), not the pipe.
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const corsOrigins = config.get('corsOrigins', { infer: true });
  app.enableCors({
    origin: corsOrigins.length ? corsOrigins : true,
    allowedHeaders: ['Authorization', 'Content-Type'],
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });

  app.enableShutdownHooks();

  if (config.get('nodeEnv', { infer: true }) !== 'production') {
    const docConfig = new DocumentBuilder()
      .setTitle('MainWRLD API')
      .setDescription('REST API backing apps/app (firebase-admin)')
      .setVersion('1')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, docConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = config.get('port', { infer: true });
  await app.listen(port);
}

void bootstrap();
