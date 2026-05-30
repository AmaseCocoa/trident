# fastify-trident

One-file, one-endpoint routing for Fastify with Zod validation, scoped plugins, and queues.

## Install

```bash
pnpm add fastify-trident
```

## Quick Start

```ts
import Fastify from 'fastify';
import trident from 'fastify-trident';

const app = Fastify({ logger: true });

app.register(trident, { mode: 'all' });

app.listen({ port: 3000, host: '0.0.0.0' });
```

Routes live under `src/routes` by default.

## File-Based Routes

Each route file exports a default `defineEndpoint` object.

```ts
import { defineEndpoint } from 'fastify-trident';

export default defineEndpoint({
  get: async () => ({ message: 'Hello' })
});
```

Dynamic params are supported via `[param]`:

```
src/routes/users/[id].ts  ->  GET /users/:id
```

## Validation

Attach Zod schemas per method (or shared).

```ts
import { defineEndpoint } from 'fastify-trident';
import { z } from 'zod';

export default defineEndpoint({
  schema: {
    post: {
      body: z.object({ name: z.string() })
    }
  },
  post: async (req, reply) => {
    return reply.status(201).send({ ok: true });
  }
});
```

## Endpoint Hooks (Method Level)

Define Fastify hooks per method.

```ts
import { defineEndpoint } from 'fastify-trident';

export default defineEndpoint({
  hooks: {
    get: {
      preHandler: async (req, reply) => {
        reply.header('x-hooked', 'true');
      }
    }
  },
  get: async () => ({ ok: true })
});
```

Only `preHandler` is applied at the route level. Other hook names are accepted by type but are not wired yet.

## Scoped Plugins and Middleware

Place `_plugin.ts` or `_middleware.ts` in a directory to apply to that subtree.

```
src/routes/_plugin.ts
src/routes/users/_middleware.ts
```

- `_plugin.ts` must export a default Fastify plugin (`FastifyPluginAsync`).
- `_middleware.ts` must export a default `preHandler` hook.

## Options

```ts
app.register(trident, {
  mode: 'all',
  routesDir: 'src/routes',
  queue: {
    dir: 'src/queues',
    bullmq: { connection: { host: 'localhost', port: 6379 } }
  }
});
```

## License

MIT
