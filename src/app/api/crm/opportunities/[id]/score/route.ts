import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { exigirUuid, respuestaErrorCrm, sinClavesDeOrganizacion } from '@/lib/services/crm/crmRouteSupport';
import { cargarOportunidadEditable } from '@/lib/services/crm/opportunityWriteService';
import { calcularScore, configDeFila } from '@/lib/services/crm/scoringCalculo';

/**
 * PUT /api/crm/opportunities/[id]/score — calificación GOC del drawer (CRM
 * ola 3B; sustituye la escritura desde el navegador de `ScoringSection`,
 * guardarraíl 36).
 *
 * Body: { answers: [{ key, value }] }. La configuración (`scoring_configs`) y
 * el cálculo (`scoringCalculo.calcularScore`, el único) son del servidor: el
 * navegador no manda el score. Guarda `score_total`, `temperature` y
 * `score_data` en la oportunidad de la organización de la sesión.
 * Permisos: los de editar (propia con `edit` o `edit_any`).
 * 200 { score_total, temperature, details } · 400 · 403 · 404.
 */
const bodySchema = z
  .object({ answers: z.array(z.object({ key: z.string().min(1).max(80), value: z.string().max(200) }).strict()).max(50) })
  .strict();

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getServerOrgContext(request);
    const body: Record<string, unknown> = await readOrgBody(ctx, request);
    const id = exigirUuid((await params).id);
    const parsed = bodySchema.safeParse(sinClavesDeOrganizacion(body));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
    }
    await cargarOportunidadEditable(ctx, id, 'PUT /api/crm/opportunities/[id]/score');
    const { data: fila, error: errorConfig } = await ctx.supabase
      .from('scoring_configs')
      .select('id, organization_id, config, created_at, updated_at')
      .eq('organization_id', ctx.organizationId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (errorConfig) throw errorConfig;
    const resultado = calcularScore(parsed.data.answers, configDeFila(fila as Parameters<typeof configDeFila>[0]));
    const { error } = await ctx.supabase
      .from('opportunities')
      .update({
        score_total: resultado.score_total,
        temperature: resultado.temperature,
        score_data: { answers: parsed.data.answers, details: resultado.details, calculated_at: new Date().toISOString() },
      })
      .eq('id', id)
      .eq('organization_id', ctx.organizationId);
    if (error) throw error;
    return NextResponse.json({ success: true, data: resultado });
  } catch (error) {
    return respuestaErrorCrm(error, 'PUT /api/crm/opportunities/[id]/score');
  }
}
