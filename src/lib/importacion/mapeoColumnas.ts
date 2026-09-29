/**
 * Reconocimiento de columnas por alias, genérico para cualquier importador.
 *
 * Extraído del importador de productos (`src/lib/inventario/importacion/campos.ts`,
 * que ahora delega aquí con sus propias definiciones) para que el de leads use
 * exactamente la misma regla: la cabecera se normaliza (sin tildes, sin signos,
 * minúsculas) y se compara con alias ya normalizados; cada campo se asigna a la
 * PRIMERA columna que lo nombra, salvo los campos `multiple`, que aceptan
 * varias columnas (p. ej. tres columnas de URL de fuente).
 */

import { normalizarCabecera } from '@/lib/inventario/importacion/texto';

export interface DefinicionColumna<C extends string> {
  campo: C;
  /** Alias ya normalizados con `normalizarCabecera`. */
  alias: readonly string[];
  obligatorio?: boolean;
  /** Admite varias columnas (sus valores se juntan). */
  multiple?: boolean;
}

/** Asignación columna del archivo → campo (o `null` = «No importar»). */
export type MapeoDe<C extends string> = Array<C | null>;

export function autoMapearCon<C extends string>(defs: readonly DefinicionColumna<C>[], cabeceras: unknown[]): MapeoDe<C> {
  const usados = new Set<C>();
  return cabeceras.map((h) => {
    const norm = normalizarCabecera(h);
    if (!norm) return null;
    for (const def of defs) {
      if (usados.has(def.campo) && !def.multiple) continue;
      if (def.alias.includes(norm)) {
        usados.add(def.campo);
        return def.campo;
      }
    }
    return null;
  });
}

/**
 * Primera fila (de las 10 primeras) que reconoce al menos `minimo` columnas y
 * alguno de los campos `clave`. Los Excel reales traen títulos arriba. `-1` si no hay.
 */
export function encontrarFilaCabeceraCon<C extends string>(
  defs: readonly DefinicionColumna<C>[],
  matriz: unknown[][],
  clave: readonly C[],
  minimo = 2,
): number {
  for (let i = 0; i < Math.min(10, matriz.length); i++) {
    const mapa = autoMapearCon(defs, matriz[i] ?? []);
    const reconocidas = mapa.filter(Boolean).length;
    if (reconocidas >= minimo && clave.some((c) => mapa.includes(c))) return i;
  }
  return -1;
}

/**
 * Cambia el campo de una columna; si otro ya lo tenía y el campo no es
 * `multiple`, se lo quita (un campo, una columna).
 */
export function reasignarColumnaCon<C extends string>(
  defs: readonly DefinicionColumna<C>[],
  mapeo: MapeoDe<C>,
  columna: number,
  campo: C | null,
): MapeoDe<C> {
  const multiple = !!campo && defs.some((d) => d.campo === campo && d.multiple);
  return mapeo.map((c, i) => {
    if (i === columna) return campo;
    if (campo && c === campo && !multiple) return null;
    return c;
  });
}
