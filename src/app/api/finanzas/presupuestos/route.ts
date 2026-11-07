/**
 * POST /api/finanzas/presupuestos — crea un presupuesto en borrador en la
 * organización de la sesión. Empieza vacío o como copia de otro presupuesto
 * de la misma organización (sus líneas, sin repetidos, 12 meses por cuenta).
 * Permiso `finance.create`.
 *
 * «Real del año anterior» no se acepta: no hay todavía una fuente fiable de
 * saldos por cuenta y mes aprobada para esto.
 *
 * No es transaccional (dos escrituras: presupuesto y líneas). Si fallan las
 * líneas, se borra el presupuesto recién creado.
 */
import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { hasOrgAdminOrPermission, withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { construirGrilla, planearGuardado, validarCrear, type LineaGuardada } from '@/lib/finanzas/presupuestos/presupuestoLogica';

export const dynamic = 'force-dynamic';

const SIN_CACHE = { 'Cache-Control': 'private, no-store' };
const responder = (cuerpo: unknown, status = 200) => NextResponse.json(cuerpo, { status, headers: SIN_CACHE });

export const POST = withOrg(async (ctx, req) => {
  if (!(await hasOrgAdminOrPermission(ctx, 'finance.create'))) return responder({ codigo: 'sin_permiso' }, 403);
  const v = validarCrear(await readOrgBody(ctx, req));
  if (!v.ok) return responder({ codigo: 'datos_invalidos', campo: v.error }, 400);
  const { name, fiscal_year, copiar_de } = v.valor;
  const org = ctx.organizationId;

  let origen: LineaGuardada[] = [];
  if (copiar_de) {
    const { data: fuente, error: errFuente } = await ctx.supabase
      .from('budgets')
      .select('id')
      .eq('id', copiar_de)
      .eq('organization_id', org)
      .maybeSingle();
    if (errFuente) {
      console.error('No se pudo leer el presupuesto de origen:', errFuente);
      return responder({ codigo: 'error' }, 500);
    }
    if (!fuente) return responder({ codigo: 'origen_no_encontrado' }, 404);
    const { data: lineas, error: errLineas } = await ctx.supabase
      .from('budget_lines')
      .select('id, account_code, period, planned_amount, cost_center_id')
      .eq('budget_id', copiar_de)
      .eq('organization_id', org);
    if (errLineas) {
      console.error('No se pudieron leer las líneas de origen:', errLineas);
      return responder({ codigo: 'error' }, 500);
    }
    origen = (lineas ?? []) as LineaGuardada[];
  }

  const filas = construirGrilla(origen);
  const { data: creado, error } = await ctx.supabase
    .from('budgets')
    .insert({ organization_id: org, name, fiscal_year, status: 'draft', total_amount: 0, created_by: ctx.userId })
    .select('*')
    .single();
  if (error || !creado) {
    if (error?.code === '23505') return responder({ codigo: 'nombre_repetido' }, 409);
    console.error('No se pudo crear el presupuesto:', error);
    return responder({ codigo: 'error' }, 500);
  }

  if (filas.length === 0) return responder(creado, 201);

  const plan = planearGuardado([], filas, { budgetId: creado.id as string, organizationId: org, nuevoId: randomUUID });
  const { error: errInsertar } = await ctx.supabase.from('budget_lines').insert(plan.upsert);
  if (errInsertar) {
    console.error('No se pudieron copiar las líneas; se descarta el presupuesto nuevo:', errInsertar);
    await ctx.supabase.from('budgets').delete().eq('id', creado.id).eq('organization_id', org);
    return responder({ codigo: 'error' }, 500);
  }
  const { data: conTotal } = await ctx.supabase
    .from('budgets')
    .update({ total_amount: plan.total, updated_at: new Date().toISOString() })
    .eq('id', creado.id)
    .eq('organization_id', org)
    .select('*')
    .single();
  return responder(conTotal ?? { ...creado, total_amount: plan.total }, 201);
});
