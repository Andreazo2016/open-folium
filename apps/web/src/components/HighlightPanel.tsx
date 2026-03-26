import { useState } from 'react';
import { useHighlights, useDeleteHighlight, useUpdateHighlight } from '../hooks/useHighlights';
import type { HighlightColor, HighlightDto } from '../types/highlights';

interface Props {
  bookId: string;
}

const COLOR_CLASSES: Record<HighlightColor, string> = {
  yellow: 'bg-yellow-300',
  blue: 'bg-blue-300',
  green: 'bg-green-300',
  pink: 'bg-pink-300',
};

const COLOR_BORDER: Record<HighlightColor, string> = {
  yellow: 'border-yellow-300',
  blue: 'border-blue-300',
  green: 'border-green-300',
  pink: 'border-pink-300',
};

function HighlightItem({ highlight, bookId }: { highlight: HighlightDto; bookId: string }) {
  const [editingNote, setEditingNote] = useState(false);
  const [noteValue, setNoteValue] = useState(highlight.note ?? '');
  const deleteHighlight = useDeleteHighlight(bookId);
  const updateHighlight = useUpdateHighlight(bookId);

  function saveNote() {
    updateHighlight.mutate({ id: highlight.id, note: noteValue || null });
    setEditingNote(false);
  }

  return (
    <div className={`border-l-4 ${COLOR_BORDER[highlight.color as HighlightColor]} pl-3 py-2`}>
      {/* Location badge */}
      {highlight.page != null && (
        <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">
          Pág. {highlight.page}
        </span>
      )}

      {/* Content */}
      <p className={`text-sm mt-0.5 rounded px-1 inline ${COLOR_CLASSES[highlight.color as HighlightColor]} leading-relaxed`}>
        {highlight.content}
      </p>

      {/* Note */}
      {editingNote ? (
        <div className="mt-1.5">
          <textarea
            value={noteValue}
            onChange={(e) => setNoteValue(e.target.value)}
            rows={2}
            className="w-full text-xs border border-gray-200 rounded px-2 py-1 resize-none focus:outline-none focus:border-blue-400"
            autoFocus
          />
          <div className="flex gap-2 mt-1">
            <button
              onClick={saveNote}
              className="text-xs bg-gray-800 text-white rounded px-2 py-0.5 hover:bg-gray-700"
            >
              Salvar
            </button>
            <button
              onClick={() => { setNoteValue(highlight.note ?? ''); setEditingNote(false); }}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : highlight.note ? (
        <p
          className="text-xs text-gray-500 mt-1 cursor-pointer hover:text-gray-700"
          onClick={() => setEditingNote(true)}
          title="Clique para editar"
        >
          📝 {highlight.note}
        </p>
      ) : (
        <button
          onClick={() => setEditingNote(true)}
          className="text-[10px] text-gray-400 hover:text-gray-600 mt-1 block"
        >
          + Adicionar nota
        </button>
      )}

      {/* Delete */}
      <button
        onClick={() => deleteHighlight.mutate(highlight.id)}
        className="text-[10px] text-red-400 hover:text-red-600 mt-1 block"
        disabled={deleteHighlight.isPending}
      >
        Excluir
      </button>
    </div>
  );
}

export function HighlightPanel({ bookId }: Props) {
  const { data: highlights, isLoading } = useHighlights(bookId);

  return (
    <div className="flex flex-col h-full bg-white border-l">
      <div className="px-4 py-3 border-b flex-shrink-0">
        <h2 className="text-sm font-semibold text-gray-800">
          Destaques
          {highlights && highlights.length > 0 && (
            <span className="ml-1.5 text-xs text-gray-400 font-normal">({highlights.length})</span>
          )}
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {isLoading && (
          <div className="flex justify-center pt-8">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-gray-200 border-t-blue-500" />
          </div>
        )}

        {!isLoading && (!highlights || highlights.length === 0) && (
          <p className="text-xs text-gray-400 text-center pt-8 leading-relaxed">
            Nenhum destaque ainda.<br />
            Selecione texto no leitor para criar um.
          </p>
        )}

        {highlights?.map((h) => (
          <HighlightItem key={h.id} highlight={h} bookId={bookId} />
        ))}
      </div>
    </div>
  );
}
