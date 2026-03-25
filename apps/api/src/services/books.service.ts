import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { prisma } from '../lib/prisma';
import { validatePdf, validateEpub, processPdf, processEpub } from '../lib/fileProcessor';

const unlink = promisify(fs.unlink);

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');

export async function uploadBook(
  userId: string,
  filename: string,
  mimeType: string,
  buffer: Buffer
) {
  const ext = path.extname(filename).toLowerCase();
  const fileType = ext === '.pdf' ? 'pdf' : ext === '.epub' ? 'epub' : null;

  if (!fileType) {
    throw new Error('Tipo de arquivo não suportado. Apenas PDF e EPUB são aceitos.');
  }

  // Validate by magic bytes
  if (fileType === 'pdf' && !validatePdf(buffer)) {
    throw new Error('Arquivo inválido: não é um PDF válido.');
  }
  if (fileType === 'epub' && !validateEpub(buffer)) {
    throw new Error('Arquivo inválido: não é um EPUB válido.');
  }

  // Check file size limits
  const maxSize = fileType === 'pdf' ? 100 * 1024 * 1024 : 50 * 1024 * 1024;
  if (buffer.length > maxSize) {
    const limitMb = fileType === 'pdf' ? 100 : 50;
    throw new Error(`Arquivo muito grande. O limite para ${fileType.toUpperCase()} é ${limitMb}MB.`);
  }

  // Create user upload directory
  const userDir = path.join(UPLOAD_DIR, userId);
  const coversDir = path.join(userDir, 'covers');
  await fs.promises.mkdir(userDir, { recursive: true });
  await fs.promises.mkdir(coversDir, { recursive: true });

  // Generate unique filename
  const uuid = crypto.randomUUID();
  const storedFilename = `${uuid}${ext}`;
  const filePath = path.join(userDir, storedFilename);

  // Save file to disk
  await fs.promises.writeFile(filePath, buffer);

  // Extract metadata
  let metadata: { title?: string; author?: string; totalPages?: number; coverPath?: string } = {};

  try {
    if (fileType === 'pdf') {
      metadata = await processPdf(filePath);
    } else {
      const coverFilename = `${uuid}.jpg`;
      metadata = await processEpub(filePath, coversDir, coverFilename);
    }
  } catch {
    // Metadata extraction failed — continue with empty metadata
  }

  // Use filename as fallback title (remove extension)
  const title = metadata.title || path.basename(filename, ext);

  // Store relative paths
  const relativeFilePath = path.relative(UPLOAD_DIR, filePath);
  const relativeCoverPath = metadata.coverPath
    ? path.relative(UPLOAD_DIR, metadata.coverPath)
    : null;

  const book = await prisma.book.create({
    data: {
      userId,
      title,
      author: metadata.author || null,
      fileType,
      filePath: relativeFilePath,
      coverPath: relativeCoverPath,
      totalPages: metadata.totalPages || null,
    },
  });

  return book;
}

export async function listBooks(userId: string, search?: string) {
  const books = await prisma.book.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });

  if (search) {
    const q = search.toLowerCase();
    return books.filter(
      (b) =>
        b.title.toLowerCase().includes(q) ||
        (b.author && b.author.toLowerCase().includes(q))
    );
  }

  return books;
}

export async function getBook(userId: string, bookId: string) {
  const book = await prisma.book.findFirst({ where: { id: bookId, userId } });
  if (!book) throw new Error('Livro não encontrado.');
  return book;
}

export async function getBookFilePath(userId: string, bookId: string) {
  const book = await getBook(userId, bookId);
  return path.join(UPLOAD_DIR, book.filePath);
}

export async function getBookCoverPath(userId: string, bookId: string) {
  const book = await getBook(userId, bookId);
  if (!book.coverPath) return null;
  return path.join(UPLOAD_DIR, book.coverPath);
}

export async function deleteBook(userId: string, bookId: string) {
  const book = await getBook(userId, bookId);

  // Delete the file
  const filePath = path.join(UPLOAD_DIR, book.filePath);
  try { await unlink(filePath); } catch { /* file may not exist */ }

  // Delete cover if exists
  if (book.coverPath) {
    const coverPath = path.join(UPLOAD_DIR, book.coverPath);
    try { await unlink(coverPath); } catch { /* ignore */ }
  }

  // Delete reading progress
  await prisma.readingProgress.deleteMany({ where: { bookId, userId } });

  // Delete highlights
  await prisma.highlight.deleteMany({ where: { bookId, userId } });

  // Delete book record
  await prisma.book.delete({ where: { id: bookId } });
}

export async function updateBook(
  userId: string,
  bookId: string,
  data: { title?: string; author?: string }
) {
  await getBook(userId, bookId); // ownership check

  return prisma.book.update({
    where: { id: bookId },
    data: {
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.author !== undefined ? { author: data.author } : {}),
    },
  });
}

export async function upsertReadingProgress(
  userId: string,
  bookId: string,
  data: { page?: number; position?: string }
) {
  await getBook(userId, bookId); // ownership check

  return prisma.readingProgress.upsert({
    where: { userId_bookId: { userId, bookId } },
    create: { userId, bookId, page: data.page ?? null, position: data.position ?? null },
    update: { page: data.page ?? null, position: data.position ?? null },
  });
}

export async function getReadingProgress(userId: string, bookId: string) {
  return prisma.readingProgress.findUnique({
    where: { userId_bookId: { userId, bookId } },
  });
}
