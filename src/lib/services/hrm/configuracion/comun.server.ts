/**
 * Ayudas comunes de la configuración de Recursos humanos (diálogo de
 * Configuración, diseños 10.RH.1–10.RH.5). El permiso lo resuelve la base
 * (`fn_hr_puede`, rol + cargo); el cliente nunca lo decide.
 */
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { HrmError, errorDeRpc } from '../tipos';

export type CtxConfig = Pick<ServerOrgContext, 'supabase' | 'organizationId' | 'userId'>;

export async function puede(ctx: CtxConfig, codigo: string): Promise<boolean> {
  const { data, error } = await ctx.supabase.rpc('fn_hr_puede', { p_org: ctx.organizationId, p_code: codigo });
  if (error) throw errorDeRpc(error);
  return data === true;
}

export async function exigir(ctx: CtxConfig, codigo: string): Promise<void> {
  if (!(await puede(ctx, codigo))) throw new HrmError(403, 'sin_permiso');
}

/** Lanza el error traducido de una consulta de Supabase. */
export function sinError<T>(r: { data: T; error: { code?: string | null; message?: string | null } | null }): T {
  if (r.error) throw errorDeRpc(r.error);
  return r.data;
}

export interface Opcion {
  id: string;
  nombre: string;
  detalle?: string | null;
}

/** Sedes activas de la organización (para selects). */
export async function sedes(ctx: CtxConfig): Promise<Opcion[]> {
  const filas = sinError(
    await ctx.supabase.from('branches').select('id, name').eq('organization_id', ctx.organizationId).eq('is_active', true).order('name'),
  ) as { id: number; name: string }[] | null;
  return (filas ?? []).map((b) => ({ id: String(b.id), nombre: b.name }));
}

/** Cargos activos de la organización. */
export async function cargos(ctx: CtxConfig): Promise<Opcion[]> {
  const filas = sinError(
    await ctx.supabase.from('job_positions').select('id, name').eq('organization_id', ctx.organizationId).eq('is_active', true).order('name'),
  ) as { id: string; name: string }[] | null;
  return (filas ?? []).map((c) => ({ id: c.id, nombre: c.name }));
}
