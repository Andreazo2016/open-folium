import { useState, useEffect, useRef, useCallback } from 'react';
import { ReactReader, ReactReaderStyle } from 'react-reader';
import { api } from '../lib/api';
import { useDebouncedSaveProgress } from '../hooks/useReader';
import { HighlightPopup } from './HighlightPopup';
import type { HighlightColor, HighlightDto } from '../types/highlights';

interface Props {
  bookId: string;
  highlights?: HighlightDto[];
  onHighlightCreate?: (data: {
    content: string;
    color: HighlightColor;
    positionCfi: string;
    note: string;
  }) => void;
}

interface PendingHighlight {
  text: string;
  cfiRange: string;
  popupX: number;
  popupY: number;
}

// SVG fill colors for epub.js annotations
const EPUB_COLORS: Record<HighlightColor, string> = {
  yellow: 'rgba(253, 224, 71, 0.5)',
  blue:   'rgba(147, 197, 253, 0.5)',
  green:  'rgba(134, 239, 172, 0.5)',
  pink:   'rgba(249, 168, 212, 0.5)',
};

export function EpubReader({ bookId, highlights, onHighlightCreate }: Props) {
  const [epubBuffer, setEpubBuffer] = useState<ArrayBuffer | null>(null);
  const [location, setLocation] = useState<string | null>(null);
  const [fontSize, setFontSize] = useState(100);
  const [error, setError] = useState<string | null>(null);
  const [fileLoading, setFileLoading] = useState(true);
  const [pendingHighlight, setPendingHighlight] = useState<PendingHighlight | null>(null);
  const [renditionReady, setRenditionReady] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renditionRef = useRef<any>(null);
  // Track which highlight ids have been applied to avoid duplicate annotations
  const appliedRef = useRef<Map<string, string>>(new Map()); // id → cfiRange

  const { progress, loaded: progressLoaded, saveProgress } = useDebouncedSaveProgress(bookId);

  useEffect(() => {
    api
      .get(`/books/${bookId}/file`, { responseType: 'arraybuffer' })
      .then((r) => {
        setEpubBuffer(r.data as ArrayBuffer);
        setFileLoading(false);
      })
      .catch(() => {
        setError('Não foi possível carregar o EPUB.');
        setFileLoading(false);
      });
  }, [bookId]);

  useEffect(() => {
    if (progressLoaded) {
      setLocation(progress?.position ?? null);
    }
  }, [progressLoaded, progress]);

  useEffect(() => {
    if (renditionRef.current) {
      renditionRef.current.themes.fontSize(`${fontSize}%`);
    }
  }, [fontSize]);

  // Apply / sync visual annotations whenever highlights list or rendition readiness changes
  useEffect(() => {
    if (!renditionReady || !renditionRef.current) return;
    const r = renditionRef.current;

    const currentIds = new Set(highlights?.map((h) => h.id) ?? []);

    // Remove annotations for deleted highlights
    for (const [id, cfi] of appliedRef.current) {
      if (!currentIds.has(id)) {
        try { r.annotations.remove(cfi, 'highlight'); } catch { /* ignore */ }
        appliedRef.current.delete(id);
      }
    }

    // Add annotations for new highlights
    for (const h of highlights ?? []) {
      if (!h.positionCfi || appliedRef.current.has(h.id)) continue;
      try {
        r.annotations.add(
          'highlight',
          h.positionCfi,
          {},
          undefined,
          'epub-hl',
          { fill: EPUB_COLORS[h.color as HighlightColor] ?? EPUB_COLORS.yellow },
        );
        appliedRef.current.set(h.id, h.positionCfi);
      } catch { /* ignore invalid CFI */ }
    }
  }, [renditionReady, highlights]);

  const handleGetRendition = useCallback((rendition: unknown) => {
    renditionRef.current = rendition;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = rendition as any;
    r.themes.fontSize(`${fontSize}%`);
    setRenditionReady(true);

    r.on('selected', (cfiRange: string, contents: unknown) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const selection = (contents as any)?.window?.getSelection?.();
      const text = selection?.toString().trim();
      if (!text || text.length < 2) return;

      let x = window.innerWidth / 2;
      let y = window.innerHeight / 2;
      try {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const iframe = (contents as any)?.document?.defaultView?.frameElement as HTMLIFrameElement | null;
        const iframeRect = iframe?.getBoundingClientRect?.() ?? { left: 0, top: 0 };
        x = iframeRect.left + rect.left + rect.width / 2;
        y = iframeRect.top + rect.bottom;
      } catch { /* use center defaults */ }

      setPendingHighlight({ text, cfiRange, popupX: x, popupY: y });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // called once on mount — fontSize initial value is fine here

  // Keyboard arrow navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;
      if (!renditionRef.current) return;
      if (e.key === 'ArrowLeft') renditionRef.current.prev();
      else if (e.key === 'ArrowRight') renditionRef.current.next();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  function handleLocationChange(loc: string) {
    setLocation(loc);
    saveProgress({ position: loc });
  }

  // Use a ref so handleHighlightSave always has current onHighlightCreate
  const onHighlightCreateRef = useRef(onHighlightCreate);
  onHighlightCreateRef.current = onHighlightCreate;

  function handleHighlightSave(color: HighlightColor, note: string) {
    if (!pendingHighlight) return;

    onHighlightCreateRef.current?.({
      content: pendingHighlight.text,
      color,
      positionCfi: pendingHighlight.cfiRange,
      note,
    });

    // Apply visual annotation immediately (optimistic) — the useEffect will
    // also apply it once the query refetches, but this gives instant feedback.
    if (renditionRef.current) {
      try {
        renditionRef.current.annotations.add(
          'highlight',
          pendingHighlight.cfiRange,
          {},
          undefined,
          'epub-hl',
          { fill: EPUB_COLORS[color] },
        );
      } catch { /* ignore */ }
    }

    setPendingHighlight(null);
  }

  function handleHighlightCancel() {
    setPendingHighlight(null);
  }

  const isLoading = fileLoading || !progressLoaded;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-200 border-t-blue-600" />
      </div>
    );
  }

  if (error || !epubBuffer) {
    return (
      <div className="flex items-center justify-center h-full text-red-500">
        {error || 'Erro ao carregar EPUB.'}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Font size control */}
      <div className="flex items-center justify-end gap-2 bg-gray-100 border-b px-4 py-2 flex-shrink-0">
        <span className="text-sm text-gray-600">Tamanho do texto:</span>
        <button
          onClick={() => setFontSize((s) => Math.max(60, s - 10))}
          className="px-2 py-1 rounded text-sm bg-white border border-gray-300 hover:bg-gray-50"
        >
          A−
        </button>
        <span className="text-sm w-12 text-center">{fontSize}%</span>
        <button
          onClick={() => setFontSize((s) => Math.min(200, s + 10))}
          className="px-2 py-1 rounded text-sm bg-white border border-gray-300 hover:bg-gray-50"
        >
          A+
        </button>
      </div>

      {/* Reader */}
      <div className="flex-1 relative">
        <ReactReader
          url={epubBuffer}
          location={location}
          locationChanged={handleLocationChange}
          readerStyles={{ ...ReactReaderStyle }}
          getRendition={handleGetRendition}
          errorView={
            <div className="flex items-center justify-center h-full text-red-500 p-4 text-center">
              Não foi possível renderizar o EPUB. O arquivo pode estar corrompido.
            </div>
          }
        />
      </div>

      {pendingHighlight && (
        <HighlightPopup
          position={{ x: pendingHighlight.popupX, y: pendingHighlight.popupY }}
          selectedText={pendingHighlight.text}
          onSave={handleHighlightSave}
          onCancel={handleHighlightCancel}
        />
      )}
    </div>
  );
}
