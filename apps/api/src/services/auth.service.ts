import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { FastifyInstance } from 'fastify';

const SALT_ROUNDS = 10;
const REFRESH_TOKEN_EXPIRES_DAYS = 30;

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface JwtPayload {
  sub: string;
  email: string;
  name: string;
}

function signRefreshToken(payload: JwtPayload): string {
  const secret = process.env.REFRESH_SECRET || 'refresh-secret-change-me';
  return jwt.sign(payload, secret, { expiresIn: `${REFRESH_TOKEN_EXPIRES_DAYS}d` });
}

function verifyRefreshToken(token: string): JwtPayload {
  const secret = process.env.REFRESH_SECRET || 'refresh-secret-change-me';
  return jwt.verify(token, secret) as JwtPayload;
}

export async function registerUser(fastify: FastifyInstance, input: RegisterInput) {
  const email = input.email.toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw Object.assign(new Error('Email already in use'), { statusCode: 409 });
  }

  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);

  const user = await prisma.user.create({
    data: {
      name: input.name,
      email,
      passwordHash,
    },
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
    },
  });

  const payload: JwtPayload = { sub: user.id, email: user.email, name: user.name };
  const accessToken = fastify.jwt.sign(payload, { expiresIn: '15m' });
  const refreshToken = signRefreshToken(payload);

  return { accessToken, refreshToken, user };
}

export async function loginUser(fastify: FastifyInstance, input: LoginInput) {
  const email = input.email.toLowerCase();

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw Object.assign(new Error('Invalid credentials'), { statusCode: 401 });
  }

  const valid = await bcrypt.compare(input.password, user.passwordHash);
  if (!valid) {
    throw Object.assign(new Error('Invalid credentials'), { statusCode: 401 });
  }

  const payload: JwtPayload = { sub: user.id, email: user.email, name: user.name };
  const accessToken = fastify.jwt.sign(payload, { expiresIn: '15m' });
  const refreshToken = signRefreshToken(payload);

  const userDto = {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt.toISOString(),
  };

  return { accessToken, refreshToken, user: userDto };
}

export async function refreshTokens(fastify: FastifyInstance, refreshToken: string) {
  let payload: JwtPayload;

  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw Object.assign(new Error('Invalid refresh token'), { statusCode: 401 });
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user) {
    throw Object.assign(new Error('User not found'), { statusCode: 401 });
  }

  const newPayload: JwtPayload = { sub: user.id, email: user.email, name: user.name };
  const accessToken = fastify.jwt.sign(newPayload, { expiresIn: '15m' });
  const newRefreshToken = signRefreshToken(newPayload);

  return { accessToken, refreshToken: newRefreshToken };
}

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
    },
  });

  if (!user) {
    throw Object.assign(new Error('User not found'), { statusCode: 404 });
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt.toISOString(),
  };
}
