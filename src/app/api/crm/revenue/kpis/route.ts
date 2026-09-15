import { getServerOrgContext } from '@/lib/utils/orgContext';
import { getKpiCards, getOrgTimezoneServer } from '@/lib/services/crm/revenueOsService';
import { jsonOk, revenueRouteError } from '@/lib/services/crm/revenueOs/routeSupport';

/**
 * GET /api/crm/revenue/kpis — tarjetas rápidas: pipeline abierto, cobrado en el
 * mes en curso, win rate histórico, abiertas, llamadas y emails de la semana.
 * Mes y semana se cortan en la zona horaria de la organización.
 */
export async function GET() {
  try {
    const ctx = await getServerOrgContext();
    const timezone = await getOrgTimezoneServer(ctx.organizationId, ctx.supabase);
    const kpis = await getKpiCards(ctx.organizationId, timezone, ctx.supabase);
    return jsonOk(kpis);
  } catch (error: unknown) {
    return revenueRouteError(error, 'CRM Revenue KPIs');
  }
}
