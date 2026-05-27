import { defineEndpoint } from 'fastify-trident';
import { z } from 'zod';

export const schema = {
  querystring: z.object({
    q: z.string().min(1),
    limit: z.coerce.number().int().positive().default(10),
    offset: z.coerce.number().int().nonnegative().default(0)
  })
};

async function searchUsers(q: string, limit: number, offset: number) {
  return [
    1,
    2,
    3,
    4,
    5
  ]
}

export default defineEndpoint({
  schema,
  
  async get(req, reply) {
    const { q, limit, offset } = req.query;
    
    const results = await searchUsers(q, limit, offset);
    return results;
  }
});
