/**
 * Entorno mínimo de navegador para los tests del outbox: `window` con el
 * bridge del Desktop (o sin él), `localStorage` en memoria e IndexedDB de
 * `fake-indexeddb`. Jest corre en `node`.
 */
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';

export function makeLocalStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    key: (i: number) => Array.from(data.keys())[i] ?? null,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, String(v)),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
  } as Storage;
}

type Listener = (ev: unknown) => void;

/** `window` de mentira con `addEventListener`/`dispatchEvent` reales. */
export function installWindow(opts: { desktop: boolean }): { events: string[] } {
  const listeners = new Map<string, Set<Listener>>();
  const events: string[] = [];
  const win: Record<string, unknown> = {
    addEventListener: (type: string, l: Listener) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(l);
    },
    removeEventListener: (type: string, l: Listener) => {
      listeners.get(type)?.delete(l);
    },
    dispatchEvent: (ev: { type: string }) => {
      events.push(ev.type);
      for (const l of listeners.get(ev.type) ?? []) l(ev);
      return true;
    },
    localStorage: makeLocalStorage(),
  };
  if (opts.desktop) {
    win.goAdminDesktop = {
      isOnline: async () => true,
      onConnectivity: () => {},
      printRaw: async () => ({ success: true }),
    };
  }
  const g = globalThis as Record<string, unknown>;
  g.window = win;
  g.localStorage = win.localStorage;
  if (typeof g.CustomEvent === 'undefined') {
    g.CustomEvent = class CustomEvent {
      type: string;
      detail: unknown;
      constructor(type: string, init?: { detail?: unknown }) {
        this.type = type;
        this.detail = init?.detail;
      }
    };
  }
  return { events };
}

export function uninstallWindow(): void {
  const g = globalThis as Record<string, unknown>;
  delete g.window;
  delete g.localStorage;
}

/** IndexedDB limpia para cada test. */
export function freshIndexedDb(): void {
  (globalThis as Record<string, unknown>).indexedDB = new IDBFactory();
}
