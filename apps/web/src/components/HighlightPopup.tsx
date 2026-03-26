import { useState, useEffect, useRef } from 'react';
import type { HighlightColor } from '../types/highlights';

interface Props {
  position: { x: number; y: number };
  selectedText: string;
  onSave: (color: HighlightColor, note: string) => void;
  onCancel: () => void;
}

const COLORS: { value: HighlightColor; bg: string; label: string }[] = [
  { value: 'yellow', bg: 'bg-yellow-300', label: 'Amarelo' },
  { value: 'blue',   bg: 'bg-blue-300',   label: 'Azul' },
  { value: 'green',  bg: 'bg-green-300',  label: 'Verde' },
  { value: 'pink',   bg: 'bg-pink-300',   label: 'Rosa' },
];

export function HighlightPopup({ position, selectedText, onSave, onCancel }: Props) {
  const [color, setColor] = useState<HighlightColor>('yellow');
  const [note, setNote] = useState('');
  const [showNote, setShowNote] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onCancel();
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onCancel]);

  // Clamp popup so it doesn't overflow viewport
  const style: React.CSSProperties = {
    position: 'fixed',
    left: Math.min(position.x, window.innerWidth - 260),
    top: position.y + 8,
    zIndex: 1000,
  };

  return (
    <div
      ref={popupRef}
      style={style}
      className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 w-60"
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Preview */}
      <p className="text-xs text-gray-500 mb-2 line-clamp-2 italic">
        "{selectedText.slice(0, 80)}{selectedText.length > 80 ? '…' : ''}"
      </p>

      {/* Color picker */}
      <div className="flex items-center gap-2 mb-2">
        {COLORS.map((c) => (
          <button
            key={c.value}
            title={c.label}
            onClick={() => setColor(c.value)}
            className={`w-7 h-7 rounded-full ${c.bg} transition-all ${
              color === c.value ? 'ring-2 ring-offset-1 ring-gray-500 scale-110' : 'opacity-70 hover:opacity-100'
            }`}
          />
        ))}
        <button
          onClick={() => setShowNote((v) => !v)}
          className="ml-auto text-gray-400 hover:text-gray-700 text-xs"
          title="Adicionar nota"
        >
          ✏️
        </button>
      </div>

      {/* Optional note */}
      {showNote && (
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Adicionar nota..."
          rows={2}
          className="w-full text-xs border border-gray-200 rounded px-2 py-1 resize-none focus:outline-none focus:border-blue-400 mb-2"
          autoFocus
        />
      )}

      {/* Actions */}
      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1"
        >
          Cancelar
        </button>
        <button
          onClick={() => onSave(color, note)}
          className="text-xs bg-gray-800 text-white rounded px-3 py-1 hover:bg-gray-700"
        >
          Salvar
        </button>
      </div>
    </div>
  );
}
