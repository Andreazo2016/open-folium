import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import corsPlugin from './plugins/cors';
import jwtPlugin from './plugins/jwt';
import cookiePlugin from './plugins/cookie';
import authRoutes from './routes/auth';
import booksRoutes from './routes/books';

const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    transport:
      process.env.NODE_ENV !== 'production'
        ? { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss Z', ignore: 'pid,hostname' } }
        : undefined,
  },
});

async function bootstrap() {
  // Register plugins
  await fastify.register(corsPlugin);
  await fastify.register(cookiePlugin);
  await fastify.register(jwtPlugin);
  await fastify.register(multipart);

  // Health check
  fastify.get('/health', async (_request, reply) => {
    return reply.send({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Register routes
  await fastify.register(authRoutes);
  await fastify.register(booksRoutes);

  const port = parseInt(process.env.PORT || '3000', 10);
  const host = process.env.HOST || '0.0.0.0';

  await fastify.listen({ port, host });
  fastify.log.info(`Server running at http://${host}:${port}`);
}

bootstrap().catch((err) => {
  fastify.log.error(err);
  process.exit(1);
});
