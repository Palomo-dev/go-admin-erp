// ============================================================
// «¿Qué puede hacer esta persona?» (Figma «13. Equipo › Roles y permisos»,
// flujo 7 y componentes ChipOrigen / TarjetaRolCargo).
//
// Lógica pura. QUÉ puede hacer no se decide aquí: llega resuelto por el
// servidor con `get_user_permission_codes` —la misma función que usan
// `fn_tiene_permiso`, `/api/me/permisos` y el contexto del cliente— o como
// «acceso total» con `isOrgAdminLike` (super admin o rol 1/2 por id). Aquí solo
// se anota POR QUÉ: si el permiso viene del rol, del cargo o de ser admin, y si
// el cargo lo quita (`allowed = false`, que la base admite aunque hoy no haya
// ninguna fila así).
// ============================================================

import type { PermisoCatalogo } from './matrizPermisos';

export type OrigenPermiso = 'rol' | 'cargo' | 'admin';

export interface PermisoConOrigen {
  permiso: PermisoCatalogo;
  concedido: boolean;
  origenes: OrigenPermiso[];
  /** El rol lo da pero el cargo lo define en `false` (precedencia del cargo). */
  quitadoPorCargo: boolean;
}

export interface EntradaOrigen {
  catalogo: readonly PermisoCatalogo[];
  /** Resultado del servidor: códigos efectivos o «todos» (acceso total). */
  efectivos: ReadonlySet<string> | 'todos';
  /** Códigos que el rol concede (`role_permissions.allowed`). */
  codigosRol: ReadonlySet<string>;
  /** Lo que el cargo define: código → allowed. */
  cargo: ReadonlyMap<string, boolean>;
}

export function anotarOrigenes(e: EntradaOrigen): PermisoConOrigen[] {
  return e.catalogo.map((permiso) => {
    if (e.efectivos === 'todos') {
      return { permiso, concedido: true, origenes: ['admin'], quitadoPorCargo: false };
    }
    const delCargo = e.cargo.get(permiso.codigo);
    const delRol = e.codigosRol.has(permiso.codigo);
    const concedido = e.efectivos.has(permiso.codigo);
    const origenes: OrigenPermiso[] = [];
    if (concedido) {
      if (delRol && delCargo !== false) origenes.push('rol');
      if (delCargo === true) origenes.push('cargo');
    }
    return { permiso, concedido, origenes, quitadoPorCargo: delRol && delCargo === false };
  });
}

export interface ConteoOrigenes {
  /** Lo que da el rol. */
  rol: number;
  /** Lo que el cargo suma por encima del rol. */
  cargoSuma: number;
  /** Lo que el cargo quita del rol. */
  cargoQuita: number;
  /** Total efectivo (sin duplicados). */
  total: number;
}

export function contarOrigenes(permisos: readonly PermisoConOrigen[], codigosRol: ReadonlySet<string>): ConteoOrigenes {
  let cargoSuma = 0;
  let cargoQuita = 0;
  let total = 0;
  for (const p of permisos) {
    if (p.concedido) total += 1;
    if (p.concedido && p.origenes.includes('cargo') && !codigosRol.has(p.permiso.codigo)) cargoSuma += 1;
    if (p.quitadoPorCargo) cargoQuita += 1;
  }
  return { rol: codigosRol.size, cargoSuma, cargoQuita, total };
}

export type Explicacion =
  | { tipo: 'puede'; origenes: OrigenPermiso[] }
  | { tipo: 'noPuede'; motivo: 'ningunoLoDa' | 'cargoLoQuita'; sensible: boolean };

export function explicar(p: PermisoConOrigen): Explicacion {
  if (p.concedido) return { tipo: 'puede', origenes: p.origenes };
  return { tipo: 'noPuede', motivo: p.quitadoPorCargo ? 'cargoLoQuita' : 'ningunoLoDa', sensible: p.permiso.sensible !== null };
}

export interface GrupoEfectivo {
  modulo: string;
  permisos: PermisoConOrigen[];
  concedidos: number;
}

/** Agrupa por módulo; con `soloConcedidos` deja fuera lo que no puede hacer. */
export function agruparEfectivos(
  permisos: readonly PermisoConOrigen[],
  etiquetaModulo: (modulo: string) => string = (m) => m,
  soloConcedidos = true,
): GrupoEfectivo[] {
  const grupos = new Map<string, GrupoEfectivo>();
  for (const p of permisos) {
    if (soloConcedidos && !p.concedido) continue;
    const g = grupos.get(p.permiso.modulo) ?? { modulo: p.permiso.modulo, permisos: [], concedidos: 0 };
    g.permisos.push(p);
    if (p.concedido) g.concedidos += 1;
    grupos.set(p.permiso.modulo, g);
  }
  return [...grupos.values()]
    .map((g) => ({ ...g, permisos: g.permisos.sort((a, b) => a.permiso.nombre.localeCompare(b.permiso.nombre, 'es')) }))
    .sort((a, b) => etiquetaModulo(a.modulo).localeCompare(etiquetaModulo(b.modulo), 'es'));
}
