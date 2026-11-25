/**
 * «El filtro recuerda la última elección, por persona y por pantalla, pero SOLO durante el día»
 * (decisión 2 aprobada el 2026-11-25, Figma 3300-420477 › 07). Al día siguiente vuelve el defecto
 * para que nadie mire «Ayer» creyendo que es hoy.
 *
 * Puro: recibe el almacén (en el navegador, `localStorage`) y el «hoy» de la ORGANIZACIÓN
 * (`useFormatDate().getToday()`), nunca el del navegador. Lo prueba `__tests__/filtroDelDia.test.ts`.
 * Todo acceso al almacén va en try/catch: en una ventana privada o con el almacenamiento
 * bloqueado la pantalla funciona igual, con el defecto.
 */

export interface AlmacenFiltro {
  getItem(clave: string): string | null;
  setItem(clave: string, valor: string): void;
  removeItem(clave: string): void;
}

interface Guardado<T> {
  dia: string;
  valor: T;
}

/** Una clave por organización, persona y pantalla. */
export function claveFiltroDelDia(pantalla: string, organizacionId: number | string | null | undefined, usuarioId: string | null | undefined): string {
  return `goadmin:filtro-dia:${pantalla}:${organizacionId ?? '-'}:${usuarioId ?? '-'}`;
}

export function guardarFiltroDelDia<T>(almacen: AlmacenFiltro | null | undefined, clave: string, hoy: string, valor: T): void {
  if (!almacen) return;
  try {
    almacen.setItem(clave, JSON.stringify({ dia: hoy, valor } satisfies Guardado<T>));
  } catch {
    // Sin almacenamiento: no se recuerda, sin más.
  }
}

/**
 * El filtro guardado HOY, o `null` (no hay, es de otro día o está dañado). Uno de otro día se
 * borra al leerlo.
 */
export function leerFiltroDelDia<T>(almacen: AlmacenFiltro | null | undefined, clave: string, hoy: string): T | null {
  if (!almacen) return null;
  try {
    const crudo = almacen.getItem(clave);
    if (!crudo) return null;
    const g = JSON.parse(crudo) as Partial<Guardado<T>> | null;
    if (!g || typeof g !== 'object' || g.dia !== hoy || g.valor === undefined) {
      almacen.removeItem(clave);
      return null;
    }
    return g.valor as T;
  } catch {
    return null;
  }
}

export function olvidarFiltroDelDia(almacen: AlmacenFiltro | null | undefined, clave: string): void {
  if (!almacen) return;
  try {
    almacen.removeItem(clave);
  } catch {
    // Nada que olvidar.
  }
}

/** `localStorage` si existe y se deja usar; si no, `null`. */
export function almacenDelNavegador(): AlmacenFiltro | null {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}
