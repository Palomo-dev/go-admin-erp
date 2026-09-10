import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerOrgContext, OrgContextError, isOrgAdminContext } from '@/lib/utils/orgContext';
import { getServiceClient } from '@/lib/supabase/server-service';
import { applyAnalysis, getAnalysis } from '@/lib/services/crm/callAnalysisService';

const bodySchema = z.object({
  analysisId: z.string().uuid().optional(),
  actions: z
    .object({
      stage: z.boolean().optional(),
      tasks: z.union([z.literal('all'), z.array(z.number().int().min(0).max(50))]).optional(),
      tags: z.boolean().optional(),
      discovery: z.boolean().optional(),
      objections: z.boolean().optional(),
    })
    .default({}),
  ignore_gate: z.boolean().optional(),
});

/**
 * POST /api/crm/calls/[id]/analysis/apply — Aplica selectivamente las acciones
 * del análisis: { analysisId?, actions: { stage?, tasks?: number[]|'all', tags?, discovery?, objections? }, ignore_gate? }.
 * Sin `actions` (o vacío) aplica todo (compatibilidad con el contrato anterior).
 * `ignore_gate` solo para administradores de la org. 409 si el gate no se cumple.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getServerOrgContext();
    const { id } = await params;
    let raw: unknown = {};
    try {
      raw = await request.json();
    } catch {
      /* body vacío */
    }
    const parsed = bodySchema.safeParse(raw ?? {});
    if (!parsed.success) return NextResponse.json({ success: false, error: 'Body inválido', details: parsed.error.flatten() }, { status: 400 });
    const { analysisId: bodyAnalysisId, ignore_gate } = parsed.data;
    let actions = parsed.data.actions;
    if (Object.keys(actions).length === 0) actions = { stage: true, tasks: 'all', tags: true, discovery: true, objections: true };
    if (ignore_gate && !isOrgAdminContext(ctx)) {
      return NextResponse.json({ success: false, error: 'Solo un administrador puede omitir los criterios de salida' }, { status: 403 });
    }

    let analysisId = bodyAnalysisId;
    if (!analysisId) {
      const existing = await getAnalysis(id, ctx.organizationId, ctx.supabase);
      if (!existing) return NextResponse.json({ success: false, error: 'No hay análisis para aplicar' }, { status: 404 });
      analysisId = existing.id;
    } else {
      const { data: owned } = await ctx.supabase.from('call_analyses').select('id').eq('id', analysisId).eq('organization_id', ctx.organizationId).eq('call_id', id).maybeSingle();
      if (!owned) return NextResponse.json({ success: false, error: 'Análisis no encontrado' }, { status: 404 });
    }

    const result = await applyAnalysis(analysisId, ctx.organizationId, ctx.userId, getServiceClient(), actions, { ignoreGate: !!ignore_gate, source: 'user' });
    if (!result) return NextResponse.json({ success: false, error: 'No se pudo aplicar el análisis' }, { status: 500 });
    const gateBlocked = result.gate && !result.gate.ok && result.skipped.some((s) => s.action === 'stage' && s.reason === 'gate_not_met');
    return NextResponse.json(
      { success: !gateBlocked, data: { applied: result.applied, skipped: result.skipped, gate: result.gate ?? null, analysis: result.analysis } },
      { status: gateBlocked ? 409 : 200 },
    );
  } catch (error: unknown) {
    if (error instanceof OrgContextError) return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Calls Analysis Apply] POST error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
