import { NextRequest } from 'next/server';
import { getServerOrgContext, requireOrgAdmin } from '@/lib/utils/orgContext';
import { getRevenueInputs, saveRevenueInputs, validateRevenueInputs } from '@/lib/services/crm/revenueOsService';
import { jsonFail, jsonOk, readJson, revenueRouteError } from '@/lib/services/crm/revenueOs/routeSupport';

/**
 * /api/crm/revenue/inputs — insumos manuales de la matemática comercial
 * (gasto de adquisición y margen bruto), guardados en `organization_settings`
 * bajo la clave `crm_revenue_math`. Cero tablas nuevas.
 *
 * GET: cualquier miembro de la organización.
 * PUT: solo administradores de la organización (resuelto en servidor con
 * `requireOrgAdmin`, nunca por un valor del cliente). Body:
 *   { acquisition_spend: number | null, gross_margin_pct: number | null }
 * Si el body trae `organization_id` distinto del de la sesión → 403 y se registra.
 */
export async function GET() {
  try {
    const ctx = await getServerOrgContext();
    return jsonOk(await getRevenueInputs(ctx.organizationId, ctx.supabase));
  } catch (error: unknown) {
    return revenueRouteError(error, 'CRM Revenue Inputs');
  }
}

export async function PUT(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    requireOrgAdmin(ctx);
    const body = await readJson(request);
    if (body.organization_id !== undefined && Number(body.organization_id) !== ctx.organizationId) {
      console.warn('[CRM Revenue Inputs] organization_id del body distinto de la sesión', {
        session: ctx.organizationId,
        body: body.organization_id,
        user: ctx.userId,
      });
      return jsonFail(403, 'La organización no coincide con la sesión', { code: 'ORG_MISMATCH' });
    }
    const patch = validateRevenueInputs(body);
    const saved = await saveRevenueInputs(ctx.organizationId, patch, ctx.supabase);
    return jsonOk(saved);
  } catch (error: unknown) {
    return revenueRouteError(error, 'CRM Revenue Inputs');
  }
}
