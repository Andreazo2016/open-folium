export type HighlightColor = 'yellow' | 'blue' | 'green' | 'pink';

export interface HighlightDto {
  id: string;
  userId: string;
  bookId: string;
  content: string;
  color: HighlightColor;
  positionCfi: string | null;
  page: number | null;
  note: string | null;
  createdAt: string;
}
