/**
 * PUT /api/finanzas/presupuestos/:id/lineas — guarda la grilla de un
 * presupuesto en borrador: una fila por cuenta (y centro de costo) con sus 12
 * meses. Permiso `finance.create`. Un presupuesto aprobado, activo o cerrado
 * no se edita (409 `no_editable`): se copia en un borrador nuevo.
 *
 * Solo cuentas de movimiento del plan de cuentas de la organización.
 *
 * `budget_lines` no tiene clave única por (presupuesto, cuenta, mes, centro):
 * se reutiliza el `id` de cada celda y se borran los repetidos y las cuentas
 * quitadas (`planearGuardado`). Tres escrituras sin transacción: líneas,
 * borrado y total del presupuesto.
 */
import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { hasOrgAdminOrPermission, withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { esCuentaDeMovimiento } from '@/lib/finanzas/contabilidad/cuentaLinea';
import { esEditable, esUuid, planearGuardado, validarFilas, type LineaGuardada } from '@/lib/finanzas/presupuestos/presupuestoLogica';

export const dynamic = 'force-dynamic';

const SIN_CACHE = { 'Cache-Control': 'private, no-store' };
const responder = (cuerpo: unknown, status = 200) => NextResponse.json(cuerpo, { status, headers: SIN_CACHE });

interface CuentaPlan {
  account_code: string;
  parent_code: string | null;
  is_active: boolean | null;
  es_movimiento: boolean | null;
}

export const PUT = withOrg(async (ctx, req) => {
  if (!(await hasOrgAdminOrPermission(ctx, 'finance.create'))) return responder({ codigo: 'sin_permiso' }, 403);
  const id = new URL(req.url).pathname.split('/').filter(Boolean).slice(-2, -1)[0] ?? '';
  if (!esUuid(id)) return responder({ codigo: 'datos_invalidos' }, 400);
  const v = validarFilas(await readOrgBody(ctx, req));
  if (!v.ok) return responder({ codigo: 'datos_invalidos', campo: v.error }, 400);
  const filas = v.valor;
  const org = ctx.organizationId;

  const { data: presupuesto, error } = await ctx.supabase
    .from('budgets')
    .select('id, status')
    .eq('id', id)
    .eq('organization_id', org)
    .maybeSingle();
  if (error) {
    console.error('No se pudo leer el presupuesto:', error);
    return responder({ codigo: 'error' }, 500);
  }
  if (!presupuesto) return responder({ codigo: 'no_encontrado' }, 404);
  if (!esEditable(presupuesto.status as string)) return responder({ codigo: 'no_editable' }, 409);

  if (filas.length > 0) {
    const { data: plan, error: errPlan } = await ctx.supabase
      .from('chart_of_accounts')
      .select('account_code, parent_code, is_active, es_movimiento')
      .eq('organization_id', org);
    if (errPlan) {
      console.error('No se pudo leer el plan de cuentas:', errPlan);
      return responder({ codigo: 'error' }, 500);
    }
    const cuentas = (plan ?? []) as CuentaPlan[];
    const porCodigo = new Map(cuentas.map((c) => [c.account_code, c]));
    const invalidas = filas
      .map((f) => f.account_code)
      .filter((codigo) => {
        const c = porCodigo.get(codigo);
        return !c || !esCuentaDeMovimiento(c, cuentas);
      });
    if (invalidas.length > 0) return responder({ codigo: 'cuenta_invalida', cuentas: invalidas }, 400);
  }

  const { data: existentes, error: errLineas } = await ctx.supabase
    .from('budget_lines')
    .select('id, account_code, period, planned_amount, cost_center_id')
    .eq('budget_id', id)
    .eq('organization_id', org);
  if (errLineas) {
    console.error('No se pudieron leer las líneas:', errLineas);
    return responder({ codigo: 'error' }, 500);
  }

  const plan = planearGuardado((existentes ?? []) as LineaGuardada[], filas, { budgetId: id, organizationId: org, nuevoId: randomUUID });

  if (plan.upsert.length > 0) {
    const { error: errUpsert } = await ctx.supabase.from('budget_lines').upsert(plan.upsert, { onConflict: 'id' });
    if (errUpsert) {
      console.error('No se pudieron guardar las líneas:', errUpsert);
      return responder({ codigo: 'error' }, 500);
    }
  }
  if (plan.borrar.length > 0) {
    const { error: errBorrar } = await ctx.supabase.from('budget_lines').delete().in('id', plan.borrar).eq('organization_id', org);
    if (errBorrar) {
      console.error('No se pudieron quitar líneas:', errBorrar);
      return responder({ codigo: 'error' }, 500);
    }
  }
  const { error: errTotal } = await ctx.supabase
    .from('budgets')
    .update({ total_amount: plan.total, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', org);
  if (errTotal) {
    console.error('No se pudo actualizar el total del presupuesto:', errTotal);
    return responder({ codigo: 'error' }, 500);
  }
  return responder({ id, total: plan.total, lineas: plan.upsert.length });
});
