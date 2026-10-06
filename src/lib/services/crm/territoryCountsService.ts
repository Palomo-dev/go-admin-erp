/**
 * Conteos por territorio (Figma CRM 1411:838455 «Territorios») y simulación
 * de asignación (1412:837868 «Asignación automática»). SOLO servidor.
 *
 * Mismo motor que la asignación real (`assignmentService`):
 *  - conteos: cada cliente se evalúa con `territoriosQueCoinciden` sobre los
 *    mismos campos que lee la asignación (`CAMPOS_CLIENTE_TERRITORIO`); un
 *    cliente que cae en varios cuenta como solapado. Las reglas sobre la
 *    oportunidad (monto, tipo) no se pueden contar sobre clientes y se
 *    evalúan al asignar: se avisa.
 *  - simulación: `assignLead` SIN `opportunityId` (nunca escribe), con el
 *    cliente hipotético en `customerData`, o un cliente real por id.
 *
 * Por qué no `crm_territory_counts`: arma el contexto completo de segmentos
 * (consentimientos, compras) por cliente; medido por MCP el 2026-10-06 en una
 * organización de ~18.000 clientes: 0,84 s por página de 500 (≈ 30 s en
 * total), y no trae los datos de la oportunidad que piden algunas reglas. Aquí
 * se leen solo los seis campos que usa la asignación, con la sesión (RLS) y un
 * presupuesto de tiempo: si se agota, el resultado dice que es parcial.
 */
import { z } from 'zod';
import { assignLead, AssignmentError, CAMPOS_CLIENTE_TERRITORIO, territoriosQueCoinciden, type TerritorioEvaluable } from './assignmentService';
import { getLeadAssignmentConfig, LEAD_ASSIGNMENT_STRATEGIES } from './leadAssignmentConfig';
import { CRM_PERMISOS, CrmHttpError, exigirPermisoCrm, type CrmSesion } from './crmRouteSupport';

export const PAGINA_CONTEO = 1000;
export const PRESUPUESTO_CONTEO_MS = 8000;

export interface ConteoTerritorio {
  id: string;
  clientes: number;
  solapados: number;
  /** El territorio tiene reglas sobre la oportunidad: el conteo de clientes no las puede aplicar. */
  reglasDeOportunidad: boolean;
  sinReglas: boolean;
}

export interface ConteosTerritorios {
  territorios: ConteoTerritorio[];
  sinTerritorio: number;
  evaluados: number;
  parcial: boolean;
}

/** Cuenta, por territorio, los clientes que coinciden (lógica pura sobre una página). */
export function acumularConteos(
  orgId: number,
  territorios: readonly TerritorioEvaluable[],
  clientes: readonly Record<string, unknown>[],
  acc: Map<string, { clientes: number; solapados: number }>,
): number {
  let sinTerritorio = 0;
  for (const c of clientes) {
    const coinciden = territoriosQueCoinciden(orgId, territorios, c);
    if (coinciden.length === 0) sinTerritorio++;
    for (const t of coinciden) {
      const a = acc.get(t.id) ?? { clientes: 0, solapados: 0 };
      a.clientes++;
      if (coinciden.length > 1) a.solapados++;
      acc.set(t.id, a);
    }
  }
  return sinTerritorio;
}

export async function contarTerritorios(ctx: CrmSesion, ahora: () => number = Date.now): Promise<ConteosTerritorios> {
  await exigirPermisoCrm(ctx, [CRM_PERMISOS.clientesVer], 'conteos por territorio');
  const { data: ts, error } = await ctx.supabase
    .from('territories')
    .select('id, name, criteria')
    .eq('organization_id', ctx.organizationId)
    .eq('is_active', true)
    .order('name', { ascending: true });
  if (error) throw error;
  const territorios = (ts ?? []) as TerritorioEvaluable[];
  const acc = new Map<string, { clientes: number; solapados: number }>();
  let sinTerritorio = 0;
  let evaluados = 0;
  let parcial = false;
  if (territorios.some((t) => (t.criteria?.rules ?? []).length > 0)) {
    const inicio = ahora();
    let despues: string | null = null;
    for (;;) {
      if (ahora() - inicio > PRESUPUESTO_CONTEO_MS) {
        parcial = true;
        break;
      }
      let q = ctx.supabase
        .from('customers')
        .select(['id', ...CAMPOS_CLIENTE_TERRITORIO].join(', '))
        .eq('organization_id', ctx.organizationId)
        .neq('status', 'merged')
        .order('id', { ascending: true })
        .limit(PAGINA_CONTEO);
      if (despues) q = q.gt('id', despues);
      const { data: filas, error: e } = await q;
      if (e) throw e;
      const pagina = (filas ?? []) as unknown as Record<string, unknown>[];
      sinTerritorio += acumularConteos(ctx.organizationId, territorios, pagina, acc);
      evaluados += pagina.length;
      if (pagina.length < PAGINA_CONTEO) break;
      despues = String(pagina[pagina.length - 1].id);
    }
  }
  return {
    territorios: territorios.map((t) => {
      const reglas = t.criteria?.rules ?? [];
      return {
        id: t.id,
        clientes: acc.get(t.id)?.clientes ?? 0,
        solapados: acc.get(t.id)?.solapados ?? 0,
        reglasDeOportunidad: reglas.some((r) => r.field_key.startsWith('opportunities.')),
        sinReglas: reglas.length === 0,
      };
    }),
    sinTerritorio,
    evaluados,
    parcial,
  };
}

const textoCorto = z.string().trim().max(200).nullish();
export const simulacionSchema = z
  .object({
    strategy: z.enum(LEAD_ASSIGNMENT_STRATEGIES).optional(),
    team_id: z.string().uuid().nullish(),
    customer_id: z.string().uuid().optional(),
    customer: z
      .object({
        company_size: textoCorto,
        branches_count: z.number().int().min(0).max(100_000).nullish(),
        current_software: textoCorto,
        lifecycle_stage: textoCorto,
        city: textoCorto,
        vertical_id: z.string().uuid().nullish(),
      })
      .strict()
      .optional(),
    opportunity: z
      .object({ amount: z.number().finite().min(0).nullish(), currency: z.string().trim().length(3).nullish(), deal_type: textoCorto })
      .strict()
      .optional(),
  })
  .strict()
  .refine((v) => Boolean(v.customer_id) !== Boolean(v.customer), { message: 'cliente_requerido' });

export async function simularAsignacion(ctx: CrmSesion, body: unknown) {
  await exigirPermisoCrm(ctx, [CRM_PERMISOS.leadsAsignar], 'simular asignación');
  const p = simulacionSchema.safeParse(body);
  if (!p.success) throw new CrmHttpError(400, 'datos_invalidos', 'Datos de simulación inválidos');
  const v = p.data;
  const config = await getLeadAssignmentConfig(ctx.organizationId, ctx.supabase);
  const strategy = v.strategy ?? config.strategy;
  const teamId = v.team_id ?? config.team_id ?? undefined;
  try {
    // Sin `opportunityId`: `assignLead` no escribe nada.
    const r = await assignLead(
      {
        organizationId: ctx.organizationId,
        // Cliente hipotético: `customerData` reemplaza la lectura de `customers`
        // (ninguna estrategia usa el id para otra cosa).
        customerId: v.customer_id ?? '',
        strategy,
        teamId,
        opportunityData: v.opportunity ?? undefined,
        customerData: v.customer ?? undefined,
      },
      ctx.supabase,
    );
    const { data: perfil } = await ctx.supabase.from('profiles').select('first_name, last_name').eq('id', r.userId).maybeSingle();
    const nombre = [perfil?.first_name, perfil?.last_name].filter(Boolean).join(' ').trim() || null;
    return { userId: r.userId, nombre, motivo: r.assignmentReason, strategy, teamId: teamId ?? null, activa: config.enabled };
  } catch (e) {
    if (e instanceof AssignmentError) throw new CrmHttpError(409, 'sin_asignacion', e.message);
    throw e;
  }
}
