import { NextRequest } from 'next/server';
import { getServerOrgContext, requireOrgAdmin } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { getRevenueInputs, saveRevenueInputs, validateRevenueInputs } from '@/lib/services/crm/revenueOsService';
import { jsonOk, readJson, revenueRouteError } from '@/lib/services/crm/revenueOs/routeSupport';

/**
 * /api/crm/revenue/inputs — insumos manuales de la matemática comercial
 * (gasto de adquisición y margen bruto), guardados en `organization_settings`
 * bajo la clave `crm_revenue_math`. Cero tablas nuevas.
 *
 * GET: cualquier miembro de la organización.
 * PUT: solo administradores de la organización (resuelto en servidor con
 * `requireOrgAdmin`, nunca por un valor del cliente). Body:
 *   { acquisition_spend: number | null, gross_margin_pct: number | null }
 * Si el body trae `organization_id` distinto del de la sesión → 403 y se registra
 * (`readOrgBody`, punto único de la regla dura 5).
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
    const body = readOrgBody(ctx, await readJson(request));
    const patch = validateRevenueInputs(body);
    const saved = await saveRevenueInputs(ctx.organizationId, patch, ctx.supabase);
    return jsonOk(saved);
  } catch (error: unknown) {
    return revenueRouteError(error, 'CRM Revenue Inputs');
  }
}
