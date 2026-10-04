import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, requireOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { CrmHttpError, exigirUuid, sinClavesDeOrganizacion } from '@/lib/services/crm/crmRouteSupport';
import { automationRouteError } from '@/lib/services/crm/automation/automationRouteErrors';
import { previewAutomationHistory } from '@/lib/services/crm/automation/automationBulkPreview';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getServerOrgContext(request);
    await requireOrgAdminOrPermission(ctx);
    const raw: unknown = await readOrgBody(ctx, request);
    const { id } = await params;
    exigirUuid(id, 'Regla');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)
      || Object.keys(sinClavesDeOrganizacion(raw as Record<string, unknown>)).length) {
      throw new CrmHttpError(400, 'prueba_invalida', 'La simulación no admite cambios ni ejecución');
    }
    const data = await previewAutomationHistory(id, ctx.organizationId, ctx.supabase);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return automationRouteError(error, 'POST /api/crm/automations/[id]/dry-run/bulk');
  }
}
