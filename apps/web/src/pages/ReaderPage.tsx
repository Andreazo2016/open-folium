import { useParams, useNavigate } from 'react-router-dom';
import { useBook } from '../hooks/useBooks';
import { PdfReader } from '../components/PdfReader';
import { EpubReader } from '../components/EpubReader';

export function ReaderPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: book, isLoading, isError } = useBook(id!);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-200 border-t-blue-600" />
      </div>
    );
  }

  if (isError || !book) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <p className="text-gray-600">Livro não encontrado.</p>
        <button
          onClick={() => navigate('/library')}
          className="text-blue-600 hover:underline text-sm"
        >
          Voltar à biblioteca
        </button>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2 bg-white border-b shadow-sm flex-shrink-0">
        <button
          onClick={() => navigate('/library')}
          className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Biblioteca
        </button>
        <span className="text-gray-300">|</span>
        <div className="min-w-0">
          <h1 className="text-sm font-semibold text-gray-900 truncate">{book.title}</h1>
          {book.author && (
            <p className="text-xs text-gray-500 truncate">{book.author}</p>
          )}
        </div>
      </div>

      {/* Reader */}
      <div className="flex-1 min-h-0">
        {book.fileType === 'pdf' ? (
          <PdfReader bookId={book.id} totalPages={book.totalPages} />
        ) : (
          <EpubReader bookId={book.id} />
        )}
      </div>
    </div>
  );
}
