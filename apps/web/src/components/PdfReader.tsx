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

interface TextItemInfo {
  str: string;
  hasEOL: boolean;
  span: HTMLSpanElement;
}

const PDF_HIGHLIGHT_COLORS: Record<HighlightColor, string> = {
  yellow: 'rgba(253, 224, 71, 0.55)',
  blue:   'rgba(147, 197, 253, 0.55)',
  green:  'rgba(134, 239, 172, 0.55)',
  pink:   'rgba(249, 168, 212, 0.55)',
};

/** Paint saved highlights onto the text layer by matching text content. */
function applyHighlightsToTextLayer(
  items: TextItemInfo[],
  pageHighlights: HighlightDto[],
) {
  if (pageHighlights.length === 0) return;

  // Build normalised fullText (single spaces between items) and track spans
  let fullText = '';
  const itemMap: { item: TextItemInfo; start: number; end: number }[] = [];
  for (const item of items) {
    const t = item.str;
    if (!t) continue;
    if (fullText.length > 0 && !fullText.endsWith(' ')) fullText += ' ';
    const start = fullText.length;
    fullText += t;
    const end = fullText.length;
    itemMap.push({ item, start, end });
  }

  // Normalise whitespace in the haystack too, building a position map
  const rawLower = fullText.toLowerCase();
  // Build a collapsed version (multi-space → single) with index mapping
  let collapsed = '';
  const collapsedToRaw: number[] = [];
  let prevSpace = false;
  for (let i = 0; i < rawLower.length; i++) {
    const ch = rawLower[i];
    const isWs = /\s/.test(ch);
    if (isWs && prevSpace) continue; // skip extra whitespace
    collapsed += isWs ? ' ' : ch;
    collapsedToRaw.push(i);
    prevSpace = isWs;
  }

  for (const h of pageHighlights) {
    const needle = h.content.toLowerCase().trim().replace(/\s+/g, ' ');
    if (!needle) continue;
    const idx = collapsed.indexOf(needle);
    if (idx === -1) continue;
    // Map collapsed range back to raw range
    const rawStart = collapsedToRaw[idx];
    const rawEnd = collapsedToRaw[idx + needle.length - 1] + 1;
    const color = PDF_HIGHLIGHT_COLORS[h.color as HighlightColor] ?? PDF_HIGHLIGHT_COLORS.yellow;
    for (const { item, start, end } of itemMap) {
      if (end > rawStart && start < rawEnd) {
        item.span.style.backgroundColor = color;
        item.span.style.borderRadius = '2px';
      }
    }
  }
}

export function PdfReader({ bookId, totalPages, highlights, onHighlightCreate }: Props) {
  const canvasRef      = useRef<HTMLCanvasElement>(null);
  const textLayerRef   = useRef<HTMLDivElement>(null);
  const renderTaskRef  = useRef<pdfjsLib.RenderTask | null>(null);
  const pdfDocRef      = useRef<pdfjsLib.PDFDocumentProxy | null>(null);

  // Rich text items for the current page (includes DOM span refs)
  const textItemsRef   = useRef<TextItemInfo[]>([]);

  const [numPages, setNumPages]       = useState(totalPages ?? 0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale]             = useState(1.2);
  const [pageInput, setPageInput]     = useState('1');
  const [loading, setLoading]         = useState(true);
  const [rendering, setRendering]     = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [pendingHighlight, setPendingHighlight] = useState<PendingHighlight | null>(null);

  const { progress, loaded: progressLoaded, saveProgress } = useDebouncedSaveProgress(bookId);

  useEffect(() => {
    if (progressLoaded && progress?.page) {
      setCurrentPage(progress.page);
      setPageInput(String(progress.page));
    }
  }, [progressLoaded, progress]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await api.get(`/books/${bookId}/file`, { responseType: 'arraybuffer' });
        if (cancelled) return;
        const data = new Uint8Array(response.data as ArrayBuffer);
        const doc = await pdfjsLib.getDocument({ data }).promise;
        if (cancelled) { doc.destroy(); return; }
        pdfDocRef.current = doc;
        setNumPages(doc.numPages);
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          console.error('[PdfReader] load error:', err);
          setError('Não foi possível carregar o PDF.');
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

      canvas.width  = viewport.width;
      canvas.height = viewport.height;
      const canvasContext = canvas.getContext('2d')!;
      const renderTask = page.render({ canvas: canvas, canvasContext, viewport });
      renderTaskRef.current = renderTask;
      await renderTask.promise;
      renderTaskRef.current = null;

      // ── Build text layer ────────────────────────────────────────────────
      textLayerDiv.innerHTML = '';
      textLayerDiv.style.width  = `${viewport.width}px`;
      textLayerDiv.style.height = `${viewport.height}px`;

      const textContent = await page.getTextContent();
      const richItems: TextItemInfo[] = [];

      for (const raw of textContent.items) {
        if (!('str' in raw) || !raw.str) continue;
        const item = raw as { str: string; hasEOL: boolean; transform: number[]; width: number; height: number };

        const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
        const fontSize = Math.sqrt(tx[2] * tx[2] + tx[3] * tx[3]);
        const itemW    = item.width  * Math.abs(tx[0] / (item.transform[0] || 1));
        const itemH    = fontSize;
        const itemX    = tx[4];
        const itemY    = tx[5] - itemH;

        const span = document.createElement('span');
        span.textContent = item.str + (item.hasEOL ? '\n' : '');
        span.style.cssText = [
          'color: transparent',
          'position: absolute',
          'white-space: pre',
          `left: ${itemX}px`,
          `top: ${itemY}px`,
          `width: ${Math.max(itemW, 1)}px`,
          `height: ${Math.max(itemH, 1)}px`,
          `font-size: ${fontSize}px`,
          'overflow: hidden',
        ].join(';');

        textLayerDiv.appendChild(span);
        richItems.push({ str: item.str, hasEOL: item.hasEOL, span });
      }

      textItemsRef.current = richItems;
    } catch (err: unknown) {
      if ((err as { name?: string })?.name !== 'RenderingCancelledException') {
        console.error('[PdfReader] render error:', err);
      }
    } finally {
      setRendering(false);
    }
  }, [scale]);

  useEffect(() => {
    if (!loading && pdfDocRef.current) renderPage(currentPage);
  }, [loading, currentPage, scale, renderPage]);

  // Apply highlights on existing spans whenever highlights change or page finishes rendering.
  useEffect(() => {
    if (rendering) return;
    const items = textItemsRef.current;
    if (!items.length) return;
    // Clear previous highlight backgrounds
    for (const { span } of items) {
      span.style.backgroundColor = '';
      span.style.borderRadius = '';
    }
    const pageHighlights = (highlights ?? []).filter(h => h.page === currentPage);
    applyHighlightsToTextLayer(items, pageHighlights);
  }, [highlights, currentPage, rendering]);

  // Keyboard arrow navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') goToPage(currentPage - 1);
      else if (e.key === 'ArrowRight') goToPage(currentPage + 1);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  function goToPage(n: number) {
    const page = Math.max(1, Math.min(n, numPages));
    setCurrentPage(page);
    setPageInput(String(page));
    saveProgress({ page });
    window.getSelection()?.removeAllRanges();
    setPendingHighlight(null);
  }

  // ── Native text selection ────────────────────────────────────────────────

  function handleTextLayerMouseUp(e: React.MouseEvent) {
    if (!onHighlightCreate || rendering) return;

    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;

    const text = selection.toString().replace(/\s+/g, ' ').trim();
    if (text.length < 2) return;

    // Make sure the selection is inside the text layer
    const textLayer = textLayerRef.current;
    if (
      !textLayer ||
      !selection.anchorNode ||
      !selection.focusNode ||
      !textLayer.contains(selection.anchorNode) ||
      !textLayer.contains(selection.focusNode)
    ) return;

    setPendingHighlight({ text, page: currentPage, popupX: e.clientX, popupY: e.clientY });
  }

  function handleHighlightSave(color: HighlightColor, note: string) {
    if (!pendingHighlight) return;
    onHighlightCreate?.({ content: pendingHighlight.text, color, page: pendingHighlight.page, note });

    window.getSelection()?.removeAllRanges();

    // Optimistic paint
    const fake: HighlightDto = {
      id: '__opt__', userId: '', bookId,
      content: pendingHighlight.text, color,
      page: pendingHighlight.page, positionCfi: null,
      note: note || null, createdAt: new Date().toISOString(),
    };
    applyHighlightsToTextLayer(textItemsRef.current, [fake]);
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
          <button onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage <= 1 || loading || rendering}
            className="px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-sm">
            ← Ant.
          </button>
          <form onSubmit={(e) => { e.preventDefault(); const n = parseInt(pageInput,10); if(!isNaN(n)) goToPage(n); }}
            className="flex items-center gap-1.5">
            <input type="number" value={pageInput}
              onChange={e => setPageInput(e.target.value)}
              onBlur={() => { const n = parseInt(pageInput,10); if(!isNaN(n)) goToPage(n); }}
              min={1} max={numPages||1} disabled={loading}
              className="w-14 text-center bg-gray-700 rounded px-1 py-1 text-sm border border-gray-600 focus:outline-none focus:border-blue-400" />
            <span className="text-gray-400 text-sm">/ {numPages||'?'}</span>
          </form>
          <button onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage >= numPages || loading || rendering}
            className="px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-sm">
            Próx. →
          </button>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setScale(s => Math.max(0.5, +(s-0.1).toFixed(1)))} disabled={rendering}
            className="w-8 h-8 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-lg font-bold">−</button>
          <span className="text-sm w-12 text-center">{Math.round(scale*100)}%</span>
          <button onClick={() => setScale(s => Math.min(3.0, +(s+0.1).toFixed(1)))} disabled={rendering}
            className="w-8 h-8 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-lg font-bold">+</button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <div className="animate-spin rounded-full h-10 w-10 border-4 border-gray-400 border-t-blue-500" />
            <p className="text-gray-600 text-sm">Carregando PDF...</p>
          </div>
        ) : (
          <div className="flex justify-center py-6 px-4 min-h-full">
            <div className="relative">
              <canvas ref={canvasRef} className="shadow-xl bg-white" style={{ display: 'block' }} />

              {/* Text layer — selectable transparent spans on top of canvas */}
              <div
                ref={textLayerRef}
                className="pdf-text-layer absolute top-0 left-0"
                onMouseUp={handleTextLayerMouseUp}
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
