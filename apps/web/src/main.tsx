import React from 'react';
import ReactDOM from 'react-dom/client';

// pdfjs v5 requires Map.prototype.getOrInsertComputed (Chrome 136+)
if (!Map.prototype.getOrInsertComputed) {
  Map.prototype.getOrInsertComputed = function <K, V>(key: K, callbackfn: (key: K) => V): V {
    if (!this.has(key)) this.set(key, callbackfn(key));
    return this.get(key);
  };
}
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
);
