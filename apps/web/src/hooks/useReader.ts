import { useState, useEffect, useCallback, useRef } from 'react';
import { booksApi } from '../lib/api';
import type { ReadingProgressDto } from '../types/books';

export function useReadingProgress(bookId: string) {
  const [progress, setProgress] = useState<ReadingProgressDto | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    booksApi
      .getProgress(bookId)
      .then((r) => {
        setProgress(r.data.progress);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [bookId]);

  const saveProgress = useCallback(
    async (data: { page?: number; position?: string }) => {
      try {
        const result = await booksApi.saveProgress(bookId, data);
        setProgress(result.data.progress);
      } catch {
        // silently ignore progress save errors
      }
    },
    [bookId]
  );

  return { progress, loaded, saveProgress };
}

export function useDebouncedSaveProgress(bookId: string, delay = 2000) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { progress, loaded, saveProgress } = useReadingProgress(bookId);

  const debouncedSave = useCallback(
    (data: { page?: number; position?: string }) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => saveProgress(data), delay);
    },
    [saveProgress, delay]
  );

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return { progress, loaded, saveProgress: debouncedSave };
}
