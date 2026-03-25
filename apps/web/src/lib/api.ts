import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '../store/auth';
import type { BookDto, ReadingProgressDto } from '../types/books';

const API_URL = import.meta.env.VITE_API_URL || '/api';

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor — attach Bearer token
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const accessToken = useAuthStore.getState().accessToken;
  if (accessToken && config.headers) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

// Track whether we're currently refreshing to avoid infinite loops
let isRefreshing = false;
let pendingRequests: Array<(token: string) => void> = [];

function onRefreshed(token: string) {
  pendingRequests.forEach((resolve) => resolve(token));
  pendingRequests = [];
}

function addPendingRequest(resolve: (token: string) => void) {
  pendingRequests.push(resolve);
}

// Response interceptor — auto-refresh on 401
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        // Queue request until refresh completes
        return new Promise((resolve) => {
          addPendingRequest((token: string) => {
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${token}`;
            }
            resolve(api(originalRequest));
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const response = await axios.post<{ accessToken: string }>(
          `${API_URL}/auth/refresh`,
          {},
          { withCredentials: true }
        );

        const { accessToken } = response.data;
        useAuthStore.getState().setAccessToken(accessToken);
        onRefreshed(accessToken);

        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        }

        return api(originalRequest);
      } catch {
        // Refresh failed — clear auth state
        useAuthStore.getState().clearAuth();
        pendingRequests = [];
        return Promise.reject(error);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

// Books API helpers
export const booksApi = {
  upload: (file: File, onProgress?: (pct: number) => void) => {
    const form = new FormData();
    form.append('file', file);
    return api.post<{ book: BookDto }>('/books/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (e) => {
        if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100));
      },
    });
  },

  list: (search?: string) =>
    api.get<{ books: BookDto[] }>('/books', { params: search ? { search } : {} }),

  get: (id: string) => api.get<{ book: BookDto }>(`/books/${id}`),

  getFileUrl: (id: string) => `${API_URL}/books/${id}/file`,

  getCoverUrl: (id: string) => `${API_URL}/books/${id}/cover`,

  delete: (id: string) => api.delete(`/books/${id}`),

  update: (id: string, data: { title?: string; author?: string }) =>
    api.patch<{ book: BookDto }>(`/books/${id}`, data),

  getProgress: (id: string) =>
    api.get<{ progress: ReadingProgressDto | null }>(`/books/${id}/progress`),

  saveProgress: (id: string, data: { page?: number; position?: string }) =>
    api.patch<{ progress: ReadingProgressDto }>(`/books/${id}/progress`, data),
};

// Auth API helpers
export const authApi = {
  register: (data: { name: string; email: string; password: string }) =>
    api.post<{ accessToken: string; user: { id: string; name: string; email: string } }>(
      '/auth/register',
      data
    ),

  login: (data: { email: string; password: string }) =>
    api.post<{ accessToken: string; user: { id: string; name: string; email: string } }>(
      '/auth/login',
      data
    ),

  logout: () => api.post('/auth/logout'),

  refresh: () => api.post<{ accessToken: string }>('/auth/refresh'),

  me: () =>
    api.get<{ id: string; name: string; email: string; createdAt: string }>('/auth/me'),
};
