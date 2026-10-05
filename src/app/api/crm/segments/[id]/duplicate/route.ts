import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { respuestaErrorCrm, sinClavesDeOrganizacion } from '@/lib/services/crm/crmRouteSupport';
import { copiarSegmento } from '@/lib/services/crm/segmentosService';
import { validarSegmento } from '@/lib/services/crm/segmentosSchemas';
export const runtime = 'nodejs';
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getServerOrgContext(request);
    const body = validarSegmento(z.object({ name: z.string().trim().min(1).max(120) }).strict(), sinClavesDeOrganizacion(await readOrgBody(ctx, request)));
    const data = await copiarSegmento(ctx, (await context.params).id, body.name);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) { return respuestaErrorCrm(error, 'POST /api/crm/segments/id/duplicate'); }
}
