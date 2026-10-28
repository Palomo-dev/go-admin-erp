/**
 * Fuentes enlazadas al tema del sitio (Figma «figma-estilo» 06 FontField).
 * Una sección puede usar la fuente de títulos o de texto del tema
 * (`tema:titulos`, `tema:cuerpo`: si cambias el estilo global, cambia con él)
 * o una familia concreta del catálogo del tema. `null` = la fuente por defecto
 * de ese campo. Se guarda como texto en `seccion.diseno`. Puro.
 */

export const ROLES_FUENTE_TEMA = ['titulos', 'cuerpo'] as const;
export type RolFuenteTema = (typeof ROLES_FUENTE_TEMA)[number];

export type FuentesTema = Partial<Record<RolFuenteTema, string | null | undefined>>;

const PREFIJO = 'tema:';

export function referenciaFuenteTema(rol: RolFuenteTema): string {
  return `${PREFIJO}${rol}`;
}

export function rolFuenteDeReferencia(valor: unknown): RolFuenteTema | null {
  if (typeof valor !== 'string' || !valor.startsWith(PREFIJO)) return null;
  const rol = valor.slice(PREFIJO.length);
  return (ROLES_FUENTE_TEMA as readonly string[]).includes(rol) ? (rol as RolFuenteTema) : null;
}

/**
 * Familia final: `null` toma la fuente del rol por defecto; una referencia se
 * resuelve contra el tema; una familia se devuelve tal cual.
 */
export function resolverFuenteTema(valor: unknown, fuentes: FuentesTema, porDefecto: RolFuenteTema): string | null {
  if (valor === null || valor === undefined || valor === '') return fuentes[porDefecto] ?? null;
  const rol = rolFuenteDeReferencia(valor);
  if (rol) return fuentes[rol] ?? null;
  return typeof valor === 'string' ? valor : null;
}

/** `true` si el valor sigue al tema (vacío o referencia). */
export function sigueAlTema(valor: unknown): boolean {
  return valor === null || valor === undefined || valor === '' || rolFuenteDeReferencia(valor) !== null;
}

/**
 * Fuente del encabezado de sección (`title_font` / `description_font`), guardada como la lee la
 * tienda: sin clave o `'site'` = la del sitio; si no, una familia. Para `FontField`:
 * `'site'`/vacío → `null`; al guardar, `null` o la referencia al rol por defecto → `undefined`
 * (se borra la clave), la otra referencia del tema → su familia, una familia → igual.
 */
export function fuenteEncabezadoAlCampo(guardado: unknown): string | null {
  return typeof guardado === 'string' && guardado && guardado !== 'site' ? guardado : null;
}

export function fuenteEncabezadoAlGuardar(valor: string | null, fuentes: FuentesTema, porDefecto: RolFuenteTema): string | undefined {
  if (valor == null || valor === '' || valor === 'site') return undefined;
  const rol = rolFuenteDeReferencia(valor);
  if (rol === porDefecto) return undefined;
  if (rol) return fuentes[rol] ?? undefined;
  return valor;
}
