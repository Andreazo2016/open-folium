import { useState, useEffect, useRef, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { api } from '../lib/api';
import { useDebouncedSaveProgress } from '../hooks/useReader';
import { HighlightPopup } from './HighlightPopup';
import type { HighlightColor, HighlightDto } from '../types/highlights';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface Props {
  bookId: string;
  totalPages?: number | null;
  highlights?: HighlightDto[];
  onHighlightCreate?: (data: {
    content: string;
    color: HighlightColor;
    page: number;
    note: string;
  }) => void;
}

interface PendingHighlight {
  text: string;
  page: number;
  popupX: number;
  popupY: number;
}

// Semi-transparent background colors for PDF text layer spans
const PDF_HIGHLIGHT_COLORS: Record<HighlightColor, string> = {
  yellow: 'rgba(253, 224, 71, 0.55)',
  blue:   'rgba(147, 197, 253, 0.55)',
  green:  'rgba(134, 239, 172, 0.55)',
  pink:   'rgba(249, 168, 212, 0.55)',
};

/**
 * Given the text-layer div and the highlights for the current page,
 * mark spans whose text overlaps with each highlight's content.
 */
function applyHighlightsToTextLayer(
  textLayerDiv: HTMLDivElement,
  pageHighlights: HighlightDto[],
) {
  if (pageHighlights.length === 0) return;

  const spans = Array.from(textLayerDiv.querySelectorAll<HTMLSpanElement>('span'));

  // Build flat text + per-character span index
  let fullText = '';
  const spanMap: { span: HTMLSpanElement; start: number; end: number }[] = [];
  for (const span of spans) {
    const t = span.textContent ?? '';
    spanMap.push({ span, start: fullText.length, end: fullText.length + t.length });
    fullText += t;
  }

  const lowerFull = fullText.toLowerCase();

  for (const h of pageHighlights) {
    const needle = h.content.toLowerCase().trim();
    if (!needle) continue;
    const idx = lowerFull.indexOf(needle);
    if (idx === -1) continue;
    const matchEnd = idx + needle.length;
    const color = PDF_HIGHLIGHT_COLORS[h.color as HighlightColor] ?? PDF_HIGHLIGHT_COLORS.yellow;

    for (const { span, start, end } of spanMap) {
      if (end > idx && start < matchEnd) {
        span.style.backgroundColor = color;
        span.style.borderRadius = '2px';
      }
    }
  }
}

export function PdfReader({ bookId, totalPages, highlights, onHighlightCreate }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [numPages, setNumPages] = useState(totalPages ?? 0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.2);
  const [pageInput, setPageInput] = useState('1');
  const [loading, setLoading] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingHighlight, setPendingHighlight] = useState<PendingHighlight | null>(null);

  // Keep a ref so renderPage always sees the latest highlights without re-creating the callback
  const highlightsRef = useRef(highlights);
  highlightsRef.current = highlights;

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

  // Render a specific page + text layer
  const renderPage = useCallback(async (pageNum: number) => {
    const doc = pdfDocRef.current;
    const canvas = canvasRef.current;
    const textLayerDiv = textLayerRef.current;
    if (!doc || !canvas || !textLayerDiv) return;

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

      // Build text layer
      textLayerDiv.innerHTML = '';
      textLayerDiv.style.width = `${viewport.width}px`;
      textLayerDiv.style.height = `${viewport.height}px`;

      const textContent = await page.getTextContent();

      for (const item of textContent.items) {
        if (!('str' in item) || !item.str) continue;

        const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
        const span = document.createElement('span');
        span.textContent = item.str + (item.hasEOL ? ' ' : '');
        span.style.cssText = [
          'color: transparent',
          'position: absolute',
          'white-space: pre',
          'cursor: text',
          'transform-origin: 0% 0%',
          `left: ${tx[4]}px`,
          `top: ${tx[5]}px`,
          `font-size: ${Math.abs(tx[0]) || Math.abs(tx[1])}px`,
          `transform: matrix(${tx[0]}, ${tx[1]}, ${tx[2]}, ${tx[3]}, 0, 0)`,
        ].join(';');
        textLayerDiv.appendChild(span);
      }

      // Apply saved highlights for this page
      const pageHighlights = (highlightsRef.current ?? []).filter(
        (h) => h.page === pageNum,
      );
      applyHighlightsToTextLayer(textLayerDiv, pageHighlights);
    } catch (err: unknown) {
      const name = (err as { name?: string })?.name;
      if (name !== 'RenderingCancelledException') {
        console.error('[PdfReader] render error:', err);
      }
    } finally {
      setRendering(false);
    }
  }, [scale]);

  // Render when page or scale changes
  useEffect(() => {
    if (!loading && pdfDocRef.current) {
      renderPage(currentPage);
    }
  }, [loading, currentPage, scale, renderPage]);

  // Re-apply highlights when the highlights list changes (e.g. after new save or delete)
  // without re-rendering the whole page — just re-paint the text layer
  useEffect(() => {
    const textLayerDiv = textLayerRef.current;
    if (!textLayerDiv || loading || rendering) return;

    // Reset all span backgrounds first
    for (const span of textLayerDiv.querySelectorAll<HTMLSpanElement>('span')) {
      span.style.backgroundColor = '';
      span.style.borderRadius = '';
    }

    const pageHighlights = (highlights ?? []).filter((h) => h.page === currentPage);
    applyHighlightsToTextLayer(textLayerDiv, pageHighlights);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlights, currentPage]);

  function goToPage(n: number) {
    const page = Math.max(1, Math.min(n, numPages));
    setCurrentPage(page);
    setPageInput(String(page));
    saveProgress({ page });
    setPendingHighlight(null);
  }

  function handleMouseUp(e: React.MouseEvent) {
    if (!onHighlightCreate) return;
    const selection = window.getSelection();
    const text = selection?.toString().trim();
    if (!text || text.length < 2) return;

    setPendingHighlight({
      text,
      page: currentPage,
      popupX: e.clientX,
      popupY: e.clientY,
    });
  }

  function handleHighlightSave(color: HighlightColor, note: string) {
    if (!pendingHighlight) return;
    onHighlightCreate?.({
      content: pendingHighlight.text,
      color,
      page: pendingHighlight.page,
      note,
    });

    // Optimistic: apply immediately to the text layer without waiting for refetch
    const textLayerDiv = textLayerRef.current;
    if (textLayerDiv) {
      const fake: HighlightDto = {
        id: '__optimistic__',
        userId: '',
        bookId,
        content: pendingHighlight.text,
        color,
        page: pendingHighlight.page,
        positionCfi: null,
        note: note || null,
        createdAt: new Date().toISOString(),
      };
      applyHighlightsToTextLayer(textLayerDiv, [fake]);
    }

    window.getSelection()?.removeAllRanges();
    setPendingHighlight(null);
  }

  function handleHighlightCancel() {
    window.getSelection()?.removeAllRanges();
    setPendingHighlight(null);
  }

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
      <div ref={containerRef} className="flex-1 overflow-auto" onMouseUp={handleMouseUp}>
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <div className="animate-spin rounded-full h-10 w-10 border-4 border-gray-400 border-t-blue-500" />
            <p className="text-gray-600 text-sm">Carregando PDF...</p>
          </div>
        ) : (
          <div className="flex justify-center py-6 px-4 min-h-full">
            <div className="relative select-text">
              <canvas
                ref={canvasRef}
                className="shadow-xl bg-white"
                style={{ display: 'block' }}
              />
              <div
                ref={textLayerRef}
                className="absolute top-0 left-0 overflow-hidden"
                style={{ userSelect: 'text' }}
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
