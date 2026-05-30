import type { FastifyPluginAsync } from 'fastify';

const plugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorate('tridentExampleRoot', true);
};

export default plugin;
