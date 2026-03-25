import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { booksApi } from '../lib/api';

export function useBooks(search?: string) {
  return useQuery({
    queryKey: ['books', search],
    queryFn: () => booksApi.list(search).then((r) => r.data.books),
  });
}

export function useBook(id: string) {
  return useQuery({
    queryKey: ['book', id],
    queryFn: () => booksApi.get(id).then((r) => r.data.book),
    enabled: !!id,
  });
}

export function useUploadBook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      file,
      onProgress,
    }: {
      file: File;
      onProgress?: (pct: number) => void;
    }) => booksApi.upload(file, onProgress).then((r) => r.data.book),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['books'] }),
  });
}

export function useDeleteBook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => booksApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['books'] }),
  });
}

export function useUpdateBook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: { title?: string; author?: string };
    }) => booksApi.update(id, data).then((r) => r.data.book),
    onSuccess: (_book, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['books'] });
      queryClient.invalidateQueries({ queryKey: ['book', id] });
    },
  });
}
