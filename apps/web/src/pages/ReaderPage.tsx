import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useBook } from '../hooks/useBooks';
import { PdfReader } from '../components/PdfReader';
import { EpubReader } from '../components/EpubReader';
import { HighlightPanel } from '../components/HighlightPanel';
import { useCreateHighlight, useHighlights } from '../hooks/useHighlights';
import type { HighlightColor } from '../types/highlights';

export function ReaderPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: book, isLoading, isError } = useBook(id!);
  const [panelOpen, setPanelOpen] = useState(false);
  const createHighlight = useCreateHighlight(id!);
  const { data: highlights } = useHighlights(id!);

  function handleHighlightCreate(data: {
    content: string;
    color: HighlightColor;
    page?: number;
    positionCfi?: string;
    note: string;
  }) {
    createHighlight.mutate({
      content: data.content,
      color: data.color,
      page: data.page,
      positionCfi: data.positionCfi,
      note: data.note || undefined,
    });
  }

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
          className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 flex-shrink-0"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Biblioteca
        </button>
        <span className="text-gray-300 flex-shrink-0">|</span>
        <div className="min-w-0 flex-1">
          <h1 className="text-sm font-semibold text-gray-900 truncate">{book.title}</h1>
          {book.author && (
            <p className="text-xs text-gray-500 truncate">{book.author}</p>
          )}
        </div>

        {/* Toggle highlights panel */}
        <button
          onClick={() => setPanelOpen((v) => !v)}
          title={panelOpen ? 'Fechar destaques' : 'Ver destaques'}
          className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border flex-shrink-0 transition-colors ${
            panelOpen
              ? 'bg-yellow-50 border-yellow-300 text-yellow-700'
              : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300 hover:text-gray-900'
          }`}
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 18V4z" />
          </svg>
          Destaques
          {highlights && highlights.length > 0 && (
            <span className="bg-yellow-200 text-yellow-800 text-xs rounded-full px-1.5 py-0.5 leading-none">
              {highlights.length}
            </span>
          )}
        </button>
      </div>

      {/* Reader + optional panel */}
      <div className="flex flex-1 min-h-0">
        <div className="flex-1 min-w-0">
          {book.fileType === 'pdf' ? (
            <PdfReader
              bookId={book.id}
              totalPages={book.totalPages}
              highlights={highlights}
              onHighlightCreate={(data) =>
                handleHighlightCreate({ ...data, positionCfi: undefined })
              }
            />
          ) : (
            <EpubReader
              bookId={book.id}
              highlights={highlights}
              onHighlightCreate={(data) =>
                handleHighlightCreate({ ...data, page: undefined })
              }
            />
          )}
        </div>

        {panelOpen && (
          <div className="w-72 flex-shrink-0 border-l">
            <HighlightPanel bookId={book.id} />
          </div>
        )}
      </div>
    </div>
  );
}
