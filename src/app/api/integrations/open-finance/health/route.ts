// ============================================================
// /api/integrations/open-finance/health
// Estado de Open Finance PARA LA ORGANIZACION DE LA SESION.
// GET - proveedor configurado, links activos, ultima sincronizacion y
//       transacciones pendientes de la organizacion.
//
// SEGURIDAD (GO-sec, 2026-09-23; auditoria §1.4, hallazgo 13): antes cualquier
// usuario con sesion veia conteos GLOBALES de todos los tenants y que
// variables de entorno estaban definidas. Ahora los conteos son de la
// organizacion de la sesion (cliente de la sesion + filtro explicito) y el
// detalle de variables de entorno (solo si estan definidas, nunca valores) se
// devuelve unicamente a un administrador de plataforma verificado.
// ============================================================

import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { PERMISOS_FINANZAS, requireOrgPermission, routeErrorResponse } from '@/lib/security/orgGuards';
import { isPlatformAdmin } from '@/lib/security/platformAdmin';
import { isProviderConfigured } from '@/lib/services/integrations/openFinance/openFinanceConfig';

const RUTA = 'open-finance/health';

/** Estado de variables de entorno relevantes (sin exponer valores) */
function getEnvVarStatuses(): Array<{ name: string; isSet: boolean }> {
  return [
    { name: 'PROMETEO_API_KEY', isSet: Boolean(process.env.PROMETEO_API_KEY) },
    { name: 'PROMETEO_WEBHOOK_VERIFY_TOKEN', isSet: Boolean(process.env.PROMETEO_WEBHOOK_VERIFY_TOKEN) },
    { name: 'CRON_SECRET', isSet: Boolean(process.env.CRON_SECRET) },
  ];
}

export const GET = withOrg(async (ctx) => {
  try {
    await requireOrgPermission(ctx, PERMISOS_FINANZAS.VER, RUTA);

    const provider = 'prometeo';
    const isConfigured = isProviderConfigured(provider);
    const errors: string[] = [];
    if (!isConfigured) errors.push('Open Finance no está configurado en la plataforma');

    const { count: activeLinks } = await ctx.supabase
      .from('open_finance_links')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', ctx.organizationId)
      .eq('status', 'active');

    const { data: ultimo } = await ctx.supabase
      .from('open_finance_links')
      .select('last_sync_at')
      .eq('organization_id', ctx.organizationId)
      .eq('status', 'active')
      .order('last_sync_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { count: pendingTransactions } = await ctx.supabase
      .from('open_finance_transactions')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', ctx.organizationId)
      .eq('is_imported', false);

    const esPlataforma = await isPlatformAdmin(ctx.supabase);

    return NextResponse.json({
      success: true,
      data: {
        provider,
        isConfigured,
        activeLinks: activeLinks ?? 0,
        lastSync: (ultimo as { last_sync_at?: string | null } | null)?.last_sync_at ?? null,
        pendingTransactions: pendingTransactions ?? 0,
        errors,
      },
      envVars: esPlataforma ? getEnvVarStatuses() : [],
    });
  } catch (error) {
    return routeErrorResponse('Open Finance Health', error);
  }
});
