/**
 * Historial único del editor (Deshacer / Rehacer): secciones, ajustes globales (encabezado, pie,
 * tema; `cambiarAjustes`) y cambios del documento (menús, estilo; `cambiarDocumento`), en el
 * orden en que se hicieron. Antes solo las secciones entraban en Deshacer (QA ROJO 28-oct, org 145).
 *
 * - `secciones`: el paso lo guarda `useHistory`; aquí solo se anota el orden.
 * - `ajustes`: valores antes/después de las columnas cambiadas; deshacer = volver a escribir `antes`.
 * - `documento`: raíces del documento que cambiaron (antes/después); deshacer = reponer esas raíces
 *   sobre el documento vigente, sin tocar las demás (páginas y secciones siguen su propio paso).
 * Puro: lo prueba historialEditor.test.ts.
 */
export type EntradaHistorial =
  | { tipo: 'secciones' }
  | { tipo: 'ajustes'; antes: Record<string, unknown>; despues: Record<string, unknown> }
  | { tipo: 'documento'; antes: Record<string, unknown>; despues: Record<string, unknown> };

export interface Historial {
  pasado: EntradaHistorial[];
  futuro: EntradaHistorial[];
}

export const MAX_PASOS = 50;

export const historialVacio = (): Historial => ({ pasado: [], futuro: [] });

export function registrar(h: Historial, e: EntradaHistorial): Historial {
  const pasado = [...h.pasado, e];
  if (pasado.length > MAX_PASOS) pasado.shift();
  return { pasado, futuro: [] };
}

export function sacarParaDeshacer(h: Historial): { entrada: EntradaHistorial | null; historial: Historial } {
  const entrada = h.pasado[h.pasado.length - 1];
  if (!entrada) return { entrada: null, historial: h };
  return { entrada, historial: { pasado: h.pasado.slice(0, -1), futuro: [...h.futuro, entrada] } };
}

export function sacarParaRehacer(h: Historial): { entrada: EntradaHistorial | null; historial: Historial } {
  const entrada = h.futuro[h.futuro.length - 1];
  if (!entrada) return { entrada: null, historial: h };
  return { entrada, historial: { pasado: [...h.pasado, entrada], futuro: h.futuro.slice(0, -1) } };
}

const copia = <T,>(v: T): T => (v === undefined ? (null as T) : (JSON.parse(JSON.stringify(v)) as T));

/** Valor que tenía cada columna de `cambios` en `actuales` (ausente = null). */
export function valoresPrevios(cambios: Record<string, unknown>, actuales: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const salida: Record<string, unknown> = {};
  for (const k of Object.keys(cambios)) salida[k] = copia(actuales ? actuales[k] : null);
  return salida;
}

/** Raíces del documento que cambiaron de `antes` a `despues` (por referencia). */
export function raicesCambiadas(antes: object, despues: object): { antes: Record<string, unknown>; despues: Record<string, unknown> } {
  const a = antes as Record<string, unknown>;
  const d = despues as Record<string, unknown>;
  const r = { antes: {} as Record<string, unknown>, despues: {} as Record<string, unknown> };
  for (const k of new Set([...Object.keys(a), ...Object.keys(d)])) {
    if (a[k] !== d[k]) {
      r.antes[k] = a[k];
      r.despues[k] = d[k];
    }
  }
  return r;
}

/** Repone `raices` sobre `doc` (una raíz `undefined` se quita). */
export function reponerRaices<T extends object>(doc: T, raices: Record<string, unknown>): T {
  const salida = { ...(doc as Record<string, unknown>) };
  for (const [k, v] of Object.entries(raices)) {
    if (v === undefined) delete salida[k];
    else salida[k] = v;
  }
  return salida as T;
}
