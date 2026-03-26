import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createHighlight,
  listHighlights,
  updateHighlight,
  deleteHighlight,
} from '../services/highlights.service';

const colorEnum = z.enum(['yellow', 'blue', 'green', 'pink']);

const createSchema = z.object({
  content: z.string().min(1),
  color: colorEnum.optional(),
  page: z.number().int().positive().optional(),
  positionCfi: z.string().optional(),
  note: z.string().optional(),
});

const updateSchema = z.object({
  note: z.string().nullable().optional(),
  color: colorEnum.optional(),
});

export default async function highlightsRoutes(fastify: FastifyInstance) {
  // POST /books/:bookId/highlights — create highlight
  fastify.post('/books/:bookId/highlights', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const userId = (request.user as { sub: string }).sub;
    const { bookId } = request.params as { bookId: string };

    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    try {
      const highlight = await createHighlight(userId, bookId, parsed.data);
      return reply.status(201).send({ highlight });
    } catch (err: unknown) {
      return reply.status(404).send({ error: (err as Error).message });
    }
  });

  // GET /books/:bookId/highlights — list highlights for book
  fastify.get('/books/:bookId/highlights', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const userId = (request.user as { sub: string }).sub;
    const { bookId } = request.params as { bookId: string };

    try {
      const highlights = await listHighlights(userId, bookId);
      return reply.send({ highlights });
    } catch (err: unknown) {
      return reply.status(404).send({ error: (err as Error).message });
    }
  });

  // PATCH /highlights/:id — update note or color
  fastify.patch('/highlights/:id', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const userId = (request.user as { sub: string }).sub;
    const { id } = request.params as { id: string };

    const parsed = updateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    try {
      const highlight = await updateHighlight(userId, id, parsed.data);
      return reply.send({ highlight });
    } catch (err: unknown) {
      return reply.status(404).send({ error: (err as Error).message });
    }
  });

  // DELETE /highlights/:id
  fastify.delete('/highlights/:id', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const userId = (request.user as { sub: string }).sub;
    const { id } = request.params as { id: string };

    try {
      await deleteHighlight(userId, id);
      return reply.status(204).send();
    } catch (err: unknown) {
      return reply.status(404).send({ error: (err as Error).message });
    }
  });
}
