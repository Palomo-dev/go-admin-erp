import { NextRequest } from 'next/server';
import { getServerOrgContext, requireOrgAdmin } from '@/lib/utils/orgContext';
import { getRevenueDashboard } from '@/lib/services/crm/revenueOsService';
import { jsonOk, resolveRequestRange, revenueRouteError } from '@/lib/services/crm/revenueOs/routeSupport';

/**
 * GET /api/crm/revenue/dashboard?start=YYYY-MM-DD&end=YYYY-MM-DD — panel Revenue OS.
 *
 * Rango por defecto: últimos 12 meses en la zona horaria de la organización
 * (fin exclusivo). Validación: formato, `end ≥ start`, máximo 36 meses (400).
 * La organización sale de la sesión. Un fallo de RPC responde 502 con el
 * nombre de la función, nunca `[]`. `can_edit_inputs` (admin de la org,
 * resuelto en servidor) le dice a la UI si mostrar el formulario de insumos.
 */

function canEditInputs(ctx: Parameters<typeof requireOrgAdmin>[0]): boolean {
  try {
    requireOrgAdmin(ctx);
    return true;
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    const { timezone, range } = await resolveRequestRange(ctx, request);
    const dashboard = await getRevenueDashboard(ctx.organizationId, range, timezone, ctx.supabase);
    return jsonOk(dashboard, { can_edit_inputs: canEditInputs(ctx) });
  } catch (error: unknown) {
    return revenueRouteError(error, 'CRM Revenue Dashboard');
  }
}
