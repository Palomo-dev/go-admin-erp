import { z } from 'zod';
import { getServiceClient } from '@/lib/supabase/server-service';
import { getOrganizationTimezone } from '@/lib/services/organizationTimezoneService';
import { resolverContextoMoneda } from '@/lib/services/monedaOrganizacion';
import { plainDateToInstant, todayInTz, toPlainDate } from '@/lib/utils/dateDisplay';
import { hasOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { sumarEnMonedaBase, type TasaCambio } from '@/components/crm/kit/monedaCrm';
import { computeQuotaProgress, periodBoundsFor, addDaysPlain } from './quotaProgress';
import { CRM_PERMISOS, exigirPermisoCrm, type CrmSesion } from './crmRouteSupport';
import { CrmHttpError } from './crmErrors';
import { ALLOWED_FIELD_KEYS,ALLOWED_OPERATORS,type ICPOperator } from './icpService';
import { normalizarFiltroSegmento } from './segmentosLogica';
import { matchingTerritories } from './territoryAssignment';
import { parseLeadAssignmentConfig } from './leadAssignmentConfig';
import type { CommercialTeam, TeamMember, TeamTerritory, TeamManagementData, TeamPerformance } from './teamManagementModel';

const uuid = z.string().uuid();
const base = { id: uuid.nullable(), expected_updated_at: z.string().datetime({ offset: true }).nullable() };
export const teamMutationSchema = z.discriminatedUnion('kind', [
  z.object({ ...base, kind: z.literal('team'), data: z.object({ name: z.string().trim().min(1).max(120), description: z.string().max(1000).nullable(), territory_id: uuid.nullable(), is_active: z.boolean() }).strict() }).strict(),
  z.object({ ...base, kind: z.literal('member'), data: z.object({ sales_team_id: uuid, user_id: uuid, sales_role_id: uuid.nullable(), territory_id: uuid.nullable(), quota_amount: z.number().finite().min(0).max(1e15).nullable(), quota_currency: z.string().regex(/^[A-Z]{3}$/), is_active: z.boolean() }).strict() }).strict(),
  z.object({ ...base, kind: z.literal('territory'), data: z.object({ name: z.string().trim().min(1).max(120), criteria: z.object({ filter: z.record(z.unknown()).optional(), rules: z.array(z.object({ field_key:z.string(),operator:z.enum(ALLOWED_OPERATORS as [ICPOperator,...ICPOperator[]]),value:z.unknown(),weight:z.number().finite().min(0).max(100).optional(),is_required:z.boolean().optional() }).strict()).max(50).optional(), assigned_user_id: uuid.optional() }).strict(), is_active: z.boolean(), sort_order: z.number().int().min(0).max(100000) }).strict() }).strict(),
  z.object({ ...base, kind: z.literal('assignment'), data: z.object({ enabled: z.boolean(), strategy: z.enum(['round_robin','territory','load_balance']), team_id: uuid.nullable() }).strict() }).strict(),
]);
export type TeamMutation = z.infer<typeof teamMutationSchema>;
interface TeamSnapshot {
  teams: CommercialTeam[]; members: TeamMember[]; territories: TeamTerritory[];
  roles: TeamManagementData['roles']; people: TeamManagementData['people'];
  won: { salesperson_id: string; amount: number; currency: string; closed_at: string }[];
  metrics: Omit<TeamPerformance,'name'|'won'|'currency'|'quota_pct'|'money_missing'|'conversion'>[];
  assignment: { settings: unknown; updated_at: string } | null;
  ranking_enabled: boolean; rates: TasaCambio[];
}
function converted(snapshot: TeamSnapshot, user: string, currency: string, timezone: string) {
  let total = 0, missing = false;
  for (const row of snapshot.won.filter((won) => won.salesperson_id === user)) {
    const sum = sumarEnMonedaBase([{ monto: Number(row.amount ?? 0), moneda: row.currency }],currency,snapshot.rates,toPlainDate(new Date(row.closed_at),timezone));
    total += sum.total; missing ||= sum.sinTasa.length > 0;
  }
  return { total, missing };
}
export function buildTeamData(snapshot: TeamSnapshot, options: {
  user: string; canViewAll: boolean; canManage: boolean; canConfigure: boolean;
  today: string; timezone: string; currency: string;
}): TeamManagementData {
  const bounds = periodBoundsFor('monthly',options.today);
  const members = snapshot.members.map((member) => {
    const value = converted(snapshot,member.user_id,member.quota_currency,options.timezone);
    const pct = member.quota_amount !== null && Number(member.quota_amount) > 0 && !value.missing
      ? computeQuotaProgress({ target_amount: Number(member.quota_amount), achieved_amount: value.total, ...bounds, today: options.today }).raw_pct : null;
    const visible = options.canViewAll || member.user_id === options.user;
    return { ...member, quota_amount: visible ? member.quota_amount : null, achieved: visible && !value.missing ? value.total : null, quota_pct: pct, money_missing: value.missing };
  });
  const performance = snapshot.metrics.map((metric) => {
    const value = converted(snapshot,metric.user_id,options.currency,options.timezone);
    const quotas = snapshot.members.filter((member) => member.user_id === metric.user_id && member.is_active && member.quota_amount !== null);
    const target = sumarEnMonedaBase(quotas.map((member) => ({ monto: Number(member.quota_amount), moneda: member.quota_currency })),options.currency,snapshot.rates,options.today);
    const missing = value.missing || target.sinTasa.length > 0;
    return { ...metric, name: snapshot.people.find((person) => person.id === metric.user_id)?.name ?? metric.user_id,
      won: value.missing ? null : value.total, currency: options.currency, money_missing: missing,
      quota_pct: missing || target.total <= 0 ? null : computeQuotaProgress({ target_amount: target.total, achieved_amount: value.total, ...bounds, today: options.today }).raw_pct,
      conversion: metric.won_count + metric.lost_count > 0 ? metric.won_count / (metric.won_count + metric.lost_count) * 100 : 0 };
  });
  const sellers=new Set(snapshot.members.filter(member=>member.is_active&&snapshot.teams.some(team=>team.id===member.sales_team_id&&team.is_active)).map(member=>member.user_id));
  const rows=performance.filter(row=>sellers.has(row.user_id));
  const mean=(values:number[])=>values.length?values.reduce((sum,value)=>sum+value,0)/values.length:null;
  const average=rows.length?{currency:options.currency,calls:mean(rows.map(row=>row.calls))!,meetings:mean(rows.map(row=>row.meetings))!,won_count:mean(rows.map(row=>row.won_count))!,lost_count:mean(rows.map(row=>row.lost_count))!,conversion:mean(rows.map(row=>row.conversion))!,cycle_days:mean(rows.flatMap(row=>row.cycle_days===null?[]:[row.cycle_days])),money_missing:rows.some(row=>row.money_missing),won:rows.some(row=>row.won===null)?null:mean(rows.map(row=>row.won!)),quota_pct:rows.some(row=>row.money_missing)?null:mean(rows.flatMap(row=>row.quota_pct===null?[]:[row.quota_pct]))}:null;
  return { teams: snapshot.teams, members, territories: snapshot.territories.map((territory) => ({ ...territory,customer_count:0,opportunity_count:0,overlap_count:0 })), roles:snapshot.roles,people:snapshot.people,
    performance:performance.filter((row) => (sellers.has(row.user_id)||row.user_id===options.user)&&(options.canViewAll || row.user_id === options.user)),performance_average:average,
    ranking: snapshot.ranking_enabled ? performance.map(({ user_id,name,quota_pct }) => ({ user_id,name,quota_pct })).sort((a,b) => (b.quota_pct ?? -1)-(a.quota_pct ?? -1) || a.user_id.localeCompare(b.user_id)) : [],
    current_user:options.user,can_manage:options.canManage,can_configure:options.canConfigure,can_view_all:options.canViewAll,
    config:parseLeadAssignmentConfig(snapshot.assignment?.settings),config_updated_at:snapshot.assignment?.updated_at ?? null,
    ...bounds,timezone:options.timezone,base_currency:options.currency,without_territory:0,ranking_enabled:snapshot.ranking_enabled };
}
export async function readTeamManagement(ctx: CrmSesion): Promise<TeamManagementData> {
  await exigirPermisoCrm(ctx,[CRM_PERMISOS.oportunidadesVer], 'leer equipo');
  const timezone = await getOrganizationTimezone(ctx.organizationId,ctx.supabase);
  const today = todayInTz(timezone), bounds = periodBoundsFor('monthly',today);
  const [result, currency, canViewAll, canManage, canConfigure] = await Promise.all([
    getServiceClient().rpc('crm_team_management_snapshot',{ p_org:ctx.organizationId,p_actor:ctx.userId,p_start:plainDateToInstant(bounds.period_start,timezone,'00:00'),p_end:plainDateToInstant(addDaysPlain(bounds.period_end,1),timezone,'00:00') }),
    resolverContextoMoneda(ctx.supabase,ctx.organizationId),
    hasOrgAdminOrPermission(ctx,CRM_PERMISOS.pronosticoVerTodas),hasOrgAdminOrPermission(ctx,CRM_PERMISOS.leadsAsignar),hasOrgAdminOrPermission(ctx),
  ]);
  if (result.error) throw result.error;
  const snapshot = result.data as TeamSnapshot;
  if (!snapshot || !Array.isArray(snapshot.teams) || !Array.isArray(snapshot.metrics)) throw new Error('team_snapshot_invalido');
  const data = buildTeamData(snapshot,{ user:ctx.userId,canViewAll,canManage,canConfigure,today,timezone,currency:currency.code });
  // Counts are a separate request: an error does not turn successful team metrics into zeros.
  return data;
}
export async function readTerritoryCounts(ctx: CrmSesion, territories: TeamTerritory[]) {
  await exigirPermisoCrm(ctx,[CRM_PERMISOS.clientesVer],'contar territorios');
  const active = territories.filter((territory) => territory.is_active);
  const counts = new Map(active.map((territory) => [territory.id,{ customer_count:0,opportunity_count:0,overlap_count:0 }]));
  const asOf = new Date(), size=500; let after: string | null=null, without=0;
  for (;;) {
    const result = await ctx.supabase.rpc('crm_territory_counts',{ p_org:ctx.organizationId,p_after:after,p_limit:size,p_as_of:asOf.toISOString() });
    if (result.error) throw result.error;
    const data: { customers: {id:string;[key:string]:unknown}[]; opportunities:{customer_id:string;opportunity_count:number}[] } = result.data;
    if (!data || !Array.isArray(data.customers) || !Array.isArray(data.opportunities)) throw new Error('territory_counts_invalido');
    const opportunities = new Map<string,number>(data.opportunities.map((row:{customer_id:string;opportunity_count:number}) => [row.customer_id,Number(row.opportunity_count)]));
    for (const customer of data.customers as { id:string;[key:string]:unknown }[]) {
      const matched = matchingTerritories(active,customer,{},ctx.organizationId,asOf);
      if (!matched.length) { without++; continue; }
      const count = counts.get(matched[0].id)!; count.customer_count++; count.opportunity_count+=opportunities.get(customer.id) ?? 0;
      if (matched.length > 1) for (const match of matched) counts.get(match.id)!.overlap_count++;
    }
    if (data.customers.length < size) break;
    const next: string = data.customers.at(-1)!.id;
    if (after && next<=after) throw new Error('territory_cursor_invalido');
    after=next;
  }
  return { territories:territories.map((territory) => ({ ...territory,...counts.get(territory.id) })),without_territory:without };
}
export async function writeTeamManagement(ctx: CrmSesion, input: unknown) {
  await exigirPermisoCrm(ctx,[CRM_PERMISOS.leadsAsignar],'gestionar equipo');
  const parsed = teamMutationSchema.safeParse(input);
  if (!parsed.success) throw new CrmHttpError(400,'datos_invalidos','Revisa los datos del equipo');
  const body=parsed.data;
  if (body.kind==='assignment' && !(await hasOrgAdminOrPermission(ctx))) throw new CrmHttpError(403,'sin_permiso','No tienes permiso para configurar asignación');
  if (body.id && !body.expected_updated_at) throw new CrmHttpError(400,'version_requerida','Recarga los datos antes de guardar');
  if (body.kind==='territory') {
    if (body.data.criteria.filter) body.data.criteria.filter=normalizarFiltroSegmento(body.data.criteria.filter) as unknown as Record<string,unknown>;
    if (body.data.criteria.filter && body.data.criteria.rules) throw new CrmHttpError(400,'datos_invalidos','Usa un único formato de reglas');
    const fields=new Set<string>(ALLOWED_FIELD_KEYS);
    if (body.data.criteria.rules?.some((rule)=>!fields.has(rule.field_key))) throw new CrmHttpError(400,'datos_invalidos','Campo de territorio inválido');
  }
  const { data,error }=await ctx.supabase.rpc('crm_team_management_write',{ p_org:ctx.organizationId,p_actor:ctx.userId,p_kind:body.kind,p_id:body.id,p_expected:body.expected_updated_at,p_data:body.data });
  if (error) throw error;
  return data;
}
