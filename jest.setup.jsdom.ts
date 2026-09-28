// ============================================================
// Setup de Jest para las pruebas de render (docblock `@jest-environment jsdom`).
//
// jsdom no trae `fetch` y `src/lib/supabase/config.ts` lo lee (y exige su URL)
// al importarse: cualquier componente que importe el kit completo lo arrastra.
// Aquí se deja un `fetch` que falla siempre —una prueba de render nunca debe
// salir a la red, y si lo intenta falla de forma visible— y una URL ficticia.
// En el entorno `node` (el de casi todas las pruebas) no hace nada.
// ============================================================

const g = globalThis as unknown as { window?: unknown; fetch?: unknown };

if (typeof g.window !== 'undefined') {
  if (typeof g.fetch !== 'function') {
    g.fetch = () => Promise.reject(new Error('fetch no disponible en las pruebas de render (jsdom)'));
  }
  // El cliente del navegador se crea al importar `@/lib/supabase/config`: con
  // una URL local ficticia se construye sin red (el `fetch` de arriba falla).
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'http://127.0.0.1:54321';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'clave-anonima-de-pruebas';
}

export {};
