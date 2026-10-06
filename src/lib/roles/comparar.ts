// ============================================================
// «Comparar roles» (Figma «13. Equipo › Roles y permisos», flujo E): hasta
// tres roles lado a lado, por módulo, con «solo diferencias». Lógica pura.
// ============================================================

import type { PermisoCatalogo } from './matrizPermisos';

export const MAX_ROLES_COMPARAR = 3;

export interface RolComparable {
  id: number;
  permisoIds: readonly number[];
}

export interface FilaComparacion {
  permiso: PermisoCatalogo;
  /** Un valor por rol, en el orden recibido. */
  tiene: boolean[];
  diferente: boolean;
}

export interface GrupoComparacion {
  modulo: string;
  filas: FilaComparacion[];
}

export function compararRoles(
  roles: readonly RolComparable[],
  catalogo: readonly PermisoCatalogo[],
  opciones: { soloDiferencias?: boolean; etiquetaModulo?: (m: string) => string } = {},
): GrupoComparacion[] {
  const conjuntos = roles.map((r) => new Set(r.permisoIds));
  const etiqueta = opciones.etiquetaModulo ?? ((m: string) => m);
  const grupos = new Map<string, FilaComparacion[]>();
  for (const permiso of catalogo) {
    const tiene = conjuntos.map((s) => s.has(permiso.id));
    // Una fila que ningún rol tiene no aporta nada a la comparación.
    if (!tiene.some(Boolean)) continue;
    const diferente = tiene.some((v) => v !== tiene[0]);
    if (opciones.soloDiferencias && !diferente) continue;
    const filas = grupos.get(permiso.modulo) ?? [];
    filas.push({ permiso, tiene, diferente });
    grupos.set(permiso.modulo, filas);
  }
  return [...grupos.entries()]
    .map(([modulo, filas]) => ({ modulo, filas: filas.sort((a, b) => a.permiso.nombre.localeCompare(b.permiso.nombre, 'es')) }))
    .sort((a, b) => etiqueta(a.modulo).localeCompare(etiqueta(b.modulo), 'es'));
}

/** Cuántos permisos tiene el rol `i` que no tiene el rol 0 (subtítulo de cada columna). */
export function diferenciaContraPrimero(roles: readonly RolComparable[]): number[] {
  if (roles.length === 0) return [];
  const primero = new Set(roles[0].permisoIds);
  return roles.map((r, i) => (i === 0 ? 0 : r.permisoIds.filter((id) => !primero.has(id)).length));
}
