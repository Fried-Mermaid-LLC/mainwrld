# NestJS documentation — reference index

Faithful Markdown conversion of the official NestJS documentation (https://docs.nestjs.com), generated from the [nestjs/docs.nestjs.com](https://github.com/nestjs/docs.nestjs.com) `content/` source by `tools/build_references.py`. Each file keeps a `> Source:` link to its upstream file on GitHub. See `LICENSE` (MIT, Kamil Myśliwiec).

Targets **NestJS v11**. **136 pages.**

## Introduction

- [Introduction](introduction.md) — `introduction.md`

## Overview

- [First steps](first-steps.md) — `first-steps.md`
- [Controllers](controllers.md) — `controllers.md`
- [Providers](components.md) — `components.md`
- [Modules](modules.md) — `modules.md`
- [Middleware](middlewares.md) — `middlewares.md`
- [Exception filters](exception-filters.md) — `exception-filters.md`
- [Pipes](pipes.md) — `pipes.md`
- [Guards](guards.md) — `guards.md`
- [Interceptors](interceptors.md) — `interceptors.md`
- [Custom route decorators](custom-decorators.md) — `custom-decorators.md`

## Fundamentals

- [Custom providers](fundamentals/dependency-injection.md) — `fundamentals/dependency-injection.md`
- [Asynchronous providers](fundamentals/async-components.md) — `fundamentals/async-components.md`
- [Dynamic modules](fundamentals/dynamic-modules.md) — `fundamentals/dynamic-modules.md`
- [Injection scopes](fundamentals/provider-scopes.md) — `fundamentals/provider-scopes.md`
- [Circular dependency](fundamentals/circular-dependency.md) — `fundamentals/circular-dependency.md`
- [Module reference](fundamentals/module-reference.md) — `fundamentals/module-reference.md`
- [Lazy loading modules](fundamentals/lazy-loading-modules.md) — `fundamentals/lazy-loading-modules.md`
- [Execution context](fundamentals/execution-context.md) — `fundamentals/execution-context.md`
- [Lifecycle Events](fundamentals/lifecycle-events.md) — `fundamentals/lifecycle-events.md`
- [Discovery service](fundamentals/discovery-service.md) — `fundamentals/discovery-service.md`
- [Platform agnosticism](fundamentals/platform-agnosticism.md) — `fundamentals/platform-agnosticism.md`
- [Testing](fundamentals/unit-testing.md) — `fundamentals/unit-testing.md`

## Techniques

- [Configuration](techniques/configuration.md) — `techniques/configuration.md`
- [Database](techniques/sql.md) — `techniques/sql.md`
- [Mongo](techniques/mongo.md) — `techniques/mongo.md`
- [Validation](techniques/validation.md) — `techniques/validation.md`
- [Caching](techniques/caching.md) — `techniques/caching.md`
- [Serialization](techniques/serialization.md) — `techniques/serialization.md`
- [Versioning](techniques/versioning.md) — `techniques/versioning.md`
- [Task scheduling](techniques/task-scheduling.md) — `techniques/task-scheduling.md`
- [Queues](techniques/queues.md) — `techniques/queues.md`
- [Logger](techniques/logger.md) — `techniques/logger.md`
- [Cookies](techniques/cookies.md) — `techniques/cookies.md`
- [Events](techniques/events.md) — `techniques/events.md`
- [Compression](techniques/compression.md) — `techniques/compression.md`
- [File upload](techniques/file-upload.md) — `techniques/file-upload.md`
- [Streaming files](techniques/streaming-files.md) — `techniques/streaming-files.md`
- [HTTP module](techniques/http-module.md) — `techniques/http-module.md`
- [Session](techniques/sessions.md) — `techniques/sessions.md`
- [Model-View-Controller](techniques/mvc.md) — `techniques/mvc.md`
- [Performance (Fastify)](techniques/performance.md) — `techniques/performance.md`
- [Server-Sent Events](techniques/server-sent-events.md) — `techniques/server-sent-events.md`

## Security

- [Authentication](security/authentication.md) — `security/authentication.md`
- [Authorization](security/authorization.md) — `security/authorization.md`
- [Encryption and Hashing](security/encryption-hashing.md) — `security/encryption-hashing.md`
- [Helmet](security/helmet.md) — `security/helmet.md`
- [CORS](security/cors.md) — `security/cors.md`
- [CSRF Protection](security/csrf.md) — `security/csrf.md`
- [Rate Limiting](security/rate-limiting.md) — `security/rate-limiting.md`

## GraphQL

- [Harnessing the power of TypeScript & GraphQL](graphql/quick-start.md) — `graphql/quick-start.md`
- [Resolvers](graphql/resolvers-map.md) — `graphql/resolvers-map.md`
- [Mutations](graphql/mutations.md) — `graphql/mutations.md`
- [Subscriptions](graphql/subscriptions.md) — `graphql/subscriptions.md`
- [Scalars](graphql/scalars.md) — `graphql/scalars.md`
- [Directives](graphql/directives.md) — `graphql/directives.md`
- [Interfaces](graphql/interfaces.md) — `graphql/interfaces.md`
- [Unions](graphql/unions-and-enums.md) — `graphql/unions-and-enums.md`
- [Field middleware](graphql/field-middleware.md) — `graphql/field-middleware.md`
- [Mapped types](graphql/mapped-types.md) — `graphql/mapped-types.md`
- [Plugins with Apollo](graphql/plugins.md) — `graphql/plugins.md`
- [Complexity](graphql/complexity.md) — `graphql/complexity.md`
- [Extensions](graphql/extensions.md) — `graphql/extensions.md`
- [CLI Plugin](graphql/cli-plugin.md) — `graphql/cli-plugin.md`
- [Generating SDL](graphql/schema-generator.md) — `graphql/schema-generator.md`
- [Sharing models](graphql/sharing-models.md) — `graphql/sharing-models.md`
- [Other features](graphql/guards-interceptors.md) — `graphql/guards-interceptors.md`
- [Federation](graphql/federation.md) — `graphql/federation.md`

## WebSockets

- [Gateways](websockets/gateways.md) — `websockets/gateways.md`
- [Exception filters](websockets/exception-filters.md) — `websockets/exception-filters.md`
- [Pipes](websockets/pipes.md) — `websockets/pipes.md`
- [Guards](websockets/guards.md) — `websockets/guards.md`
- [Interceptors](websockets/interceptors.md) — `websockets/interceptors.md`
- [Adapters](websockets/adapter.md) — `websockets/adapter.md`

## Microservices

- [Overview](microservices/basics.md) — `microservices/basics.md`
- [Redis](microservices/redis.md) — `microservices/redis.md`
- [MQTT](microservices/mqtt.md) — `microservices/mqtt.md`
- [NATS](microservices/nats.md) — `microservices/nats.md`
- [RabbitMQ](microservices/rabbitmq.md) — `microservices/rabbitmq.md`
- [Kafka](microservices/kafka.md) — `microservices/kafka.md`
- [gRPC](microservices/grpc.md) — `microservices/grpc.md`
- [Custom transporters](microservices/custom-transport.md) — `microservices/custom-transport.md`
- [Exception filters](microservices/exception-filters.md) — `microservices/exception-filters.md`
- [Pipes](microservices/pipes.md) — `microservices/pipes.md`
- [Guards](microservices/guards.md) — `microservices/guards.md`
- [Interceptors](microservices/interceptors.md) — `microservices/interceptors.md`

## Deployment

- [Deployment](deployment.md) — `deployment.md`

## Standalone applications

- [Standalone applications](application-context.md) — `application-context.md`

## CLI

- [Overview](cli/overview.md) — `cli/overview.md`
- [Workspaces](cli/workspaces.md) — `cli/workspaces.md`
- [Libraries](cli/libraries.md) — `cli/libraries.md`
- [CLI command reference](cli/usages.md) — `cli/usages.md`
- [Nest CLI and scripts](cli/scripts.md) — `cli/scripts.md`

## OpenAPI

- [Introduction](openapi/introduction.md) — `openapi/introduction.md`
- [Types and parameters](openapi/types-and-parameters.md) — `openapi/types-and-parameters.md`
- [Operations](openapi/operations.md) — `openapi/operations.md`
- [Security](openapi/security.md) — `openapi/security.md`
- [Mapped types](openapi/mapped-types.md) — `openapi/mapped-types.md`
- [Decorators](openapi/decorators.md) — `openapi/decorators.md`
- [CLI Plugin](openapi/cli-plugin.md) — `openapi/cli-plugin.md`
- [Other features](openapi/other-features.md) — `openapi/other-features.md`

## Recipes

- [Read-Eval-Print-Loop (REPL)](recipes/repl.md) — `recipes/repl.md`
- [CRUD generator (TypeScript only)](recipes/crud-generator.md) — `recipes/crud-generator.md`
- [SWC](recipes/swc.md) — `recipes/swc.md`
- [Passport (authentication)](recipes/passport.md) — `recipes/passport.md`
- [Hot Reload](recipes/hot-reload.md) — `recipes/hot-reload.md`
- [MikroORM](recipes/mikroorm.md) — `recipes/mikroorm.md`
- [SQL (TypeORM)](recipes/sql-typeorm.md) — `recipes/sql-typeorm.md`
- [MongoDB (Mongoose)](recipes/mongodb.md) — `recipes/mongodb.md`
- [SQL (Sequelize)](recipes/sql-sequelize.md) — `recipes/sql-sequelize.md`
- [Router module](recipes/router-module.md) — `recipes/router-module.md`
- [Documentation](recipes/documentation.md) — `recipes/documentation.md`
- [CQRS](recipes/cqrs.md) — `recipes/cqrs.md`
- [Prisma](recipes/prisma.md) — `recipes/prisma.md`
- [Sentry](recipes/sentry.md) — `recipes/sentry.md`
- [Serve Static](recipes/serve-static.md) — `recipes/serve-static.md`
- [Nest Commander](recipes/nest-commander.md) — `recipes/nest-commander.md`
- [Async Local Storage](recipes/async-local-storage.md) — `recipes/async-local-storage.md`
- [Necord](recipes/necord.md) — `recipes/necord.md`
- [Suites](recipes/suites.md) — `recipes/suites.md`
- [Healthchecks (Terminus)](recipes/terminus.md) — `recipes/terminus.md`

## FAQ

- [Serverless](faq/serverless.md) — `faq/serverless.md`
- [HTTP adapter](faq/http-adapter.md) — `faq/http-adapter.md`
- [Keep alive connections](faq/keep-alive-connections.md) — `faq/keep-alive-connections.md`
- [Global prefix](faq/global-prefix.md) — `faq/global-prefix.md`
- [Raw body](faq/raw-body.md) — `faq/raw-body.md`
- [Hybrid application](faq/hybrid-application.md) — `faq/hybrid-application.md`
- [HTTPS](faq/multiple-servers.md) — `faq/multiple-servers.md`
- [Request lifecycle](faq/request-lifecycle.md) — `faq/request-lifecycle.md`
- [Common errors](faq/errors.md) — `faq/errors.md`

## Devtools

- [Overview](devtools/overview.md) — `devtools/overview.md`
- [CI/CD integration](devtools/ci-cd.md) — `devtools/ci-cd.md`

## Migration guide

- [Migration guide](migration.md) — `migration.md`

## Discover & support

- [Who is using Nest?](discover/who-uses.md) — `discover/who-uses.md`
- [Official NestJS Consulting](enterprise.md) — `enterprise.md`
- [Support](support.md) — `support.md`

