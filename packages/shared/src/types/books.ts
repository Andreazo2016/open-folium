export interface BookDto {
  id: string;
  userId: string;
  title: string;
  author: string | null;
  fileType: 'pdf' | 'epub';
  filePath: string;
  coverPath: string | null;
  totalPages: number | null;
  createdAt: string;
}

export interface ReadingProgressDto {
  id: string;
  userId: string;
  bookId: string;
  position: string | null;
  page: number | null;
  updatedAt: string;
}

export interface UploadBookResponse {
  book: BookDto;
}

export interface ListBooksResponse {
  books: BookDto[];
}

export interface BookResponse {
  book: BookDto;
}

export interface ProgressResponse {
  progress: ReadingProgressDto | null;
}
