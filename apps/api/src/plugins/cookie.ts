import fp from 'fastify-plugin';
import cookie from '@fastify/cookie';
import { FastifyInstance } from 'fastify';

export default fp(async function (fastify: FastifyInstance) {
  await fastify.register(cookie, {
    secret: process.env.REFRESH_SECRET || 'cookie-secret',
    hook: 'onRequest',
  });
});
