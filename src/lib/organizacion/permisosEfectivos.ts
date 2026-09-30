// ============================================================
// Permisos efectivos legibles (Perfil › Organización y roles, Figma 346:21440).
//
// Lógica pura: recibe el catálogo `permissions` y los códigos efectivos que
// resolvió el SERVIDOR (`get_user_permission_codes`: rol + cargo, con
// precedencia del cargo) y los agrupa por módulo con nombres legibles.
// Nunca decide nada por el nombre de un rol (regla 6): «acceso total» llega
// ya resuelto por id de rol / super admin desde la ruta.
// ============================================================

/** Fila del catálogo `permissions` (columnas verificadas por MCP 2026-09-30). */
export interface FilaPermiso {
  code: string;
  name: string | null;
  description: string | null;
  module: string;
}

export interface PermisoLegible {
  codigo: string;
  nombre: string;
}

export interface GrupoPermisos {
  modulo: string;
  permitidos: PermisoLegible[];
  /** Permisos del mismo módulo que la persona NO tiene. */
  noIncluidos: PermisoLegible[];
}

const PREFIJO_PERMITE = /^permite\s+/i;

function capitalizar(texto: string): string {
  return texto.charAt(0).toLocaleUpperCase('es') + texto.slice(1);
}

/** ¿Parece un identificador y no un texto para personas? (`pos_access`, `Create`). */
function pareceCodigo(texto: string, codigo: string): boolean {
  return texto === codigo || /^[a-z0-9_.]+$/.test(texto);
}

/**
 * Nombre para personas. Orden: `description` (en español y completa; se quita
 * el «Permite …» inicial), luego `name` si no es un identificador, y por último
 * el código con los separadores cambiados por espacios.
 */
export function nombreLegible(p: Pick<FilaPermiso, 'code' | 'name' | 'description'>): string {
  const descripcion = p.description?.trim();
  if (descripcion) return capitalizar(descripcion.replace(PREFIJO_PERMITE, '').replace(/\.$/, ''));
  const nombre = p.name?.trim();
  if (nombre && !pareceCodigo(nombre, p.code)) return capitalizar(nombre);
  return capitalizar(p.code.replace(/[._]+/g, ' ').trim());
}

const porNombre = (a: PermisoLegible, b: PermisoLegible) => a.nombre.localeCompare(b.nombre, 'es');

/**
 * Agrupa por módulo. Solo aparecen los módulos donde la persona tiene al menos
 * un permiso; con `'todos'` (acceso total resuelto en el servidor) aparecen
 * todos y ninguno tiene «no incluidos». Módulos por código, permisos por nombre.
 */
export function agruparPermisos(
  catalogo: readonly FilaPermiso[],
  efectivos: ReadonlySet<string> | 'todos',
): GrupoPermisos[] {
  const grupos = new Map<string, GrupoPermisos>();
  for (const fila of catalogo) {
    if (!fila?.code || !fila.module) continue;
    const grupo = grupos.get(fila.module) ?? { modulo: fila.module, permitidos: [], noIncluidos: [] };
    const legible = { codigo: fila.code, nombre: nombreLegible(fila) };
    if (efectivos === 'todos' || efectivos.has(fila.code)) grupo.permitidos.push(legible);
    else grupo.noIncluidos.push(legible);
    grupos.set(fila.module, grupo);
  }
  return [...grupos.values()]
    .filter((g) => g.permitidos.length > 0)
    .map((g) => ({ ...g, permitidos: g.permitidos.sort(porNombre), noIncluidos: g.noIncluidos.sort(porNombre) }))
    .sort((a, b) => a.modulo.localeCompare(b.modulo));
}

/** Respuesta de `GET /api/me/permisos`. */
export interface RespuestaPermisos {
  organizationId: number;
  accesoTotal: boolean;
  total: number;
  grupos: GrupoPermisos[];
}
