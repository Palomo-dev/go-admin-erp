/**
 * Alcance de una caja del POS según el modo de la organización
 * (`organization_settings.pos_cash_session_mode`). Módulo hoja, sin
 * dependencias: lo usan `CajasService.openSession`, el diálogo de apertura y
 * las pruebas (K3/K4 de docs/implementacion/CAJAS-VENTAS-PLAN.md).
 *
 * - Modo `branch` (por defecto): una caja por sucursal que comparten todos los
 *   cajeros, o una caja global (`branch_id` NULL) para todas las sucursales.
 * - Modo `user`: cada cajero su caja dentro de la sucursal; no hay caja global.
 */

export type ModoCaja = 'branch' | 'user';
export type AlcanceApertura = 'branch' | 'global';

/** Alcances que se ofrecen al abrir. En modo `user` solo la sucursal actual. */
export function alcancesDisponibles(modo: ModoCaja): AlcanceApertura[] {
  return modo === 'user' ? ['branch'] : ['branch', 'global'];
}

/** Alcance efectivo de una apertura: en modo `user` se ignora «global». */
export function alcanceApertura(modo: ModoCaja, pedido?: AlcanceApertura | null): AlcanceApertura {
  if (modo === 'user') return 'branch';
  return pedido === 'global' ? 'global' : 'branch';
}

/** Sucursal de la caja que se abre: NULL para la global. */
export function sucursalDeApertura(alcance: AlcanceApertura, sucursalActual: number | null): number | null {
  return alcance === 'global' ? null : sucursalActual;
}

/**
 * Espejo de `fn_cash_session_open_scope_key` (disparador BEFORE de
 * `cash_sessions`, índice `ux_cash_sessions_abierta_por_alcance`):
 * `b:{sucursal|g}` en modo `branch`, `u:{sucursal|g}:{usuario}` en modo `user`.
 */
export function claveAlcance(modo: ModoCaja, sucursal: number | null, usuario: string): string {
  const s = sucursal == null ? 'g' : String(sucursal);
  return modo === 'user' ? `u:${s}:${usuario}` : `b:${s}`;
}

export type CodigoCajaYaAbierta = 'caja_global_abierta' | 'caja_propia_abierta' | 'caja_sucursal_abierta';

/**
 * Código del error cuando ya hay una caja abierta en el alcance (el 23505 del
 * índice único o la comprobación previa). Se traduce con `cajas.errores.*`.
 */
export function codigoCajaYaAbierta(modo: ModoCaja, alcance: AlcanceApertura): CodigoCajaYaAbierta {
  if (alcance === 'global') return 'caja_global_abierta';
  return modo === 'user' ? 'caja_propia_abierta' : 'caja_sucursal_abierta';
}

/** `caja_ya_cerrada` → `cajaYaCerrada` (clave de `cajas.errores`). */
export function claveTraduccionError(codigo: string): string {
  return codigo.replace(/_([a-z])/g, (_, letra: string) => letra.toUpperCase());
}
