import path from 'path';

import { Queue, Worker, Job } from 'bullmq';
import { globSync } from 'glob';
import { z } from 'zod';

import type { QueueOptions, WorkerOptions, ConnectionOptions } from 'bullmq';

const redisConnection = {
  host: 'localhost',
  port: 6379
};

const queueRegistry: Record<string, Queue> = {};


export type TridentBullMQOptions = {
  connection?: ConnectionOptions;
  queue?: Omit<QueueOptions, 'connection'>;
  worker?: Omit<WorkerOptions, 'connection'>;
};

export type TridentQueueOptions = {
  dir?: string;
  bullmq?: TridentBullMQOptions;
}

export interface TridentQueueMap {}

export type QueueData<Name extends keyof TridentQueueMap> = TridentQueueMap[Name] extends {
  data: infer Data;
}
  ? Data
  : unknown;

export function defineJob<T extends z.ZodTypeAny>(config: {
  dataSchema: T;
  handler: (job: Job<z.infer<T>>) => Promise<void>;
}) {
  return config;
}

export function useQueue<Name extends keyof TridentQueueMap>(
  queueName: Name
): Queue<QueueData<Name>>;
export function useQueue(queueName: string): Queue;
export function useQueue(queueName: string): Queue {
  const queue = queueRegistry[queueName];
  if (!queue) {
    throw new Error(`Trident Queue "${queueName}" was not found.`);
  }
  return queue;
}

export async function registerTridentQueues(options?: {
  queuesDir?: string;
  bullmq?: TridentBullMQOptions;
}) {
  const queuesDir = options?.queuesDir ?? 'src/queues';
  const connection = options?.bullmq?.connection ?? redisConnection;
  const queueOptions: QueueOptions = {
    connection,
    ...(options?.bullmq?.queue ?? {})
  };
  const workerOptions: WorkerOptions = {
    connection,
    ...(options?.bullmq?.worker ?? {})
  };
  const queuePattern = path.join(queuesDir, '**/*.ts').replace(/\\/g, '/');
  const files = globSync(queuePattern, { nodir: true });

  for (const file of files) {
    const queueName = path.basename(file, '.ts');
    const jobModule = await import(path.resolve(file));
    const jobConfig = jobModule.default as
      | ReturnType<typeof defineJob<z.ZodTypeAny>>
      | undefined;
    if (!jobConfig) continue;

    queueRegistry[queueName] = new Queue(queueName, queueOptions);

    new Worker(
      queueName,
      async (job) => {
        const parsed = jobConfig.dataSchema.safeParse(job.data);
        if (!parsed.success) {
          const error = new Error(`Queue "${queueName}" data validation failed.`);
          (error as { cause?: unknown }).cause = parsed.error;
          throw error;
        }
        const typedJob = job as Job<z.infer<typeof jobConfig.dataSchema>>;
        await jobConfig.handler(typedJob);
      },
      workerOptions
    );
  }
}
