import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { CRM_PERMISOS, exigirPermisoCrm, exigirUuid, respuestaErrorCrm, sinClavesDeOrganizacion } from '@/lib/services/crm/crmRouteSupport';
import { descartarLead } from '@/lib/services/crm/leadWriteService';

/**
 * PATCH /api/crm/leads/[id]/discard — descartar (o reactivar) un lead-cliente
 * (CRM ola 1, M1, plan §4.1). No toca `lifecycle_stage`.
 *
 * Body: { reason: string (3–500) } para descartar · { descartar: false } para reactivar.
 * Permiso: `crm.leads.assign`, o `crm.leads.edit` si el lead es suyo o no tiene
 * responsable. 400 · 403 · 404 · 409 si el cliente no está en etapa lead.
 */
const bodySchema = z
  .object({ descartar: z.boolean().optional(), reason: z.string().trim().min(3).max(500).optional() })
  .strict()
  .refine((b) => b.descartar === false || Boolean(b.reason), { message: 'Falta el motivo del descarte', path: ['reason'] });

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getServerOrgContext(request);
    const body: Record<string, unknown> = await readOrgBody(ctx, request);
    const id = exigirUuid((await params).id);
    await exigirPermisoCrm(ctx, [CRM_PERMISOS.leadsEditar, CRM_PERMISOS.leadsAsignar], 'PATCH /api/crm/leads/[id]/discard');
    const parsed = bodySchema.safeParse(sinClavesDeOrganizacion(body));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
    }
    const descartar = parsed.data.descartar !== false;
    const data = await descartarLead(ctx, id, descartar ? parsed.data.reason ?? null : null, descartar, 'PATCH /api/crm/leads/[id]/discard');
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return respuestaErrorCrm(error, 'PATCH /api/crm/leads/[id]/discard');
  }
}
