import type { FastifyPluginAsync } from 'fastify';

const plugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorate('tridentUsersScope', true);
};

export default plugin;
