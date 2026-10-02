import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { respuestaErrorCrm, sinClavesDeOrganizacion } from '@/lib/services/crm/crmRouteSupport';
import { CrmHttpError } from '@/lib/services/crm/crmErrors';
import { checkHumanCallCompliance } from '@/lib/services/crm/humanCallCompliance';
import { getServiceClient } from '@/lib/supabase/server-service';
const schema = z.object({ number: z.string().min(3).max(40), customer_id: z.string().uuid().nullable().optional() }).strict();
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    const raw = readOrgBody(ctx, await request.json().catch(() => null), { request });
    const parsed = schema.safeParse(sinClavesDeOrganizacion(raw));
    if (!parsed.success) throw new CrmHttpError(400, 'telefono_invalido', 'Introduce un número válido');
    // La compuerta agrega contactos de toda la organización, incluso si el usuario
    // sólo puede leer sus propias llamadas. Nunca devuelve ese historial.
    const data = await checkHumanCallCompliance(getServiceClient(), ctx.organizationId, parsed.data.number, parsed.data.customer_id);
    return NextResponse.json({ success: true, data }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return respuestaErrorCrm(error, 'verificar_contacto'); }
}
