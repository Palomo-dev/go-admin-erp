/**
 * Medición del desfase del reloj del equipo contra el servidor.
 *
 * Se mide al abrir el POS y al abrir la caja (`useDesfaseReloj`). El último
 * desfase medido se guarda en el equipo: una venta o una apertura de caja hecha
 * SIN CONEXIÓN lo lleva consigo, y el servidor decide con él si su hora es
 * fiable (`fn_hora_oficial_resolver`, `horaOficial.ts`).
 *
 * Nada de esto fija la hora de una operación en línea: esa la pone siempre el
 * servidor. Aquí solo se mide para avisar al cajero y para el caso sin red.
 */

import { calcularDesfaseMs } from './horaOficial';

export const RUTA_HORA_SERVIDOR = '/api/pos/hora-servidor';
const CLAVE = 'goadmin:pos:desfase-reloj';
/** Una medición más vieja que esto se sigue usando, pero se vuelve a medir. */
export const VIGENCIA_MEDICION_MS = 15 * 60_000;

export interface MedicionDesfase {
  /** Reloj del equipo − reloj del servidor, en ms. */
  desfaseMs: number;
  /** Momento de la medición, en reloj del SERVIDOR (ISO). */
  medidoEn: string;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * Lee la hora del servidor: el cuerpo `{ ahora }` de la ruta ligera y, si no
 * viene, la cabecera `Date` de la misma respuesta.
 */
async function horaDeRespuesta(res: Response): Promise<number | null> {
  try {
    const cuerpo = (await res.json()) as { ahora?: unknown };
    if (typeof cuerpo?.ahora === 'string') {
      const t = Date.parse(cuerpo.ahora);
      if (Number.isFinite(t)) return t;
    }
  } catch {
    // Sin cuerpo JSON: se intenta con la cabecera.
  }
  const cabecera = res.headers.get('date');
  const t = cabecera ? Date.parse(cabecera) : NaN;
  return Number.isFinite(t) ? t : null;
}

/**
 * Mide el desfase con una ida y vuelta. Devuelve null sin red o si el
 * servidor no responde (no se inventa un desfase).
 */
export async function medirDesfase(
  fetchImpl: FetchLike = (input, init) => fetch(input, init),
  reloj: () => number = () => Date.now(),
): Promise<MedicionDesfase | null> {
  try {
    const antesMs = reloj();
    const res = await fetchImpl(RUTA_HORA_SERVIDOR, { cache: 'no-store', credentials: 'same-origin' });
    const despuesMs = reloj();
    if (!res.ok) return null;
    const servidorMs = await horaDeRespuesta(res);
    if (servidorMs === null) return null;
    const desfaseMs = calcularDesfaseMs({ antesMs, despuesMs, servidorMs });
    return { desfaseMs, medidoEn: new Date(servidorMs).toISOString() };
  } catch {
    return null;
  }
}

/** Último desfase medido en este equipo, o null (nunca medido, o almacenamiento bloqueado). */
export function leerDesfaseGuardado(): MedicionDesfase | null {
  try {
    if (typeof window === 'undefined') return null;
    const crudo = window.localStorage.getItem(CLAVE);
    if (!crudo) return null;
    const v = JSON.parse(crudo) as Partial<MedicionDesfase>;
    if (typeof v.desfaseMs !== 'number' || !Number.isFinite(v.desfaseMs) || typeof v.medidoEn !== 'string') return null;
    return { desfaseMs: v.desfaseMs, medidoEn: v.medidoEn };
  } catch {
    return null;
  }
}

export function guardarDesfase(medicion: MedicionDesfase): void {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(CLAVE, JSON.stringify(medicion));
  } catch {
    // Almacenamiento bloqueado: la operación sin conexión irá sin desfase y quedará para revisión.
  }
}

/** Desfase (ms) que lleva una operación sin conexión: el último medido, o null. */
export function desfaseParaOperacionSinConexion(): number | null {
  return leerDesfaseGuardado()?.desfaseMs ?? null;
}
