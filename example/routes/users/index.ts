import { defineEndpoint, useFastify, useQueue } from 'fastify-trident';
import { z } from 'zod';

export const schema = {
  post: {
    body: z.object({
      name: z.string().min(1, '名前は必須です'),
      email: z.email('有効なメールアドレスを入力してください'),
      age: z.number().int().positive('年齢は正の整数である必要があります').optional()
    }),
    response: {
      201: z.object({
        id: z.string(),
        name: z.string(),
        email: z.string(),
        createdAt: z.string()
      })
    }
  }
};

export default defineEndpoint({
  schema,
  hooks: {
    get: {
      preHandler: async (req, reply) => {
        reply.header('x-users-hook', 'get');
      }
    }
  },
  
  async post(req, reply) {
    const { name, email, age } = req.body;
    
    const user = {
      id: 'uuid-here',
      name,
      email,
      createdAt: new Date().toISOString()
    };

    const emailQueue = useQueue('send-email');
    await emailQueue.add('welcome', {
      to: email,
      name,
      subject: 'ようこそ',
      body: `${name}さん、Tridentへようこそ！`,
    });
    
    return reply.status(201).send(user);
  },
  
  async get(req, reply) {
    const app = useFastify();
    const scopeFlags = {
      root: Boolean((req.server as any).tridentExampleRoot),
      users: Boolean((req.server as any).tridentUsersScope),
      fromUseFastify: Boolean((app as any).tridentUsersScope)
    };
    return [
      { id: '1', name: 'Alice', email: 'alice@example.com', scopeFlags },
      { id: '2', name: 'Bob', email: 'bob@example.com', scopeFlags }
    ];
  }
});
