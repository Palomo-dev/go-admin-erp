/**
 * Colores enlazados a la marca del sitio (Figma «figma-estilo» 05, ColorField
 * variante «colores de la marca»). Un color de sección puede ser:
 *
 * - una referencia a un color del tema (`marca:acento`): si cambias la marca en
 *   «Estilo del sitio», el color cambia con ella;
 * - un hex personalizado (`#RRGGBB`): deja de seguir a la marca.
 *
 * Se guarda como texto en `seccion.diseno` del borrador V2, así el contrato del
 * documento no cambia y el sitio público resuelve con la misma función. Puro y
 * sin dependencias de React.
 */

export const ROLES_COLOR_MARCA = ['primario', 'secundario', 'acento', 'texto', 'fondo'] as const;
export type RolColorMarca = (typeof ROLES_COLOR_MARCA)[number];

/** Colores del tema (`documento.tema.colores`, ya resueltos a hex). */
export type ColoresMarca = Partial<Record<RolColorMarca, string | null | undefined>>;

const PREFIJO = 'marca:';

export function referenciaMarca(rol: RolColorMarca): string {
  return `${PREFIJO}${rol}`;
}

/** Rol enlazado si el valor es una referencia válida; `null` si es un hex u otra cosa. */
export function rolDeReferencia(valor: unknown): RolColorMarca | null {
  if (typeof valor !== 'string' || !valor.startsWith(PREFIJO)) return null;
  const rol = valor.slice(PREFIJO.length);
  return (ROLES_COLOR_MARCA as readonly string[]).includes(rol) ? (rol as RolColorMarca) : null;
}

export function esReferenciaMarca(valor: unknown): boolean {
  return rolDeReferencia(valor) !== null;
}

/**
 * Hex final del color: la referencia se resuelve contra los colores del tema;
 * un hex se devuelve tal cual. `null` si la referencia apunta a un color que el
 * tema no define o si el valor está vacío.
 */
export function resolverColorMarca(valor: unknown, colores: ColoresMarca): string | null {
  const rol = rolDeReferencia(valor);
  if (rol) return colores[rol] ?? null;
  return typeof valor === 'string' && valor.trim() !== '' ? valor : null;
}
