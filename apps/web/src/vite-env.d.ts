/// <reference types="vite/client" />

// Polyfill declaration for Map.prototype.getOrInsertComputed (required by pdfjs-dist v5)
interface Map<K, V> {
  getOrInsertComputed(key: K, callbackfn: (key: K) => V): V;
}
