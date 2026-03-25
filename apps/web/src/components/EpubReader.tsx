import { useState, useEffect, useRef, useCallback } from 'react';
import { ReactReader, ReactReaderStyle } from 'react-reader';
import { api } from '../lib/api';
import { useDebouncedSaveProgress } from '../hooks/useReader';

interface Props {
  bookId: string;
}

export function EpubReader({ bookId }: Props) {
  const [epubBuffer, setEpubBuffer] = useState<ArrayBuffer | null>(null);
  const [location, setLocation] = useState<string | null>(null);
  const [fontSize, setFontSize] = useState(100);
  const [error, setError] = useState<string | null>(null);
  const [fileLoading, setFileLoading] = useState(true);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renditionRef = useRef<any>(null);

  const { progress, loaded: progressLoaded, saveProgress } = useDebouncedSaveProgress(bookId);

  // Fetch EPUB as ArrayBuffer (authenticated) — avoids blob URL issues with epub.js
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

  // Set initial location once progress is loaded
  useEffect(() => {
    if (progressLoaded) {
      setLocation(progress?.position ?? null);
    }
  }, [progressLoaded, progress]);

  // Apply font size changes to existing rendition without re-initializing
  useEffect(() => {
    if (renditionRef.current) {
      renditionRef.current.themes.fontSize(`${fontSize}%`);
    }
  }, [fontSize]);

  const handleGetRendition = useCallback((rendition: unknown) => {
    renditionRef.current = rendition;
    (rendition as { themes: { fontSize: (s: string) => void } }).themes.fontSize(`${fontSize}%`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally empty — only called once on mount

  function handleLocationChange(loc: string) {
    setLocation(loc);
    saveProgress({ position: loc });
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
          readerStyles={{
            ...ReactReaderStyle,
          }}
          getRendition={handleGetRendition}
          errorView={
            <div className="flex items-center justify-center h-full text-red-500 p-4 text-center">
              Não foi possível renderizar o EPUB. O arquivo pode estar corrompido.
            </div>
          }
        />
      </div>
    </div>
  );
}
