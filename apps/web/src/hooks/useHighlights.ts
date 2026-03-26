import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { highlightsApi } from '../lib/api';
import type { HighlightColor } from '../types/highlights';

export function useHighlights(bookId: string) {
  return useQuery({
    queryKey: ['highlights', bookId],
    queryFn: () => highlightsApi.list(bookId).then((r) => r.data.highlights),
  });
}

export function useCreateHighlight(bookId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      content: string;
      color?: HighlightColor;
      page?: number;
      positionCfi?: string;
      note?: string;
    }) => highlightsApi.create(bookId, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['highlights', bookId] }),
  });
}

export function useUpdateHighlight(bookId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; note?: string | null; color?: HighlightColor }) =>
      highlightsApi.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['highlights', bookId] }),
  });
}

export function useDeleteHighlight(bookId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => highlightsApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['highlights', bookId] }),
  });
}
