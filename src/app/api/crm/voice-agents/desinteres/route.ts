/**
 * GET /api/crm/voice-agents/desinteres — qué hace el agente de voz ante el
 * desinterés definitivo en ventas (configuración de la organización), más lo
 * que la tarjeta necesita: si el usuario puede cambiarla, moneda base,
 * monedas de la organización y etapas abiertas de los pipelines de ventas.
 *
 * PUT /api/crm/voice-agents/desinteres — guarda la configuración.
 * Body: { modo, excepcionValor: { activa, monto, moneda }, excepcionEtapa: { activa, etapaId } }
 * Validación: monto >= 0, moneda ISO de 3 letras que exista en `currencies`,
 * etapa de un pipeline de ventas de la organización. Permiso:
 * `crm.stages.manage` (403 sin él). Otra organización en el body: 403 y se
 * registra (`readOrgBody`). Ver `desinteresVozService.ts`.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { respuestaErrorCrm, sinClavesDeOrganizacion } from '@/lib/services/crm/crmRouteSupport';
import { guardarConfigDesinteres, obtenerConfigDesinteres } from '@/lib/services/crm/desinteresVozService';
import { configDesinteresSchema } from '@/lib/services/crm/voiceAgent/desinteresConfig';

export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    return NextResponse.json({ success: true, data: await obtenerConfigDesinteres(ctx) }, { status: 200 });
  } catch (error) {
    return respuestaErrorCrm(error, 'GET /api/crm/voice-agents/desinteres');
  }
}

export async function PUT(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    const body: Record<string, unknown> = await readOrgBody(ctx, request, { route: 'PUT /api/crm/voice-agents/desinteres' });
    const parsed = configDesinteresSchema.safeParse(sinClavesDeOrganizacion(body));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
    }
    return NextResponse.json({ success: true, data: await guardarConfigDesinteres(ctx, parsed.data) }, { status: 200 });
  } catch (error) {
    return respuestaErrorCrm(error, 'PUT /api/crm/voice-agents/desinteres');
  }
}
