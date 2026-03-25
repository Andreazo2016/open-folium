import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import fs from 'fs';
import {
  uploadBook,
  listBooks,
  getBook,
  getBookFilePath,
  getBookCoverPath,
  deleteBook,
  updateBook,
  upsertReadingProgress,
  getReadingProgress,
} from '../services/books.service';

const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100MB hard cap for multipart

const updateBookSchema = z.object({
  title: z.string().min(1).optional(),
  author: z.string().optional(),
});

const progressSchema = z.object({
  page: z.number().int().positive().optional(),
  position: z.string().optional(),
});

export default async function booksRoutes(fastify: FastifyInstance) {
  // POST /books/upload — upload PDF or EPUB
  fastify.post('/books/upload', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const data = await request.file({ limits: { fileSize: MAX_FILE_SIZE_BYTES } });

    if (!data) {
      return reply.status(400).send({ error: 'Nenhum arquivo enviado.' });
    }

    const allowedExtensions = ['.pdf', '.epub'];
    const ext = data.filename.split('.').pop()?.toLowerCase();
    if (!ext || !allowedExtensions.includes(`.${ext}`)) {
      return reply.status(400).send({ error: 'Tipo de arquivo não suportado. Envie PDF ou EPUB.' });
    }

    try {
      const buffer = await data.toBuffer();
      const userId = (request.user as { sub: string }).sub;
      const book = await uploadBook(userId, data.filename, data.mimetype, buffer);
      return reply.status(201).send({ book });
    } catch (err: any) {
      return reply.status(422).send({ error: err.message || 'Erro ao processar arquivo.' });
    }
  });

  // GET /books — list books
  fastify.get('/books', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const userId = (request.user as { sub: string }).sub;
    const { search } = request.query as { search?: string };
    const books = await listBooks(userId, search);
    return reply.send({ books });
  });

  // GET /books/:id — book metadata
  fastify.get('/books/:id', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const userId = (request.user as { sub: string }).sub;
    const { id } = request.params as { id: string };
    try {
      const book = await getBook(userId, id);
      return reply.send({ book });
    } catch {
      return reply.status(404).send({ error: 'Livro não encontrado.' });
    }
  });

  // GET /books/:id/file — stream file
  fastify.get('/books/:id/file', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const userId = (request.user as { sub: string }).sub;
    const { id } = request.params as { id: string };
    try {
      const filePath = await getBookFilePath(userId, id);

      if (!fs.existsSync(filePath)) {
        return reply.status(404).send({ error: 'Arquivo não encontrado.' });
      }

      const stat = fs.statSync(filePath);
      const ext = filePath.split('.').pop()?.toLowerCase();
      const mimeType = ext === 'pdf' ? 'application/pdf' : 'application/epub+zip';

      reply.header('Content-Type', mimeType);
      reply.header('Content-Length', stat.size);
      reply.header('Accept-Ranges', 'bytes');

      return reply.send(fs.createReadStream(filePath));
    } catch {
      return reply.status(404).send({ error: 'Livro não encontrado.' });
    }
  });

  // GET /books/:id/cover — serve cover image
  fastify.get('/books/:id/cover', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const userId = (request.user as { sub: string }).sub;
    const { id } = request.params as { id: string };
    try {
      const coverPath = await getBookCoverPath(userId, id);

      if (!coverPath || !fs.existsSync(coverPath)) {
        return reply.status(404).send({ error: 'Capa não disponível.' });
      }

      const ext = coverPath.split('.').pop()?.toLowerCase();
      const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';

      reply.header('Content-Type', mimeType);
      reply.header('Cache-Control', 'max-age=31536000, immutable');
      return reply.send(fs.createReadStream(coverPath));
    } catch {
      return reply.status(404).send({ error: 'Livro não encontrado.' });
    }
  });

  // DELETE /books/:id
  fastify.delete('/books/:id', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const userId = (request.user as { sub: string }).sub;
    const { id } = request.params as { id: string };
    try {
      await deleteBook(userId, id);
      return reply.status(204).send();
    } catch {
      return reply.status(404).send({ error: 'Livro não encontrado.' });
    }
  });

  // PATCH /books/:id — update title/author
  fastify.patch('/books/:id', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const userId = (request.user as { sub: string }).sub;
    const { id } = request.params as { id: string };

    const parseResult = updateBookSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.flatten() });
    }

    try {
      const book = await updateBook(userId, id, parseResult.data);
      return reply.send({ book });
    } catch {
      return reply.status(404).send({ error: 'Livro não encontrado.' });
    }
  });

  // PATCH /books/:id/progress
  fastify.patch('/books/:id/progress', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const userId = (request.user as { sub: string }).sub;
    const { id } = request.params as { id: string };

    const parseResult = progressSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.flatten() });
    }

    try {
      const progress = await upsertReadingProgress(userId, id, parseResult.data);
      return reply.send({ progress });
    } catch {
      return reply.status(404).send({ error: 'Livro não encontrado.' });
    }
  });

  // GET /books/:id/progress
  fastify.get('/books/:id/progress', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const userId = (request.user as { sub: string }).sub;
    const { id } = request.params as { id: string };

    try {
      await getBook(userId, id); // ownership check
      const progress = await getReadingProgress(userId, id);
      return reply.send({ progress });
    } catch {
      return reply.status(404).send({ error: 'Livro não encontrado.' });
    }
  });
}
