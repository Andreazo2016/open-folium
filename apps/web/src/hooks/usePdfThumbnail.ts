import { useState, useEffect } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { api } from '../lib/api';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

// Simple in-memory cache keyed by bookId
const thumbnailCache = new Map<string, string>();

export function usePdfThumbnail(bookId: string) {
  const cached = thumbnailCache.get(bookId);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(cached ?? null);
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    if (thumbnailCache.has(bookId)) {
      setThumbnailUrl(thumbnailCache.get(bookId)!);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function generate() {
      try {
        const response = await api.get(`/books/${bookId}/file`, {
          responseType: 'arraybuffer',
        });
        if (cancelled) return;

        const data = new Uint8Array(response.data as ArrayBuffer);
        const loadingTask = pdfjsLib.getDocument({ data });
        const doc = await loadingTask.promise;
        if (cancelled) { doc.destroy(); return; }

        const page = await doc.getPage(1);
        const viewport = page.getViewport({ scale: 0.4 });

        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await page.render({ canvas, viewport }).promise;
        doc.destroy();

        if (!cancelled) {
          const url = canvas.toDataURL('image/jpeg', 0.8);
          thumbnailCache.set(bookId, url);
          setThumbnailUrl(url);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    }

    generate();
    return () => { cancelled = true; };
  }, [bookId]);

  return { thumbnailUrl, loading };
}
