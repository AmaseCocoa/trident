import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { registerTridentRoutes } from './router';
import { registerTridentQueues, TridentBullMQOptions } from './queue';

export type TridentRunMode = 'all' | 'server' | 'jobs';

export type TridentPluginOptions = {
  routesDir?: string;
  queuesDir?: string;
  mode?: TridentRunMode;
  bullmq?: TridentBullMQOptions;
};

export const tridentPlugin: FastifyPluginAsync<TridentPluginOptions> = async (
  app,
  options
) => {
  const resolvedMode = options.mode ?? 'all';

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof z.ZodError) {
      reply.status(400).send({ error: 'ValidationError', issues: error.issues });
      return;
    }
    request.log.error(error);
    reply.status(500).send({ error: 'InternalServerError' });
  });

  if (resolvedMode === 'all' || resolvedMode === 'jobs') {
    await registerTridentQueues({
      queuesDir: options.queuesDir,
      bullmq: options.bullmq
    });
  }
  if (resolvedMode === 'all' || resolvedMode === 'server') {
    await registerTridentRoutes(app, { routesDir: options.routesDir });
  }
};

export default tridentPlugin;
