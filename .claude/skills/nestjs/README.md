# NestJS — a Claude skill for the NestJS framework

A Claude skill for building server-side applications with **[NestJS](https://nestjs.com)** — the
progressive, TypeScript-first Node.js framework. It bundles a faithful, offline copy of the
official NestJS documentation as structured references, with a concise guide on top.

> Repository overview, installation, and details live in the [root README](../../README.md).

## What it does

Activates when you ask Claude about NestJS, `@nestjs/*` packages, or the `nest` CLI, and answers
from the real documentation:

- **Building blocks** — controllers & routing, providers & **dependency injection**, modules
  (shared, global, dynamic)
- **The request pipeline** — middleware → guards → interceptors → pipes → handler → interceptors →
  exception filters, with the canonical execution order
- **Techniques** — configuration, databases (TypeORM/Sequelize/Mongoose/Prisma/MikroORM), caching,
  queues, scheduling, events, logging, serialization, versioning, file upload, SSE
- **Security** — Passport/JWT auth, RBAC/CASL authorization, helmet, CORS, CSRF, rate limiting
- **GraphQL, WebSockets, microservices, OpenAPI/Swagger, testing, the CLI, and deployment**

## Contents

- [`SKILL.md`](SKILL.md) — the guide Claude loads on trigger (workflow + a map into `references/`)
- [`references/`](references/) — 136 pages of faithful Markdown converted from the NestJS docs
  - [`references/CONTENTS.md`](references/CONTENTS.md) — full navigation in the sidebar order
  - [`references/LICENSE`](references/LICENSE) — upstream documentation license (MIT, Kamil Myśliwiec)

## Installation

```bash
# Via npx skills
npx skills add iamursky/nestjs-skill

# Or manually for Claude Code
git clone https://github.com/iamursky/nestjs-skill ~/nestjs-skill
ln -s ~/nestjs-skill/skills/nestjs ~/.claude/skills/nestjs
```

For Claude Desktop / Web, upload [`SKILL.md`](SKILL.md) via **Customize → Skills → + → Upload a skill**.

## Provenance & license

`references/` is converted from the official
[nestjs/docs.nestjs.com](https://github.com/nestjs/docs.nestjs.com) `content/` source (the dialect
Markdown → plain Markdown), redistributed under the upstream **MIT** license
([`references/LICENSE`](references/LICENSE), © Kamil Myśliwiec); each page links back to its file on
GitHub. Targets **NestJS v11**. The skill itself is MIT — see the [root license](../../license).

> Unofficial, community-built skill. Not affiliated with or endorsed by NestJS or Kamil Myśliwiec.
