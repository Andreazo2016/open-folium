import { prisma } from '../lib/prisma';

const VALID_COLORS = ['yellow', 'blue', 'green', 'pink'] as const;
type HighlightColor = (typeof VALID_COLORS)[number];

function sanitizeColor(color?: string): HighlightColor {
  return VALID_COLORS.includes(color as HighlightColor) ? (color as HighlightColor) : 'yellow';
}

export async function createHighlight(
  userId: string,
  bookId: string,
  data: {
    content: string;
    color?: string;
    page?: number;
    positionCfi?: string;
    note?: string;
  }
) {
  const book = await prisma.book.findFirst({ where: { id: bookId, userId } });
  if (!book) throw new Error('Livro não encontrado.');

  return prisma.highlight.create({
    data: {
      userId,
      bookId,
      content: data.content,
      color: sanitizeColor(data.color),
      page: data.page ?? null,
      positionCfi: data.positionCfi ?? null,
      note: data.note ?? null,
    },
  });
}

export async function listHighlights(userId: string, bookId: string) {
  const book = await prisma.book.findFirst({ where: { id: bookId, userId } });
  if (!book) throw new Error('Livro não encontrado.');

  return prisma.highlight.findMany({
    where: { userId, bookId },
    orderBy: { createdAt: 'asc' },
  });
}

export async function updateHighlight(
  userId: string,
  highlightId: string,
  data: { note?: string | null; color?: string }
) {
  const highlight = await prisma.highlight.findFirst({ where: { id: highlightId, userId } });
  if (!highlight) throw new Error('Highlight não encontrado.');

  const updates: Record<string, unknown> = {};
  if (data.note !== undefined) updates.note = data.note;
  if (data.color) updates.color = sanitizeColor(data.color);

  return prisma.highlight.update({ where: { id: highlightId }, data: updates });
}

export async function deleteHighlight(userId: string, highlightId: string) {
  const highlight = await prisma.highlight.findFirst({ where: { id: highlightId, userId } });
  if (!highlight) throw new Error('Highlight não encontrado.');

  // Remove associated cards before deleting the highlight
  await prisma.card.deleteMany({ where: { highlightId } });
  await prisma.highlight.delete({ where: { id: highlightId } });
}
