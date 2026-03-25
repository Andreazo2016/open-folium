import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { usePdfThumbnail } from '../hooks/usePdfThumbnail';
import type { BookDto } from '../types/books';

// Cover image for EPUB (has a real cover image stored on server)
function EpubCover({ bookId, title }: { bookId: string; title: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    api
      .get(`/books/${bookId}/cover`, { responseType: 'blob' })
      .then((r) => {
        objectUrl = URL.createObjectURL(r.data as Blob);
        setSrc(objectUrl);
      })
      .catch(() => setError(true));

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [bookId]);

  if (error || !src) return <BookPlaceholder title={title} type="epub" />;
  return <img src={src} alt={`Capa de ${title}`} className="w-full h-full object-cover" />;
}

// Thumbnail for PDF (generated from first page client-side)
function PdfCover({ bookId, title }: { bookId: string; title: string }) {
  const { thumbnailUrl, loading } = usePdfThumbnail(bookId);

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-100">
        <div className="animate-pulse w-full h-full bg-gray-200" />
      </div>
    );
  }

  if (!thumbnailUrl) return <BookPlaceholder title={title} type="pdf" />;

  return (
    <img
      src={thumbnailUrl}
      alt={`Capa de ${title}`}
      className="w-full h-full object-cover object-top"
    />
  );
}

// Fallback placeholder when no cover is available
function BookPlaceholder({ title, type }: { title: string; type: 'pdf' | 'epub' }) {
  const color = type === 'pdf' ? 'bg-red-50' : 'bg-blue-50';
  const iconColor = type === 'pdf' ? 'text-red-300' : 'text-blue-300';
  return (
    <div className={`w-full h-full flex flex-col items-center justify-center ${color} p-3 gap-2`}>
      <svg className={`w-10 h-10 ${iconColor}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
        />
      </svg>
      <span className="text-[10px] text-gray-400 text-center line-clamp-2 leading-tight">
        {title}
      </span>
    </div>
  );
}

interface Props {
  book: BookDto;
  onDelete: (id: string) => void;
  onEdit: (book: BookDto) => void;
}

export function BookCard({ book, onDelete, onEdit }: Props) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  return (
    <div className="group relative bg-white rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
      {/* Cover */}
      <div
        className="h-48 cursor-pointer overflow-hidden rounded-t-xl"
        onClick={() => navigate(`/reader/${book.id}`)}
      >
        {book.fileType === 'epub' ? (
          <EpubCover bookId={book.id} title={book.title} />
        ) : (
          <PdfCover bookId={book.id} title={book.title} />
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        <div className="flex items-start justify-between gap-1">
          <div className="min-w-0">
            <h3
              className="font-semibold text-gray-900 text-sm truncate cursor-pointer hover:text-blue-600"
              title={book.title}
              onClick={() => navigate(`/reader/${book.id}`)}
            >
              {book.title}
            </h3>
            {book.author && (
              <p className="text-xs text-gray-500 truncate mt-0.5" title={book.author}>
                {book.author}
              </p>
            )}
          </div>

          {/* Context menu */}
          <div className="relative flex-shrink-0" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100"
              aria-label="Opções"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
              </svg>
            </button>

            {menuOpen && (
              <div className="absolute right-0 mt-1 w-36 bg-white rounded-lg shadow-lg border border-gray-200 z-10 py-1">
                <button
                  className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  onClick={() => { setMenuOpen(false); navigate(`/reader/${book.id}`); }}
                >
                  Ler
                </button>
                <button
                  className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  onClick={() => { setMenuOpen(false); onEdit(book); }}
                >
                  Editar
                </button>
                <button
                  className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                  onClick={() => { setMenuOpen(false); onDelete(book.id); }}
                >
                  Excluir
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 mt-2">
          <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-mono uppercase">
            {book.fileType}
          </span>
          {book.totalPages && (
            <span className="text-xs text-gray-400">{book.totalPages} pgs</span>
          )}
        </div>
      </div>
    </div>
  );
}
