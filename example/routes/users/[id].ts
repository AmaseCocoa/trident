import { defineEndpoint } from 'fastify-trident';
import { z } from 'zod';

export const schema = {
  params: z.object({
    id: z.string()
  }),
  response: {
    200: z.object({
      id: z.string(),
      name: z.string()
    }),
    404: z.object({
      error: z.string()
    })
  }
};

async function findUserById(id: string) {
  if (id === "bob") {
    return {
      id: id,
      name: "Bob"
    }
  } else if (id === "alice") {
    return {
      id: id,
      name: "Alice"
    }
  }
  
  return null
}

async function deleteUser(id: string) {}

export default defineEndpoint({
  schema,
  
  async get(req, reply) {
    const { id } = req.params;
    
    const user = await findUserById(id);
    if (!user) {
      return reply.status(404).send({ error: 'ユーザーが見つかりません' });
    }
    
    return user;
  },
  
  async delete(req, reply) {
    const { id } = req.params;
    await deleteUser(id);
    return reply.status(204).send();
  }
});
