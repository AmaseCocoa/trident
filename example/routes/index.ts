import { defineEndpoint } from 'fastify-trident';

export default defineEndpoint({
  get: async (req, reply) => {
    return { message: 'Hello World' };
  }
});
