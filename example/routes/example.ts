import { defineEndpoint } from 'fastify-trident';
import { z } from 'zod';

export const schema = {
  post: {
    body: z.object({
      name: z.string().min(1, '名前は必須です'),
      email: z.email('有効なメールアドレスを入力してください')
    }),
    response: {
      201: z.object({
        id: z.string(),
        name: z.string(),
        email: z.string()
      })
    }
  },

  get: {
    querystring: z.object({
      limit: z.coerce.number().int().positive().default(10),
      offset: z.coerce.number().int().nonnegative().default(0)
    }),
    response: {
      200: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          email: z.string()
        })
      )
    }
  }
};

export default defineEndpoint({
  schema,

  async post(req, reply) {
    const { name, email } = req.body;

    const user = {
      id: crypto.randomUUID?.() || 'uuid-' + Date.now(),
      name,
      email
    };

    return reply.status(201).send(user);
  },

  async get(req, reply) {
    const { limit, offset } = req.query;

    const users = [
      { id: '1', name: 'Alice', email: 'alice@example.com' },
      { id: '2', name: 'Bob', email: 'bob@example.com' },
      { id: '3', name: 'Charlie', email: 'charlie@example.com' }
    ];

    return users.slice(offset, offset + limit);
  }
});
