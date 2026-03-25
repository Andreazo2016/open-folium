import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import { authApi } from '../lib/api';
import { useBooks, useDeleteBook } from '../hooks/useBooks';
import { BookCard } from '../components/BookCard';
import { UploadModal } from '../components/UploadModal';
import type { BookDto } from '../types/books';

export function LibraryPage() {
  const navigate = useNavigate();
  const { user, clearAuth } = useAuthStore();
  const [search, setSearch] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [_editingBook, setEditingBook] = useState<BookDto | null>(null);

  const { data: books, isLoading } = useBooks();
  const { mutateAsync: deleteBook } = useDeleteBook();

  const filteredBooks = books
    ? books.filter((b) => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return b.title.toLowerCase().includes(q) || (b.author?.toLowerCase().includes(q) ?? false);
      })
    : [];

  async function handleLogout() {
    try {
      await authApi.logout();
    } finally {
      clearAuth();
      navigate('/login', { replace: true });
    }
  }

  async function handleDelete(id: string) {
    const book = books?.find((b) => b.id === id);
    if (!book) return;
    if (!confirm(`Excluir "${book.title}"? Esta ação não pode ser desfeita.`)) return;
    await deleteBook(id);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <span className="text-xl font-bold text-blue-600">Reader</span>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600 hidden sm:block">
              Olá, <span className="font-medium text-gray-800">{user?.name}</span>
            </span>
            <button
              onClick={handleLogout}
              className="text-sm text-gray-500 hover:text-red-600 transition-colors"
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Title row */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-800">Minha Biblioteca</h1>
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Adicionar livro
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por título ou autor..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              ×
            </button>
          )}
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="animate-pulse bg-white rounded-xl h-64 border border-gray-100" />
            ))}
          </div>
        ) : filteredBooks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mb-4">
              <svg
                className="w-10 h-10 text-blue-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                />
              </svg>
            </div>
            {search ? (
              <>
                <h2 className="text-lg font-semibold text-gray-700 mb-2">Nenhum resultado</h2>
                <p className="text-sm text-gray-500">
                  Nenhum livro corresponde a "{search}".
                </p>
              </>
            ) : (
              <>
                <h2 className="text-lg font-semibold text-gray-700 mb-2">Sua biblioteca está vazia</h2>
                <p className="text-sm text-gray-500 max-w-sm mb-4">
                  Faça upload do seu primeiro livro para começar. Formatos suportados: PDF e EPUB.
                </p>
                <button
                  onClick={() => setShowUpload(true)}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg"
                >
                  Adicionar livro
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {filteredBooks.map((book) => (
              <BookCard
                key={book.id}
                book={book}
                onDelete={handleDelete}
                onEdit={(b) => { setEditingBook(b); navigate(`/books/${b.id}`); }}
              />
            ))}
          </div>
        )}
      </main>

      {/* Upload modal */}
      {showUpload && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          onSuccess={() => {}}
        />
      )}

    </div>
  );
}
