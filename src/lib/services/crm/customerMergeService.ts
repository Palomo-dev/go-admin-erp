/**
 * Duplicados y fusión de clientes (Figma CRM 1436:19 «Duplicados — listo»,
 * 1438:1553 «Fusión — error, nada cambió»). Todo en RPC transaccionales
 * aplicadas (verificadas por MCP el 2026-10-06), con la sesión del usuario:
 *  - `crm_find_duplicates(p_org)`: grupos por teléfono (8 últimos dígitos),
 *    correo y documento, con conteos (permiso `crm.customers.view`);
 *  - `crm_merge_customers(p_org, p_primary, p_secondaries[1], p_choices)`:
 *    mueve conversaciones, oportunidades, llamadas, identidades, facturas en
 *    borrador, actividades y contactos de campaña; aplica los campos elegidos;
 *    archiva el secundario (no lo borra) y deja la foto para deshacer
 *    (`crm.customers.merge`; bloquea si hay factura emitida);
 *  - `crm_unmerge_customer(p_org, p_merge)`: deshace dentro de 30 días (solo
 *    administrador);
 *  - `crm_exclude_customer_pair`: «no son el mismo».
 * Antes la fusión eran N escrituras sueltas desde el navegador, sin
 * transacción ni forma de deshacer. SOLO servidor.
 */
export { CAMPOS_FUSION, type CampoFusion, type ClienteDuplicado, type GrupoDuplicados } from './customerMergeLogica';
import { z } from 'zod';
import { CAMPOS_FUSION, sinParejasExcluidas, type GrupoDuplicados } from './customerMergeLogica';
import { CRM_PERMISOS, CrmHttpError, exigirPermisoCrm, exigirUuid, tienePermisoCrm, type CrmSesion } from './crmRouteSupport';

export const fusionSchema = z
  .object({
    primary_id: z.string().uuid(),
    secondary_id: z.string().uuid(),
    choices: z.record(z.enum(CAMPOS_FUSION), z.string().uuid()).default({}),
  })
  .strict()
  .refine((v) => v.primary_id !== v.secondary_id, { message: 'seleccion_invalida' })
  .refine((v) => Object.values(v.choices).every((id) => id === v.primary_id || id === v.secondary_id), { message: 'eleccion_invalida' });

export const exclusionSchema = z.object({ a: z.string().uuid(), b: z.string().uuid() }).strict().refine((v) => v.a !== v.b);

export async function buscarDuplicados(ctx: CrmSesion): Promise<{ grupos: GrupoDuplicados[]; puedeFusionar: boolean; puedeDeshacer: boolean }> {
  await exigirPermisoCrm(ctx, [CRM_PERMISOS.clientesVer], 'buscar duplicados');
  const [dup, excl, puedeFusionar] = await Promise.all([
    ctx.supabase.rpc('crm_find_duplicates', { p_org: ctx.organizationId }),
    ctx.supabase.from('customer_merge_exclusions').select('customer_a,customer_b').eq('organization_id', ctx.organizationId),
    tienePermisoCrm(ctx, CRM_PERMISOS.clientesFusionar),
  ]);
  if (dup.error) throw dup.error;
  if (excl.error) throw excl.error;
  const grupos = sinParejasExcluidas((dup.data ?? []) as GrupoDuplicados[], (excl.data ?? []) as { customer_a: string; customer_b: string }[]);
  // Deshacer exige además rol administrador (lo comprueba la RPC): se ofrece a quien puede fusionar.
  return { grupos, puedeFusionar, puedeDeshacer: puedeFusionar };
}

export async function fusionarClientes(ctx: CrmSesion, body: unknown) {
  await exigirPermisoCrm(ctx, [CRM_PERMISOS.clientesFusionar], 'fusionar clientes');
  const p = fusionSchema.safeParse(body);
  if (!p.success) throw new CrmHttpError(400, 'seleccion_invalida', 'Selección de fusión inválida');
  const v = p.data;
  const { data, error } = await ctx.supabase.rpc('crm_merge_customers', {
    p_org: ctx.organizationId,
    p_primary: v.primary_id,
    p_secondaries: [v.secondary_id],
    p_choices: v.choices,
  });
  if (error) throw error;
  return data as { id: string; primary_customer_id: string; moved_counts: { table: string; count: number }[] | null };
}

export async function deshacerFusion(ctx: CrmSesion, mergeId: string) {
  exigirUuid(mergeId, 'Fusión');
  await exigirPermisoCrm(ctx, [CRM_PERMISOS.clientesFusionar], 'deshacer fusión');
  const { data, error } = await ctx.supabase.rpc('crm_unmerge_customer', { p_org: ctx.organizationId, p_merge: mergeId });
  if (error) throw error;
  return data as { id: string; undone: boolean };
}

export async function excluirPareja(ctx: CrmSesion, body: unknown) {
  await exigirPermisoCrm(ctx, [CRM_PERMISOS.clientesFusionar], 'marcar no duplicados');
  const p = exclusionSchema.safeParse(body);
  if (!p.success) throw new CrmHttpError(400, 'seleccion_invalida', 'Pareja inválida');
  const v = p.data;
  const { error } = await ctx.supabase.rpc('crm_exclude_customer_pair', { p_org: ctx.organizationId, p_a: v.a, p_b: v.b });
  if (error) throw error;
  return { ok: true };
}
