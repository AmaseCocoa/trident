import { defineJob } from 'fastify-trident';
import { z } from 'zod';
import type { Job } from 'bullmq';

export const dataSchema = z.object({
  to: z.email(),
  name: z.string(),
  subject: z.string().min(1),
  body: z.string().min(1)
});

declare module 'fastify-trident' {
  interface TridentQueueMap {
    'send-email': {
      data: z.infer<typeof dataSchema>;
    };
  }
}

export default defineJob({
  dataSchema,
  async handler(job) {
    const { to, name, subject } = job.data;
    console.log(`[Queue] send-email to=${to} name=${name} subject=${subject}`);
  }
});
