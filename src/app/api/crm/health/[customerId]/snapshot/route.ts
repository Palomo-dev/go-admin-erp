import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { foreignOrganizationInBody } from '@/lib/security/organizationBody';
import { snapshotCustomerHealth } from '@/lib/services/crm/healthScoreServer';

/**
 * POST /api/crm/health/[customerId]/snapshot — «Medir ahora» del detalle (F11 r2).
 *
 * Mismo cálculo que la lista y el cron (`fn_customer_health` + config); el
 * snapshot se escribe solo si cambió el score o venció el intervalo
 * (`snapshot_written`), y `customers.health_score` solo si cambió
 * (`customer_updated`). 404 si la RPC no devuelve al cliente (otra
 * organización o no es `lifecycle_stage='customer'`). Regla 5 en el body.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ customerId: string }> }) {
  try {
    const ctx = await getServerOrgContext();
    const { customerId } = await params;
    const body = await request.json().catch(() => ({}));
    const foreign = foreignOrganizationInBody((body as { organization_id?: unknown } | null)?.organization_id, ctx.organizationId);
    if (foreign !== null) {
      console.warn('[health/snapshot] POST con organization_id ajeno en el body', { session: ctx.organizationId, body: foreign });
      return NextResponse.json({ success: false, error: 'Organización no permitida' }, { status: 403 });
    }
    const result = await snapshotCustomerHealth(ctx.organizationId, customerId, ctx.supabase, new Date());
    if (!result) {
      return NextResponse.json({ success: false, error: 'La salud se mide solo para clientes de tu organización' }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: result }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Health] snapshot error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
