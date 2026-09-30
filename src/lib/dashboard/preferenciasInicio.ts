/**
 * Preferencias del inicio por usuario y organización (tabla
 * `user_dashboard_preferences`; Figma 448:196794 «Personalizar el inicio» y
 * 646:32649 «Módulos — Reordenar y ocultar»).
 *
 * Regla pura: qué se puede guardar y cómo se aplica. La valida el servidor
 * antes de escribir (la tabla solo acota tamaños) y la usa la pantalla para
 * ordenar y filtrar.
 *
 * - «Hoy» no se puede ocultar (el diseño lo marca «Siempre visible»).
 * - Los módulos válidos son los que el servidor le muestra a esa persona en
 *   esa organización (nunca una lista cableada): lo demás se descarta.
 * - Ocultar no cambia permisos ni `organization_modules`: solo deja de
 *   consultarse en su inicio.
 */

/** Bloques del inicio que se pueden ocultar, en el orden en que se pintan. */
export const BLOQUES_OCULTABLES = ['indicadores', 'ventas', 'actividad', 'tiendaWeb'] as const;
export type BloqueInicio = (typeof BLOQUES_OCULTABLES)[number];

export const MAX_MODULOS_PREFERENCIA = 60;
const RE_CODIGO = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;

export interface PreferenciasInicio {
  bloquesOcultos: BloqueInicio[];
  modulosOrden: string[];
  modulosOcultos: string[];
}

export const PREFERENCIAS_VACIAS: PreferenciasInicio = { bloquesOcultos: [], modulosOrden: [], modulosOcultos: [] };

function listaDeTextos(v: unknown, max: number): string[] | null {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.length > max) return null;
  const salida: string[] = [];
  for (const x of v) {
    if (typeof x !== 'string') return null;
    const c = x.trim();
    if (!RE_CODIGO.test(c)) return null;
    if (!salida.includes(c)) salida.push(c);
  }
  return salida;
}

/**
 * Valida lo que llega en el body. `null` = forma inválida (400). Los códigos
 * de módulo que la persona no ve (o que no existen) se descartan en silencio:
 * un módulo que se desactivó después no debe impedir guardar lo demás.
 */
export function validarPreferencias(crudo: unknown, modulosVisibles: readonly string[]): PreferenciasInicio | null {
  if (!crudo || typeof crudo !== 'object' || Array.isArray(crudo)) return null;
  const c = crudo as Record<string, unknown>;
  const bloques = listaDeTextos(c.bloquesOcultos, BLOQUES_OCULTABLES.length);
  const orden = listaDeTextos(c.modulosOrden, MAX_MODULOS_PREFERENCIA);
  const ocultos = listaDeTextos(c.modulosOcultos, MAX_MODULOS_PREFERENCIA);
  if (!bloques || !orden || !ocultos) return null;
  if (bloques.some((b) => !(BLOQUES_OCULTABLES as readonly string[]).includes(b))) return null;
  const visible = (m: string) => modulosVisibles.includes(m);
  return {
    bloquesOcultos: bloques as BloqueInicio[],
    modulosOrden: orden.filter(visible),
    modulosOcultos: ocultos.filter(visible),
  };
}

/** Fila de la base → preferencias (tolerante: una fila rara no rompe el inicio). */
export function desdeFila(fila: { bloques_ocultos?: unknown; modulos_orden?: unknown; modulos_ocultos?: unknown } | null | undefined): PreferenciasInicio {
  if (!fila) return { ...PREFERENCIAS_VACIAS };
  const lista = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  return {
    bloquesOcultos: lista(fila.bloques_ocultos).filter((b): b is BloqueInicio => (BLOQUES_OCULTABLES as readonly string[]).includes(b)),
    modulosOrden: lista(fila.modulos_orden),
    modulosOcultos: lista(fila.modulos_ocultos),
  };
}

/**
 * Ordena los códigos según la preferencia: primero los que la persona colocó,
 * en su orden; después el resto, en el orden por defecto (el del menú).
 */
export function ordenarModulos<T extends { codigo: string }>(modulos: readonly T[], orden: readonly string[]): T[] {
  const pos = new Map(orden.map((c, i) => [c, i]));
  return modulos
    .map((m, i) => ({ m, i }))
    .sort((a, b) => {
      const pa = pos.get(a.m.codigo);
      const pb = pos.get(b.m.codigo);
      if (pa !== undefined && pb !== undefined) return pa - pb;
      if (pa !== undefined) return -1;
      if (pb !== undefined) return 1;
      return a.i - b.i;
    })
    .map((x) => x.m);
}

/** Mueve un código una posición (reordenar con botones: accesible con teclado). */
export function moverModulo(orden: readonly string[], codigo: string, direccion: -1 | 1): string[] {
  const i = orden.indexOf(codigo);
  const j = i + direccion;
  if (i < 0 || j < 0 || j >= orden.length) return [...orden];
  const copia = [...orden];
  [copia[i], copia[j]] = [copia[j], copia[i]];
  return copia;
}

export function bloqueVisible(p: PreferenciasInicio, bloque: BloqueInicio): boolean {
  return !p.bloquesOcultos.includes(bloque);
}
