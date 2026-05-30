import Fastify from 'fastify';
import trident from 'fastify-trident';

const app = Fastify({ logger: true });

app.register(trident, { mode: 'all', routesDir: 'routes' });

app.listen({ port: 3000, host: '0.0.0.0' }).catch((error) => {
  console.error(error);
  process.exit(1);
});
