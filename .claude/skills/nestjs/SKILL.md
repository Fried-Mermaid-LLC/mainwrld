---
name: nestjs
description: >-
  Build server-side applications with NestJS (Nest) — the progressive, TypeScript-first
  Node.js framework. Use when working with `@nestjs/*` packages, the `nest` CLI
  (`nest new`, `nest g`), or any NestJS building block: controllers & routing
  (`@Controller`, `@Get`/`@Post`), providers & dependency injection (`@Injectable`,
  custom providers, injection scopes), modules (`@Module`, dynamic/shared/global modules),
  and the request pipeline — middleware, guards (`@UseGuards`), interceptors,
  pipes & validation (`ValidationPipe`, class-validator), exception filters, and custom
  decorators. Covers configuration (`@nestjs/config`), databases (TypeORM, Sequelize,
  Mongoose, Prisma, MikroORM), techniques (caching, queues/BullMQ, scheduling, events,
  logging, serialization, versioning, file upload, SSE), security (Passport/JWT auth,
  RBAC/CASL authorization, helmet, CORS, CSRF, rate limiting/throttler), GraphQL
  (code-first & schema-first, Apollo, federation), WebSockets (gateways), microservices
  (TCP/Redis/Kafka/NATS/MQTT/RabbitMQ/gRPC transporters), OpenAPI/Swagger, testing
  (`@nestjs/testing`), and deployment. Targets NestJS v11.
license: MIT
metadata:
  version: "1.0.0"
---

# NestJS — progressive Node.js framework

NestJS is a framework for building **efficient, scalable server-side Node.js applications**.
It is **TypeScript-first** (works with plain JS too), heavily **modular**, and built around
**dependency injection**. Under the hood it runs on a pluggable HTTP platform — **Express**
(default, `@nestjs/platform-express`) or **Fastify** (`@nestjs/platform-fastify`) — and the
same building blocks also power **GraphQL**, **WebSocket**, and **microservice** apps. Its
architecture is heavily inspired by Angular: decorators + DI + modules.

This skill is a faithful offline copy of the official NestJS documentation. The narrative below
is the map; **open the matching file under `references/` for exact APIs, options, and full
detail.** Start navigation at [`references/CONTENTS.md`](references/CONTENTS.md). Targets
**NestJS v11**; the live docs are at https://docs.nestjs.com.

## Mental model — three building blocks

1. **Modules** organize the app. Every app has a root `AppModule`; features get their own
   module. A `@Module({ imports, controllers, providers, exports })` declares what it owns and
   what it shares. → [`references/modules.md`](references/modules.md).
2. **Providers** hold logic and are wired by **dependency injection**. Mark a class
   `@Injectable()`, list it in a module's `providers`, and inject it via the constructor. Most
   "services", repositories, factories, and helpers are providers. → [`references/components.md`](references/components.md)
   (providers) and [`references/fundamentals/dependency-injection.md`](references/fundamentals/dependency-injection.md) (custom providers).
3. **Controllers** handle incoming requests and return responses. Decorators map routes to
   handler methods. → [`references/controllers.md`](references/controllers.md).

```typescript title="cats.controller.ts"
import { Controller, Get } from '@nestjs/common';
import { CatsService } from './cats.service';

@Controller('cats')
export class CatsController {
  constructor(private readonly catsService: CatsService) {} // DI by type

  @Get()
  findAll() {
    return this.catsService.findAll();
  }
}
```

```typescript title="cats.module.ts"
import { Module } from '@nestjs/common';

@Module({
  controllers: [CatsController],
  providers: [CatsService],   // available for DI within this module
  exports: [CatsService],     // share with modules that import this one
})
export class CatsModule {}
```

## Setup & the entry point

```bash
$ npm i -g @nestjs/cli      # the Nest CLI
$ nest new project-name     # scaffold (asks package manager; --strict for strict TS)
$ nest g resource cats      # generate a CRUD module+controller+service+DTOs
```

`main.ts` bootstraps the app with `NestFactory`:

```typescript title="main.ts"
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
```

→ [`references/first-steps.md`](references/first-steps.md). For a non-HTTP app (CLI/cron/worker),
use `NestFactory.createApplicationContext` → [`references/application-context.md`](references/application-context.md).
The CLI itself: [`references/cli/overview.md`](references/cli/overview.md) (monorepo
[workspaces](references/cli/workspaces.md), [libraries](references/cli/libraries.md)).

## The request pipeline (canonical order)

This is the single most important thing to get right. A request flows through cross-cutting
components in a **fixed order**; globals run, then controller-bound, then route-bound (filters
are the exception — they resolve route → controller → global):

1. **Middleware** — global, then module-bound (Express-style; runs before guards). → [`references/middlewares.md`](references/middlewares.md)
2. **Guards** — authorization/authentication "can this proceed?" → [`references/guards.md`](references/guards.md)
3. **Interceptors (pre)** — wrap the handler; can transform/observe. → [`references/interceptors.md`](references/interceptors.md)
4. **Pipes** — validate & transform inputs (params/body/query). → [`references/pipes.md`](references/pipes.md)
5. **Route handler** — your controller method calls providers.
6. **Interceptors (post)** — map/observe the response (RxJS, last-in-first-out).
7. **Exception filters** — only on an uncaught error; format the response. → [`references/exception-filters.md`](references/exception-filters.md)

Bind any of them at three levels: **global** (`app.useGlobalX()` or an `APP_*` provider token),
**controller** (decorator on the class), or **route** (decorator on the method). Read the exact
ordering rules — especially for pipes & interceptors — in [`references/faq/request-lifecycle.md`](references/faq/request-lifecycle.md).
Build your own request-shaped logic with [custom decorators](references/custom-decorators.md)
and the [execution context](references/fundamentals/execution-context.md) (`ExecutionContext`,
`Reflector` for reading metadata set by `@SetMetadata`).

## Dependency injection & fundamentals

DI is resolved by **type** (the constructor param's class) or by **token** (`@Inject(TOKEN)`).
A provider is visible only within its module unless `exports`-ed and the consumer's module
`imports` it.

- **Custom providers** — `useClass` / `useValue` / `useFactory` (with `inject`) / `useExisting`,
  and non-class tokens. → [`references/fundamentals/dependency-injection.md`](references/fundamentals/dependency-injection.md)
- **Async providers** — `useFactory` returning a Promise (e.g. wait for a DB connection). → [`references/fundamentals/async-components.md`](references/fundamentals/async-components.md)
- **Dynamic modules** — `Module.forRoot()/forFeature()` configurable modules. → [`references/fundamentals/dynamic-modules.md`](references/fundamentals/dynamic-modules.md)
- **Injection scopes** — `DEFAULT` (singleton), `REQUEST`, `TRANSIENT`. Request scope has a
  perf cost and bubbles up. → [`references/fundamentals/provider-scopes.md`](references/fundamentals/provider-scopes.md)
- **Circular dependency** — break with `forwardRef()`. → [`references/fundamentals/circular-dependency.md`](references/fundamentals/circular-dependency.md)
- **Module reference** — resolve providers imperatively with `ModuleRef`. → [`references/fundamentals/module-reference.md`](references/fundamentals/module-reference.md)
- **Lifecycle hooks** — `OnModuleInit`, `OnApplicationBootstrap`, `OnModuleDestroy`, `OnApplicationShutdown` (enable shutdown hooks for the last). → [`references/fundamentals/lifecycle-events.md`](references/fundamentals/lifecycle-events.md)
- Also: [lazy-loading modules](references/fundamentals/lazy-loading-modules.md), [discovery service](references/fundamentals/discovery-service.md), [platform agnosticism](references/fundamentals/platform-agnosticism.md).

## Validation, configuration & databases

- **Validation** — the global `ValidationPipe` + `class-validator`/`class-transformer`
  decorators on DTOs (`whitelist`, `transform`, `forbidNonWhitelisted`). → [`references/techniques/validation.md`](references/techniques/validation.md)
- **Configuration** — `@nestjs/config` `ConfigModule.forRoot()` + `ConfigService`, `.env`,
  validation schema, namespaced config. → [`references/techniques/configuration.md`](references/techniques/configuration.md)
- **SQL (TypeORM / Sequelize)** — `@nestjs/typeorm`, `forRoot`/`forFeature`, repositories,
  entities. → [`references/techniques/sql.md`](references/techniques/sql.md) · recipes:
  [TypeORM](references/recipes/sql-typeorm.md), [Sequelize](references/recipes/sql-sequelize.md),
  [Prisma](references/recipes/prisma.md), [MikroORM](references/recipes/mikroorm.md).
- **MongoDB (Mongoose)** — `@nestjs/mongoose`, schemas, models. → [`references/techniques/mongo.md`](references/techniques/mongo.md)

## More techniques

[Caching](references/techniques/caching.md) · [Queues / BullMQ](references/techniques/queues.md) ·
[Task scheduling / cron](references/techniques/task-scheduling.md) · [Events](references/techniques/events.md) ·
[Logger](references/techniques/logger.md) · [Serialization](references/techniques/serialization.md) (`ClassSerializerInterceptor`) ·
[Versioning](references/techniques/versioning.md) · [File upload](references/techniques/file-upload.md) ·
[Streaming files](references/techniques/streaming-files.md) · [Server-Sent Events](references/techniques/server-sent-events.md) ·
[Cookies](references/techniques/cookies.md) · [Sessions](references/techniques/sessions.md) ·
[Compression](references/techniques/compression.md) · [HTTP module](references/techniques/http-module.md) (`HttpService`/axios) ·
[MVC](references/techniques/mvc.md) · [Performance (Fastify)](references/techniques/performance.md).

## Security

[Authentication](references/security/authentication.md) (Passport strategies, JWT, `@nestjs/passport`/`@nestjs/jwt`; full Passport recipe: [`references/recipes/passport.md`](references/recipes/passport.md)) ·
[Authorization](references/security/authorization.md) (RBAC, claims, CASL) ·
[Rate limiting](references/security/rate-limiting.md) (`@nestjs/throttler`) ·
[Helmet](references/security/helmet.md) · [CORS](references/security/cors.md) · [CSRF](references/security/csrf.md) ·
[Encryption & hashing](references/security/encryption-hashing.md). Auth is typically a **guard**;
authorization combines a guard with metadata read via `Reflector`.

## GraphQL, WebSockets & microservices

- **GraphQL** — `@nestjs/graphql` with the Apollo (or Mercurius) driver; **code-first**
  (decorators + generated SDL) or **schema-first**. Resolvers, mutations, subscriptions,
  federation. → [`references/graphql/quick-start.md`](references/graphql/quick-start.md) and the
  rest of `references/graphql/`.
- **WebSockets** — `@WebSocketGateway()` gateways (socket.io or ws), with the same
  guards/pipes/interceptors/filters model. → [`references/websockets/gateways.md`](references/websockets/gateways.md).
- **Microservices** — `@nestjs/microservices`; choose a transporter (TCP, Redis, NATS, MQTT,
  RabbitMQ, Kafka, gRPC) and use `@MessagePattern` (request-response) vs `@EventPattern`
  (event). → [`references/microservices/basics.md`](references/microservices/basics.md) and the
  per-transport pages.

## OpenAPI, testing & deployment

- **OpenAPI / Swagger** — `@nestjs/swagger` `SwaggerModule`, `@ApiProperty()` etc., and the CLI
  plugin that auto-infers schemas. → [`references/openapi/introduction.md`](references/openapi/introduction.md).
- **Testing** — `@nestjs/testing` `Test.createTestingModule(...)`, `.overrideProvider(...)`,
  unit + e2e (`supertest`). → [`references/fundamentals/unit-testing.md`](references/fundamentals/unit-testing.md)
  · [Automock/Suites](references/recipes/suites.md).
- **Deployment** → [`references/deployment.md`](references/deployment.md); serverless → [`references/faq/serverless.md`](references/faq/serverless.md);
  **Devtools** graph → [`references/devtools/overview.md`](references/devtools/overview.md).

## Recipes

Task-oriented guides: [`references/recipes/`](references/recipes/) — CRUD generator, REPL, CQRS,
SWC builder, hot reload, health checks (Terminus), Sentry, serve-static, router module,
nest-commander, async local storage, Compodoc, and more. Browse [`references/CONTENTS.md`](references/CONTENTS.md).

## Gotchas

- **"Nest can't resolve dependencies of X"** — the dependency isn't a `provider` in the current
  module, or its owning module doesn't `exports` it and isn't `imports`-ed. Check the module
  graph first. → [`references/faq/errors.md`](references/faq/errors.md)
- **Decorators need TS config** — `experimentalDecorators` + `emitDecoratorMetadata`, and
  `reflect-metadata` imported once. DI by type relies on emitted metadata.
- **Global pipes/guards/etc. set via `app.useGlobalX()` can't inject** — to use DI in a global,
  register it as an `APP_PIPE` / `APP_GUARD` / `APP_INTERCEPTOR` / `APP_FILTER` provider instead.
- **`ValidationPipe` does nothing useful without DTOs** decorated with `class-validator`, and
  needs `transform: true` to instantiate DTO classes / coerce types. Use `whitelist` to strip
  unknown props.
- **Circular `imports`/providers** — use `forwardRef()` on both sides; prefer restructuring.
- **Request-scoped providers** make the whole injection chain request-scoped — measurable
  overhead; keep them shallow.
- **Pipe & interceptor binding order is not simply top-to-bottom** — parameter pipes resolve
  last-param-to-first; read [`references/faq/request-lifecycle.md`](references/faq/request-lifecycle.md).
- **Keep `@nestjs/*` versions aligned** (core/common/platform and the ecosystem packages move
  together across majors). This bundle targets **v11**.

## Provenance

`references/` is converted from the official **[nestjs/docs.nestjs.com](https://github.com/nestjs/docs.nestjs.com)**
`content/` source (the same Markdown that powers https://docs.nestjs.com) by
`tools/build_references.py` — the TS/JS `@@switch` snippets are reduced to their canonical
**TypeScript** form, promo banners are dropped, and links are absolutized to the live site.
Every page keeps a `> Source:` link to its upstream file on GitHub. Redistributed under the
upstream **MIT license** (Kamil Myśliwiec) — see [`references/LICENSE`](references/LICENSE).
