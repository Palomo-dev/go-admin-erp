/**
 * Equipo comercial (Figma CRM «Red y gestión»): datos de las pantallas
 * Equipos (1411:837770), Desempeño (1412:838392) y «Mi desempeño» en móvil
 * (1413:1051). SOLO servidor: cliente de la sesión (RLS) y organización de la
 * sesión; los permisos se resuelven aquí, nunca en el navegador.
 *
 * Tablas y columnas verificadas por MCP el 2026-11-15: `sales_teams`,
 * `sales_team_members(quota_amount, quota_currency, territory_id,
 * sales_role_id, is_active)`, `sales_roles`, `territories`,
 * `opportunities(salesperson_id, status, amount, created_at, closed_at)`,
 * `calls(user_id, started_at, answered_at, status)`,
 * `calendar_events(assigned_to, start_at, status ∈ confirmed|tentative|cancelled)`,
 * `customers(owner_id, lead_source, created_at)`.
 *
 * Avance de cuota = suma de oportunidades ganadas con `closed_at` en el mes de
 * la zona de la organización (mismo criterio que `calculateAchievedAmount`).
 */

import { plainDateToInstant, todayInTz } from '@/lib/utils/dateDisplay';
import { pickEmbedded, profileDisplayName, type EmbeddedProfile } from '@/lib/utils/embeddedProfile';
import { isOrgAdmin } from '@/lib/utils/rbac';
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { addDaysPlain } from './quotaProgress';
import { assertNoDbError } from './salesTargetService';
import { getOrgTimezone } from './sellerDashboardService';
import { canSeeLeaderboard } from './sellerDashboardModel';
import { CRM_PERMISOS, CrmHttpError, exigirPermisoCrm } from './crmRouteSupport';
import {
  MES_RE,
  construirFilasDesempeno,
  diasRestantesMes,
  filaPromedio,
  ganadoPorVendedor,
  limitesMes,
  mesAnterior,
  mesDe,
  porcentajeCuota,
  rankingPorPorcentaje,
  resumirDesempeno,
  ultimosMeses,
  type ConteosVendedor,
  type FilaDesempeno,
  type GanadaFila,
  type MiembroBase,
  type PuestoRanking,
  type ResumenDesempeno,
} from './equipoComercialModel';

type Sesion = Pick<ServerOrgContext, 'userId' | 'organizationId' | 'roleId' | 'isSuperAdmin' | 'supabase'>;

interface FilaMiembroBd {
  id: string;
  sales_team_id: string;
  user_id: string;
  sales_role_id: string | null;
  quota_amount: number | string | null;
  quota_currency: string | null;
  is_active: boolean;
  territory_id: string | null;
  created_at: string;
  sales_roles: { name: string | null } | { name: string | null }[] | null;
  territories: { name: string | null } | { name: string | null }[] | null;
  profiles: EmbeddedProfile | EmbeddedProfile[] | null;
}

const SELECT_MIEMBRO =
  'id, sales_team_id, user_id, sales_role_id, quota_amount, quota_currency, is_active, territory_id, created_at, sales_roles:sales_role_id(name), territories:territory_id(name), profiles:user_id(id, first_name, last_name, email)';

function rangoInstantes(desde: string, hasta: string, tz: string): { from: string; to: string } {
  // Fin exclusivo: medianoche del día siguiente al último del mes.
  return { from: plainDateToInstant(desde, tz, '00:00'), to: plainDateToInstant(addDaysPlain(hasta, 1), tz, '00:00') };
}

async function ganadasEnRango(s: Sesion, ids: readonly string[], from: string, to: string): Promise<GanadaFila[]> {
  if (ids.length === 0) return [];
  const { data, error } = await s.supabase
    .from('opportunities')
    .select('salesperson_id, amount, created_at, closed_at')
    .eq('organization_id', s.organizationId)
    .eq('status', 'won')
    .in('salesperson_id', [...ids])
    .gte('closed_at', from)
    .lt('closed_at', to);
  assertNoDbError('opportunities', error);
  return (data ?? []) as GanadaFila[];
}

// ─── Equipos y miembros ──────────────────────────────────────────────────────

export interface MiembroVista {
  id: string;
  user_id: string;
  nombre: string;
  email: string | null;
  rol_id: string | null;
  rol: string | null;
  territorio_id: string | null;
  territorio: string | null;
  cuota: number | null;
  moneda: string | null;
  activo: boolean;
  ganado: number;
  pct: number | null;
}

export interface EquipoVista {
  id: string;
  nombre: string;
  descripcion: string | null;
  territorio_id: string | null;
  territorio: string | null;
  cuota: number;
  moneda: string | null;
  miembros: MiembroVista[];
}

export interface VistaEquipos {
  hoy: string;
  mes: string;
  equipos: EquipoVista[];
  roles: { id: string; nombre: string }[];
  territorios: { id: string; nombre: string }[];
  /** Crear y editar equipos, miembros y territorios (admin u owner, resuelto aquí). */
  puedeGestionar: boolean;
}

export async function getVistaEquipos(s: ServerOrgContext): Promise<VistaEquipos> {
  await exigirPermisoCrm(s, [CRM_PERMISOS.oportunidadesVer], 'equipo comercial');
  const tz = await getOrgTimezone(s.organizationId, s.supabase);
  const hoy = todayInTz(tz);
  const mes = mesDe(hoy);
  const { desde, hasta } = limitesMes(mes);
  const { from, to } = rangoInstantes(desde, hasta, tz);

  const [equiposRes, rolesRes, territoriosRes] = await Promise.all([
    s.supabase
      .from('sales_teams')
      .select('id, name, description, territory_id, territories:territory_id(name)')
      .eq('organization_id', s.organizationId)
      .eq('is_active', true)
      .order('name', { ascending: true }),
    s.supabase.from('sales_roles').select('id, name').eq('organization_id', s.organizationId).eq('is_active', true).order('sort_order'),
    s.supabase.from('territories').select('id, name').eq('organization_id', s.organizationId).eq('is_active', true).order('name'),
  ]);
  assertNoDbError('sales_teams', equiposRes.error);
  assertNoDbError('sales_roles', rolesRes.error);
  assertNoDbError('territories', territoriosRes.error);
  const equipos = (equiposRes.data ?? []) as unknown as {
    id: string;
    name: string;
    description: string | null;
    territory_id: string | null;
    territories: { name: string | null } | { name: string | null }[] | null;
  }[];

  let miembros: FilaMiembroBd[] = [];
  if (equipos.length > 0) {
    const { data, error } = await s.supabase
      .from('sales_team_members')
      .select(SELECT_MIEMBRO)
      .eq('organization_id', s.organizationId)
      .in(
        'sales_team_id',
        equipos.map((e) => e.id),
      )
      .order('created_at', { ascending: true });
    assertNoDbError('sales_team_members', error);
    miembros = (data ?? []) as unknown as FilaMiembroBd[];
  }
  const ganado = ganadoPorVendedor(await ganadasEnRango(s, [...new Set(miembros.map((m) => m.user_id))], from, to));

  return {
    hoy,
    mes,
    equipos: equipos.map((e) => {
      const propios: MiembroVista[] = miembros
        .filter((m) => m.sales_team_id === e.id)
        .map((m) => {
          const cuota = m.quota_amount === null ? null : Number(m.quota_amount);
          const g = ganado.get(m.user_id) ?? 0;
          return {
            id: m.id,
            user_id: m.user_id,
            nombre: profileDisplayName(m.profiles),
            email: pickEmbedded(m.profiles)?.email ?? null,
            rol_id: m.sales_role_id,
            rol: pickEmbedded(m.sales_roles)?.name ?? null,
            territorio_id: m.territory_id,
            territorio: pickEmbedded(m.territories)?.name ?? null,
            cuota,
            moneda: m.quota_currency,
            activo: m.is_active,
            ganado: g,
            pct: porcentajeCuota(g, cuota),
          };
        });
      // Activos primero; dentro, el orden de alta (el mismo de la rotación).
      propios.sort((a, b) => Number(b.activo) - Number(a.activo));
      const activos = propios.filter((m) => m.activo);
      return {
        id: e.id,
        nombre: e.name,
        descripcion: e.description,
        territorio_id: e.territory_id,
        territorio: pickEmbedded(e.territories)?.name ?? null,
        cuota: activos.reduce((sum, m) => sum + (m.cuota ?? 0), 0),
        moneda: activos.find((m) => m.moneda)?.moneda ?? null,
        miembros: propios,
      };
    }),
    roles: ((rolesRes.data ?? []) as { id: string; name: string }[]).map((r) => ({ id: r.id, nombre: r.name })),
    territorios: ((territoriosRes.data ?? []) as { id: string; name: string }[]).map((t) => ({ id: t.id, nombre: t.name })),
    puedeGestionar: isOrgAdmin(s),
  };
}

// ─── Desempeño ───────────────────────────────────────────────────────────────

export interface ParametrosDesempeno {
  teamId?: string | null;
  mes?: string | null;
}

export interface VistaDesempeno {
  hoy: string;
  mes: string;
  meses: string[];
  equipos: { id: string; nombre: string }[];
  equipoId: string | null;
  equipoNombre: string | null;
  /** Admin y supervisores ven a todos; un vendedor, su fila y el promedio (resuelto aquí). */
  verTodo: boolean;
  filas: FilaDesempeno[];
  promedio: ReturnType<typeof filaPromedio>;
  resumen: ResumenDesempeno;
  reunionesMesAnterior: number;
  /** La fila de quien consulta (si es miembro del equipo), para «Mi desempeño». */
  yo: (FilaDesempeno & { puesto: number; de: number }) | null;
  /** Por porcentaje, sin montos (Figma 1413:1051). */
  ranking: PuestoRanking[];
  diasRestantes: number;
}

async function contar(q: PromiseLike<{ count: number | null; error: { message?: string } | null }>, tabla: string): Promise<number> {
  const { count, error } = await q;
  assertNoDbError(tabla, error);
  return count ?? 0;
}

async function conteosVendedor(s: Sesion, userId: string, from: string, to: string): Promise<ConteosVendedor> {
  const org = s.organizationId;
  const [llamadas, llamadasEfectivas, reuniones, leads] = await Promise.all([
    contar(s.supabase.from('calls').select('id', { count: 'exact', head: true }).eq('organization_id', org).eq('user_id', userId).gte('started_at', from).lt('started_at', to), 'calls'),
    contar(
      s.supabase
        .from('calls')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', org)
        .eq('user_id', userId)
        .gte('started_at', from)
        .lt('started_at', to)
        .or('answered_at.not.is.null,status.eq.completed'),
      'calls',
    ),
    contar(
      s.supabase.from('calendar_events').select('id', { count: 'exact', head: true }).eq('organization_id', org).eq('assigned_to', userId).eq('status', 'confirmed').gte('start_at', from).lt('start_at', to),
      'calendar_events',
    ),
    contar(
      s.supabase.from('customers').select('id', { count: 'exact', head: true }).eq('organization_id', org).eq('owner_id', userId).not('lead_source', 'is', null).gte('created_at', from).lt('created_at', to),
      'customers',
    ),
  ]);
  return { llamadas, llamadasEfectivas, reuniones, leads };
}

export async function getVistaDesempeno(s: Sesion, p: ParametrosDesempeno): Promise<VistaDesempeno> {
  await exigirPermisoCrm(s, [CRM_PERMISOS.oportunidadesVer], 'desempeño del equipo');
  const tz = await getOrgTimezone(s.organizationId, s.supabase);
  const hoy = todayInTz(tz);
  const meses = ultimosMeses(hoy, 12);
  if (p.mes && !MES_RE.test(p.mes)) throw new CrmHttpError(400, 'mes_invalido', 'Mes inválido (YYYY-MM)');
  const mes = p.mes && p.mes <= mesDe(hoy) ? p.mes : mesDe(hoy);
  const { desde, hasta } = limitesMes(mes);
  const { from, to } = rangoInstantes(desde, hasta, tz);
  const anterior = limitesMes(mesAnterior(mes));
  const rangoAnterior = rangoInstantes(anterior.desde, anterior.hasta, tz);
  const verTodo = canSeeLeaderboard(s);

  const { data: eqData, error: eqError } = await s.supabase
    .from('sales_teams')
    .select('id, name')
    .eq('organization_id', s.organizationId)
    .eq('is_active', true)
    .order('name', { ascending: true });
  assertNoDbError('sales_teams', eqError);
  const equipos = ((eqData ?? []) as { id: string; name: string }[]).map((e) => ({ id: e.id, nombre: e.name }));

  // Equipo: el pedido (si es de la organización), si no el de quien consulta, si no el primero.
  let equipoId: string | null = p.teamId && equipos.some((e) => e.id === p.teamId) ? p.teamId : null;
  if (!equipoId && equipos.length > 0) {
    const { data: propio } = await s.supabase
      .from('sales_team_members')
      .select('sales_team_id')
      .eq('organization_id', s.organizationId)
      .eq('user_id', s.userId)
      .eq('is_active', true)
      .in(
        'sales_team_id',
        equipos.map((e) => e.id),
      )
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    equipoId = (propio as { sales_team_id: string } | null)?.sales_team_id ?? equipos[0].id;
  }

  let base: MiembroBase[] = [];
  if (equipoId) {
    const { data, error } = await s.supabase
      .from('sales_team_members')
      .select(SELECT_MIEMBRO)
      .eq('organization_id', s.organizationId)
      .eq('sales_team_id', equipoId)
      .eq('is_active', true)
      .order('created_at', { ascending: true });
    assertNoDbError('sales_team_members', error);
    base = ((data ?? []) as unknown as FilaMiembroBd[]).map((m) => ({
      user_id: m.user_id,
      nombre: profileDisplayName(m.profiles),
      cuota: m.quota_amount === null ? null : Number(m.quota_amount),
      moneda: m.quota_currency,
    }));
  }
  const ids = base.map((m) => m.user_id);
  // Reuniones del mes anterior: del equipo (vista completa) o solo las propias.
  const idsAnterior = verTodo ? ids : ids.filter((id) => id === s.userId);

  const [ganadas, conteosLista, reunionesMesAnterior] = await Promise.all([
    ganadasEnRango(s, ids, from, to),
    Promise.all(ids.map((id) => conteosVendedor(s, id, from, to))),
    idsAnterior.length === 0
      ? Promise.resolve(0)
      : contar(
          s.supabase
            .from('calendar_events')
            .select('id', { count: 'exact', head: true })
            .eq('organization_id', s.organizationId)
            .in('assigned_to', idsAnterior)
            .eq('status', 'confirmed')
            .gte('start_at', rangoAnterior.from)
            .lt('start_at', rangoAnterior.to),
          'calendar_events',
        ),
  ]);
  const conteos = new Map(ids.map((id, i) => [id, conteosLista[i]]));
  const todas = construirFilasDesempeno({ miembros: base, ganadas, conteos });
  const ranking = rankingPorPorcentaje(todas, s.userId);
  const propia = todas.find((f) => f.user_id === s.userId) ?? null;
  const puesto = ranking.find((r) => r.es_yo)?.rank ?? 0;
  const filas = verTodo ? todas : propia ? [propia] : [];

  return {
    hoy,
    mes,
    meses,
    equipos,
    equipoId,
    equipoNombre: equipos.find((e) => e.id === equipoId)?.nombre ?? null,
    verTodo,
    filas,
    promedio: verTodo ? null : filaPromedio(todas),
    resumen: resumirDesempeno(filas),
    reunionesMesAnterior,
    yo: propia ? { ...propia, puesto, de: todas.length } : null,
    ranking,
    diasRestantes: mes === mesDe(hoy) ? diasRestantesMes(hoy, hasta) : 0,
  };
}

