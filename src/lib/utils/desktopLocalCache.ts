/**
 * Caché local de "última respuesta buena" para Go Admin Desktop.
 *
 * `offlineCache.ts` ya cachea en IndexedDB las respuestas GET de Supabase,
 * pero solo las sirve cuando `navigator.onLine === false` y solo si esa URL
 * exacta se pidió antes. Para lo que el POS necesita sí o sí para imprimir
 * sin internet (impresoras por estación, cabecera del negocio) hace falta
 * algo más explícito: se guarda por clave de negocio al cargar con red y se
 * lee cuando el Desktop informa de que no hay conectividad real, sin esperar
 * a que la consulta a Supabase agote sus timeouts.
 *
 * Solo se usa dentro del Desktop; en el navegador estas funciones no escriben
 * ni leen nada, así que el comportamiento fuera del Desktop no cambia.
 */

import { isDesktop } from './desktop';

const PREFIX = 'goadmin:desktop-cache:';

interface CacheEnvelope<T> {
  value: T;
  savedAt: number;
}

function storage(): Storage | null {
  if (!isDesktop()) return null;
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Guarda `value` bajo `key`. Silencioso: la caché nunca rompe el flujo. */
export function writeDesktopCache<T>(key: string, value: T): void {
  const store = storage();
  if (!store) return;
  try {
    const envelope: CacheEnvelope<T> = { value, savedAt: Date.now() };
    store.setItem(PREFIX + key, JSON.stringify(envelope));
  } catch {
    // Cuota llena o storage bloqueado: se sigue sin caché.
  }
}

/** Devuelve el valor guardado bajo `key`, o null si no hay (o no es Desktop). */
export function readDesktopCache<T>(key: string): T | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(PREFIX + key);
    if (!raw) return null;
    const envelope = JSON.parse(raw) as CacheEnvelope<T>;
    return envelope?.value ?? null;
  } catch {
    return null;
  }
}
