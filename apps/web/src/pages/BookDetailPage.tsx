import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useBook, useUpdateBook, useDeleteBook } from '../hooks/useBooks';

export function BookDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: book, isLoading, isError } = useBook(id!);
  const { mutateAsync: updateBook, isPending: isUpdating } = useUpdateBook();
  const { mutateAsync: deleteBook, isPending: isDeleting } = useDeleteBook();

  const [editing, setEditing] = useState(false);
  const [titleInput, setTitleInput] = useState('');
  const [authorInput, setAuthorInput] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);

  function startEdit() {
    if (!book) return;
    setTitleInput(book.title);
    setAuthorInput(book.author || '');
    setEditing(true);
  }

  async function handleSave() {
    if (!book) return;
    setSaveError(null);
    try {
      await updateBook({ id: book.id, data: { title: titleInput, author: authorInput || undefined } });
      setEditing(false);
    } catch {
      setSaveError('Erro ao salvar alterações.');
    }
  }

  async function handleDelete() {
    if (!book) return;
    if (!confirm(`Excluir "${book.title}"? Esta ação não pode ser desfeita.`)) return;
    await deleteBook(book.id);
    navigate('/library');
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-200 border-t-blue-600" />
      </div>
    );
  }

  if (isError || !book) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <p className="text-gray-600">Livro não encontrado.</p>
        <button onClick={() => navigate('/library')} className="text-blue-600 hover:underline text-sm">
          Voltar à biblioteca
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <button
          onClick={() => navigate('/library')}
          className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 mb-6"
        >
          ← Biblioteca
        </button>

        <div className="bg-white rounded-2xl shadow-sm p-6">
          <div className="flex items-start justify-between gap-4 mb-6">
            <h1 className="text-xl font-bold text-gray-900">{book.title}</h1>
            <span className="flex-shrink-0 text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded font-mono uppercase">
              {book.fileType}
            </span>
          </div>

          {editing ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Título</label>
                <input
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Autor</label>
                <input
                  value={authorInput}
                  onChange={(e) => setAuthorInput(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="(opcional)"
                />
              </div>
              {saveError && <p className="text-sm text-red-600">{saveError}</p>}
              <div className="flex gap-3">
                <button
                  onClick={handleSave}
                  disabled={isUpdating || !titleInput.trim()}
                  className="flex-1 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  {isUpdating ? 'Salvando...' : 'Salvar'}
                </button>
                <button
                  onClick={() => setEditing(false)}
                  className="flex-1 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <dl className="space-y-3">
              <div>
                <dt className="text-xs text-gray-500 uppercase tracking-wide">Autor</dt>
                <dd className="text-sm text-gray-900 mt-0.5">{book.author || '—'}</dd>
              </div>
              {book.totalPages && (
                <div>
                  <dt className="text-xs text-gray-500 uppercase tracking-wide">Páginas</dt>
                  <dd className="text-sm text-gray-900 mt-0.5">{book.totalPages}</dd>
                </div>
              )}
              <div>
                <dt className="text-xs text-gray-500 uppercase tracking-wide">Adicionado em</dt>
                <dd className="text-sm text-gray-900 mt-0.5">
                  {new Date(book.createdAt).toLocaleDateString('pt-BR')}
                </dd>
              </div>
            </dl>
          )}

          {!editing && (
            <div className="flex gap-3 mt-6 pt-6 border-t">
              <button
                onClick={() => navigate(`/reader/${book.id}`)}
                className="flex-1 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
              >
                Ler
              </button>
              <button
                onClick={startEdit}
                className="py-2.5 px-4 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Editar
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="py-2.5 px-4 rounded-lg border border-red-300 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                {isDeleting ? '...' : 'Excluir'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
