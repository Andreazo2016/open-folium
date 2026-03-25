import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  registerUser,
  loginUser,
  refreshTokens,
  getMe,
} from '../services/auth.service';

const REFRESH_COOKIE_NAME = 'refresh_token';
const REFRESH_TOKEN_EXPIRES_DAYS = 30;

const registerSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

function setRefreshCookie(reply: FastifyReply, token: string) {
  reply.setCookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60,
  });
}

export default async function authRoutes(fastify: FastifyInstance) {
  // POST /auth/register
  fastify.post('/auth/register', async (request: FastifyRequest, reply: FastifyReply) => {
    const parseResult = registerSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Validation error',
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    try {
      const { accessToken, refreshToken, user } = await registerUser(fastify, parseResult.data);
      setRefreshCookie(reply, refreshToken);
      return reply.status(201).send({ accessToken, user });
    } catch (err: unknown) {
      const error = err as Error & { statusCode?: number };
      return reply.status(error.statusCode || 500).send({ error: error.message });
    }
  });

  // POST /auth/login
  fastify.post('/auth/login', async (request: FastifyRequest, reply: FastifyReply) => {
    const parseResult = loginSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Validation error',
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    try {
      const { accessToken, refreshToken, user } = await loginUser(fastify, parseResult.data);
      setRefreshCookie(reply, refreshToken);
      return reply.send({ accessToken, user });
    } catch (err: unknown) {
      const error = err as Error & { statusCode?: number };
      return reply.status(error.statusCode || 500).send({ error: error.message });
    }
  });

  // POST /auth/refresh
  fastify.post('/auth/refresh', async (request: FastifyRequest, reply: FastifyReply) => {
    const token = request.cookies[REFRESH_COOKIE_NAME];
    if (!token) {
      return reply.status(401).send({ error: 'No refresh token provided' });
    }

    try {
      const { accessToken, refreshToken } = await refreshTokens(fastify, token);
      setRefreshCookie(reply, refreshToken);
      return reply.send({ accessToken });
    } catch (err: unknown) {
      const error = err as Error & { statusCode?: number };
      return reply.status(error.statusCode || 500).send({ error: error.message });
    }
  });

  // POST /auth/logout
  fastify.post('/auth/logout', async (_request: FastifyRequest, reply: FastifyReply) => {
    reply.clearCookie(REFRESH_COOKIE_NAME, { path: '/' });
    return reply.send({ message: 'Logged out successfully' });
  });

  // GET /auth/me
  fastify.get(
    '/auth/me',
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const jwtUser = request.user as { sub: string };
        const user = await getMe(jwtUser.sub);
        return reply.send(user);
      } catch (err: unknown) {
        const error = err as Error & { statusCode?: number };
        return reply.status(error.statusCode || 500).send({ error: error.message });
      }
    }
  );
}
