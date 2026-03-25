import { useState, useEffect, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { api } from '../lib/api';
import { useDebouncedSaveProgress } from '../hooks/useReader';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface Props {
  bookId: string;
  totalPages?: number | null;
}

export function PdfReader({ bookId, totalPages }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);

  const [numPages, setNumPages] = useState(totalPages ?? 0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.2);
  const [pageInput, setPageInput] = useState('1');
  const [loading, setLoading] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { progress, loaded: progressLoaded, saveProgress } = useDebouncedSaveProgress(bookId);

  // Restore saved page
  useEffect(() => {
    if (progressLoaded && progress?.page) {
      setCurrentPage(progress.page);
      setPageInput(String(progress.page));
    }
  }, [progressLoaded, progress]);

  // Load the PDF once
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const response = await api.get(`/books/${bookId}/file`, {
          responseType: 'arraybuffer',
        });

        if (cancelled) return;

        const data = new Uint8Array(response.data as ArrayBuffer);
        const loadingTask = pdfjsLib.getDocument({ data });
        const doc = await loadingTask.promise;

        if (cancelled) {
          doc.destroy();
          return;
        }

        pdfDocRef.current = doc;
        setNumPages(doc.numPages);
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          console.error('[PdfReader] load error:', err);
          setError('Não foi possível carregar o PDF. Verifique se o arquivo é válido.');
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
      pdfDocRef.current?.destroy();
      pdfDocRef.current = null;
    };
  }, [bookId]);

  // Render a specific page
  async function renderPage(pageNum: number) {
    const doc = pdfDocRef.current;
    const canvas = canvasRef.current;
    if (!doc || !canvas) return;

    // Cancel any in-progress render
    if (renderTaskRef.current) {
      renderTaskRef.current.cancel();
      renderTaskRef.current = null;
    }

    setRendering(true);

    try {
      const page = await doc.getPage(pageNum);
      const viewport = page.getViewport({ scale });

      canvas.width = viewport.width;
      canvas.height = viewport.height;

      const canvasContext = canvas.getContext('2d')!;
      const renderTask = page.render({ canvas: null, canvasContext, viewport });
      renderTaskRef.current = renderTask;
      await renderTask.promise;
      renderTaskRef.current = null;
    } catch (err: unknown) {
      const name = (err as { name?: string })?.name;
      if (name !== 'RenderingCancelledException') {
        console.error('[PdfReader] render error:', err);
      }
    } finally {
      setRendering(false);
    }
  }

  // Render when page or scale changes (and PDF is loaded)
  useEffect(() => {
    if (!loading && pdfDocRef.current) {
      renderPage(currentPage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, currentPage, scale]);

  function goToPage(n: number) {
    const page = Math.max(1, Math.min(n, numPages));
    setCurrentPage(page);
    setPageInput(String(page));
    saveProgress({ page });
  }

  // ── Render states ──────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-gray-100 gap-3 text-center px-6">
        <svg className="w-12 h-12 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
        <p className="text-red-600 font-medium">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-200">
      {/* Toolbar */}
      <div className="flex items-center justify-between bg-gray-800 text-white px-4 py-2 gap-4 flex-shrink-0">
        {/* Navigation */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage <= 1 || loading || rendering}
            className="px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-sm"
          >
            ← Ant.
          </button>

          <form
            onSubmit={(e) => { e.preventDefault(); const n = parseInt(pageInput, 10); if (!isNaN(n)) goToPage(n); }}
            className="flex items-center gap-1.5"
          >
            <input
              type="number"
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value)}
              onBlur={() => { const n = parseInt(pageInput, 10); if (!isNaN(n)) goToPage(n); }}
              min={1}
              max={numPages || 1}
              className="w-14 text-center bg-gray-700 rounded px-1 py-1 text-sm border border-gray-600 focus:outline-none focus:border-blue-400"
              disabled={loading}
            />
            <span className="text-gray-400 text-sm">/ {numPages || '?'}</span>
          </form>

          <button
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage >= numPages || loading || rendering}
            className="px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-sm"
          >
            Próx. →
          </button>
        </div>

        {/* Zoom */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setScale((s) => Math.max(0.5, +(s - 0.1).toFixed(1)))}
            disabled={rendering}
            className="w-8 h-8 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-lg font-bold"
          >
            −
          </button>
          <span className="text-sm w-12 text-center">{Math.round(scale * 100)}%</span>
          <button
            onClick={() => setScale((s) => Math.min(3.0, +(s + 0.1).toFixed(1)))}
            disabled={rendering}
            className="w-8 h-8 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-lg font-bold"
          >
            +
          </button>
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <div className="animate-spin rounded-full h-10 w-10 border-4 border-gray-400 border-t-blue-500" />
            <p className="text-gray-600 text-sm">Carregando PDF...</p>
          </div>
        ) : (
          <div className="flex justify-center py-6 px-4 min-h-full">
            <div className="relative">
              <canvas
                ref={canvasRef}
                className="shadow-xl bg-white"
                style={{ display: 'block' }}
              />
              {rendering && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/60">
                  <div className="animate-spin rounded-full h-8 w-8 border-4 border-gray-300 border-t-blue-500" />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
