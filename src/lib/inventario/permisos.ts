/**
 * Permisos de inventario resueltos en el servidor (`fn_inventario_permisos`).
 *
 * Regla dura 6 de CLAUDE.md: nunca a partir del nombre de un rol ni de un valor
 * del cliente. La interfaz oculta o deshabilita con esto; cada RPC vuelve a
 * exigir con `fn_inventario_exigir_permiso(org, array['<acción>'])` y responde
 * 42501 `sin_permiso` si no. Mientras cargan, todo es `false`: no se ofrece una
 * acción que luego falle.
 *
 * Acciones (migración 20260929020100_inv_b0_2_permisos.sql):
 *   ver · crear · editar_catalogo · eliminar · ajustar · trasladar · recibir ·
 *   producir · garantias · costos · configurar
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/config';
import { ACCIONES_INVENTARIO, type AccionInventario, type ConfigInventario, type PermisosInventario } from './nucleo/tipos';

export const SIN_PERMISOS_INVENTARIO: PermisosInventario = {
  ver: false,
  crear: false,
  editar_catalogo: false,
  eliminar: false,
  ajustar: false,
  trasladar: false,
  recibir: false,
  producir: false,
  garantias: false,
  costos: false,
  configurar: false,
  resueltos: false,
};

/** Normaliza la respuesta de la RPC: solo `true` literal concede. */
export function aPermisosInventario(data: unknown): PermisosInventario {
  const p = (data ?? {}) as Record<string, unknown>;
  const salida = { ...SIN_PERMISOS_INVENTARIO, resueltos: true };
  for (const accion of ACCIONES_INVENTARIO) salida[accion] = p[accion] === true;
  return salida;
}

/** true si alguna de las acciones está concedida (misma semántica que `fn_inventario_exigir_permiso`). */
export function puede(permisos: PermisosInventario, ...acciones: AccionInventario[]): boolean {
  return acciones.some((a) => permisos[a] === true);
}

/**
 * Lee los permisos. `cliente` permite usarlo en servidor con
 * `getServerUserClient()`; por defecto, el cliente del navegador. Un error se
 * trata como «sin permisos» (resueltos), nunca como «todo permitido».
 */
export async function leerPermisosInventario(
  organizacionId: number,
  cliente: Pick<SupabaseClient, 'rpc'> = supabase,
): Promise<PermisosInventario> {
  const { data, error } = await cliente.rpc('fn_inventario_permisos', { p_org: organizacionId });
  if (error) return { ...SIN_PERMISOS_INVENTARIO, resueltos: true };
  return aPermisosInventario(data);
}

export const CONFIG_INVENTARIO_PREDETERMINADA: ConfigInventario = { bloquear_venta_sin_stock: false };

export function aConfigInventario(data: unknown): ConfigInventario {
  const c = (data ?? {}) as Record<string, unknown>;
  return { bloquear_venta_sin_stock: c.bloquear_venta_sin_stock === true };
}

/** Configuración del inventario de la organización (`fn_inventario_config`). */
export async function leerConfigInventario(
  organizacionId: number,
  cliente: Pick<SupabaseClient, 'rpc'> = supabase,
): Promise<ConfigInventario> {
  const { data, error } = await cliente.rpc('fn_inventario_config', { p_org: organizacionId });
  if (error) return CONFIG_INVENTARIO_PREDETERMINADA;
  return aConfigInventario(data);
}

/** Guarda la configuración (`fn_inventario_config_guardar`, exige `configurar`). Lanza el error de la RPC. */
export async function guardarConfigInventario(
  organizacionId: number,
  cambios: Partial<ConfigInventario>,
  cliente: Pick<SupabaseClient, 'rpc'> = supabase,
): Promise<ConfigInventario> {
  const { data, error } = await cliente.rpc('fn_inventario_config_guardar', { p_org: organizacionId, p_config: cambios });
  if (error) throw error;
  return aConfigInventario(data);
}
