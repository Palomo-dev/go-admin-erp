/**
 * Dónde guarda el kiosco su clave y su cola sin conexión (plan de Marcación §4.3, D7).
 * Solo navegador.
 *
 * Clave del equipo, del más seguro al menos seguro:
 *  1. GO Admin Escritorio: `goAdminDesktop.kioscoMarcacion` (cifrada con
 *     `safeStorage` del sistema operativo, `electron/src/main/kioscoMarcacion.ts`).
 *  2. App móvil (Capacitor): un plugin de almacenamiento seguro si la app lo trae
 *     (`SecureStoragePlugin`, Keystore/Keychain). HOY la app no lo incluye: se usa
 *     `Preferences` (almacenamiento privado de la app, sin cifrar). Pendiente en
 *     `mobile/`: sumar `@aparajita/capacitor-secure-storage` y nada más cambia aquí.
 *  3. Navegador: `localStorage` del origen. Revocar la clave en GO Admin corta al
 *     equipo aunque alguien la copie.
 *
 * Cola sin conexión: IndexedDB. El valor de la credencial (PIN o carné) va cifrado
 * con AES-GCM con una llave NO exportable que vive en la misma base (Web Crypto):
 * quien copie los datos no puede leer los PIN sin ejecutar código en esta tablet.
 * Se borra de la cola en cuanto el servidor responde.
 */
import { getMobileBridge } from '@/lib/utils/mobile';
import type { MarcaPendiente } from '@/lib/hrm/kiosco/cola';

const CLAVE_LLAVE = 'goadmin.kiosco.llave';
const BD = 'goadmin-kiosco';
const VERSION_BD = 1;
const TABLA_COLA = 'cola';
const TABLA_LLAVES = 'llaves';

interface PuenteEscritorio {
  leerLlave(): Promise<string | null>;
  guardarLlave(llave: string): Promise<boolean>;
  borrarLlave(): Promise<boolean>;
}

interface PluginSeguro {
  get(o: { key: string }): Promise<{ value: string | null }>;
  set(o: { key: string; value: string }): Promise<unknown>;
  remove(o: { key: string }): Promise<unknown>;
}

function puenteEscritorio(): PuenteEscritorio | null {
  if (typeof window === 'undefined') return null;
  const d = (window as unknown as { goAdminDesktop?: { kioscoMarcacion?: PuenteEscritorio } }).goAdminDesktop;
  return d?.kioscoMarcacion ?? null;
}

function pluginMovil(): PluginSeguro | null {
  const b = getMobileBridge() as unknown as { Plugins?: Record<string, unknown> } | null;
  const p = b?.Plugins;
  return ((p?.SecureStoragePlugin ?? p?.SecureStorage ?? p?.Preferences) as PluginSeguro | undefined) ?? null;
}

/** Dónde quedó la clave (se muestra en el pie técnico, nunca la clave). */
export function almacenDeLlave(): 'escritorio' | 'movil' | 'navegador' {
  if (puenteEscritorio()) return 'escritorio';
  if (pluginMovil()) return 'movil';
  return 'navegador';
}

export async function leerLlave(): Promise<string | null> {
  try {
    const e = puenteEscritorio();
    if (e) return await e.leerLlave();
    const m = pluginMovil();
    if (m) return (await m.get({ key: CLAVE_LLAVE })).value;
    return window.localStorage.getItem(CLAVE_LLAVE);
  } catch {
    return null;
  }
}

export async function guardarLlave(llave: string): Promise<void> {
  const e = puenteEscritorio();
  if (e) {
    await e.guardarLlave(llave);
    return;
  }
  const m = pluginMovil();
  if (m) {
    await m.set({ key: CLAVE_LLAVE, value: llave });
    return;
  }
  window.localStorage.setItem(CLAVE_LLAVE, llave);
}

export async function borrarLlave(): Promise<void> {
  try {
    const e = puenteEscritorio();
    if (e) await e.borrarLlave();
    const m = pluginMovil();
    if (m) await m.remove({ key: CLAVE_LLAVE });
    window.localStorage.removeItem(CLAVE_LLAVE);
  } catch {
    // Nada que hacer: la clave revocada ya no sirve en el servidor.
  }
}

// ─── Cola cifrada en IndexedDB ───────────────────────────────────────────────

function abrir(): Promise<IDBDatabase> {
  return new Promise((ok, mal) => {
    const r = indexedDB.open(BD, VERSION_BD);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains(TABLA_COLA)) db.createObjectStore(TABLA_COLA, { keyPath: 'id_local' });
      if (!db.objectStoreNames.contains(TABLA_LLAVES)) db.createObjectStore(TABLA_LLAVES);
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => mal(r.error);
  });
}

function pedido<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((ok, mal) => {
    r.onsuccess = () => ok(r.result);
    r.onerror = () => mal(r.error);
  });
}

async function llaveCifrado(db: IDBDatabase): Promise<CryptoKey> {
  const leida = await pedido(db.transaction(TABLA_LLAVES).objectStore(TABLA_LLAVES).get('cola'));
  if (leida instanceof CryptoKey) return leida;
  const nueva = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  await pedido(db.transaction(TABLA_LLAVES, 'readwrite').objectStore(TABLA_LLAVES).put(nueva, 'cola'));
  return nueva;
}

interface FilaCola extends Omit<MarcaPendiente, 'credencial'> {
  tipo: MarcaPendiente['credencial']['tipo'];
  iv: Uint8Array;
  cifrado: ArrayBuffer;
}

export async function guardarEnCola(m: MarcaPendiente): Promise<void> {
  const db = await abrir();
  try {
    const llave = await llaveCifrado(db);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cifrado = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, llave, new TextEncoder().encode(m.credencial.valor));
    const fila: FilaCola = { id_local: m.id_local, hora: m.hora, hora_equipo: m.hora_equipo, intentos: m.intentos, tipo: m.credencial.tipo, iv, cifrado };
    await pedido(db.transaction(TABLA_COLA, 'readwrite').objectStore(TABLA_COLA).put(fila));
  } finally {
    db.close();
  }
}

export async function leerCola(): Promise<MarcaPendiente[]> {
  if (typeof indexedDB === 'undefined') return [];
  const db = await abrir();
  try {
    const llave = await llaveCifrado(db);
    const filas = (await pedido(db.transaction(TABLA_COLA).objectStore(TABLA_COLA).getAll())) as FilaCola[];
    const out: MarcaPendiente[] = [];
    for (const f of filas) {
      try {
        const claro = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: f.iv }, llave, f.cifrado);
        out.push({ id_local: f.id_local, hora: f.hora, hora_equipo: f.hora_equipo, intentos: f.intentos, credencial: { tipo: f.tipo, valor: new TextDecoder().decode(claro) } });
      } catch {
        // Ilegible (llave nueva tras borrar datos del sitio): no se puede enviar.
      }
    }
    return out;
  } finally {
    db.close();
  }
}

/** Reemplaza la cola: quita lo resuelto y guarda los intentos de lo que sigue. */
export async function reemplazarCola(quedan: readonly MarcaPendiente[]): Promise<void> {
  const db = await abrir();
  try {
    const ids = new Set(quedan.map((m) => m.id_local));
    const tienda = db.transaction(TABLA_COLA, 'readwrite').objectStore(TABLA_COLA);
    const todas = (await pedido(tienda.getAllKeys())) as string[];
    const tx = db.transaction(TABLA_COLA, 'readwrite').objectStore(TABLA_COLA);
    for (const id of todas) if (!ids.has(id)) tx.delete(id);
    for (const m of quedan) {
      const fila = (await pedido(db.transaction(TABLA_COLA).objectStore(TABLA_COLA).get(m.id_local))) as FilaCola | undefined;
      if (fila && fila.intentos !== m.intentos) await pedido(db.transaction(TABLA_COLA, 'readwrite').objectStore(TABLA_COLA).put({ ...fila, intentos: m.intentos }));
    }
  } finally {
    db.close();
  }
}
