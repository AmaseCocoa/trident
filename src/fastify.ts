import type { FastifyInstance } from 'fastify';
import { AsyncLocalStorage } from 'node:async_hooks';

const fastifyStorage = new AsyncLocalStorage<FastifyInstance>();

export function runWithFastify<T>(instance: FastifyInstance, fn: () => T): T {
  return fastifyStorage.run(instance, fn);
}

export function useFastify<T extends FastifyInstance = FastifyInstance>(): T {
  const instance = fastifyStorage.getStore();
  if (!instance) {
    throw new Error('Trident Fastify instance is only available inside endpoint methods.');
  }

  return instance as T;
}
