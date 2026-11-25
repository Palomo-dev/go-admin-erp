/**
 * «Así se habrían repartido los últimos 50 leads» (Figma CRM 1412:837868):
 * lee los últimos leads de la organización y el estado del equipo, y delega el
 * reparto hipotético en `assignmentPreview` (puro). SOLO servidor, sin
 * escribir nada. Permiso `crm.leads.assign`; la organización sale de la sesión.
 *
 * Mismos datos que la asignación real: miembros activos de
 * `getActiveTeamMembers`, turno de `ultimoAsignadoDelEquipo`, carga de
 * `cargaDeMiembros` y territorios activos evaluados con `mejorTerritorio`.
 */
import { z } from 'zod';
import { profileDisplayName, type EmbeddedProfile } from '@/lib/utils/embeddedProfile';
import { CAMPOS_CLIENTE_TERRITORIO, cargaDeMiembros, getActiveTeamMembers, ultimoAsignadoDelEquipo, type TerritorioEvaluable } from './assignmentService';
import { LOTE_PREVISUALIZACION, previsualizarReparto, type RepartoPrevio } from './assignmentPreview';
import { getLeadAssignmentConfig, LEAD_ASSIGNMENT_STRATEGIES, type LeadAssignmentStrategy } from './leadAssignmentConfig';
import { CRM_PERMISOS, CrmHttpError, exigirPermisoCrm, type CrmSesion } from './crmRouteSupport';
import { assertNoDbError } from './salesTargetService';

export const previsualizacionSchema = z
  .object({
    modo: z.literal('ultimos_leads'),
    strategy: z.enum(LEAD_ASSIGNMENT_STRATEGIES).optional(),
    team_id: z.string().uuid().nullish(),
  })
  .strict();

export interface Previsualizacion extends RepartoPrevio {
  estrategia: LeadAssignmentStrategy;
  /** Estrategia guardada hoy (la de «Hoy (por turnos) se repartieron …»). */
  estrategiaActual: LeadAssignmentStrategy;
  equipoId: string | null;
}

export async function previsualizarUltimosLeads(ctx: CrmSesion, body: unknown): Promise<Previsualizacion> {
  await exigirPermisoCrm(ctx, [CRM_PERMISOS.leadsAsignar], 'previsualizar asignación');
  const p = previsualizacionSchema.safeParse(body);
  if (!p.success) throw new CrmHttpError(400, 'datos_invalidos', 'Datos de previsualización inválidos');
  const config = await getLeadAssignmentConfig(ctx.organizationId, ctx.supabase);
  const estrategia = p.data.strategy ?? config.strategy;

  // Equipo: el pedido o el configurado (validado contra la organización), si no el primero activo.
  const pedido = p.data.team_id ?? config.team_id;
  let q = ctx.supabase.from('sales_teams').select('id').eq('organization_id', ctx.organizationId).eq('is_active', true);
  q = pedido ? q.eq('id', pedido) : q.order('created_at', { ascending: true }).limit(1);
  const { data: equipo, error: eqError } = await q.maybeSingle();
  assertNoDbError('sales_teams', eqError);
  const equipoId = (equipo as { id: string } | null)?.id ?? null;
  const vacio: Previsualizacion = { filas: [], sinTerritorio: null, total: 0, reales: [], estrategia, estrategiaActual: config.strategy, equipoId };
  if (!equipoId) return vacio;

  const miembrosActivos = await getActiveTeamMembers(ctx.organizationId, equipoId, ctx.supabase);
  if (miembrosActivos.length === 0) return vacio;
  const ids = miembrosActivos.map((m) => m.user_id);

  const [perfilesRes, leadsRes, territoriosRes, ultimo, cargas] = await Promise.all([
    ctx.supabase.from('profiles').select('id, first_name, last_name, email').in('id', ids),
    ctx.supabase
      .from('customers')
      .select(['owner_id', ...CAMPOS_CLIENTE_TERRITORIO].join(', '))
      .eq('organization_id', ctx.organizationId)
      .not('lead_source', 'is', null)
      .neq('status', 'merged')
      .order('created_at', { ascending: false })
      .limit(LOTE_PREVISUALIZACION),
    estrategia === 'territory'
      ? ctx.supabase.from('territories').select('id, name, criteria').eq('organization_id', ctx.organizationId).eq('is_active', true).order('name', { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    estrategia === 'round_robin' ? ultimoAsignadoDelEquipo(ctx.organizationId, ids, ctx.supabase) : Promise.resolve(null),
    estrategia === 'load_balance' ? cargaDeMiembros(ctx.organizationId, miembrosActivos, ctx.supabase) : Promise.resolve([]),
  ]);
  assertNoDbError('profiles', perfilesRes.error);
  assertNoDbError('customers', leadsRes.error);
  assertNoDbError('territories', territoriosRes.error);

  const perfiles = new Map(((perfilesRes.data ?? []) as (EmbeddedProfile & { id: string })[]).map((pr) => [pr.id, pr]));
  const leads = ((leadsRes.data ?? []) as unknown as Record<string, unknown>[])
    .map((l) => ({ owner_id: (l.owner_id as string | null) ?? null, datos: l }))
    .reverse(); // del más viejo al más reciente, como habrían llegado

  const reparto = previsualizarReparto({
    orgId: ctx.organizationId,
    estrategia,
    miembros: ids.map((id) => ({ user_id: id, nombre: profileDisplayName(perfiles.get(id) ?? null) })),
    leads,
    territorios: (territoriosRes.data ?? []) as TerritorioEvaluable[],
    cargas: new Map(cargas.map((c) => [c.userId, c.count])),
    ultimoAsignado: ultimo,
  });
  return { ...reparto, estrategia, estrategiaActual: config.strategy, equipoId };
}
