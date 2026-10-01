import { NextRequest, NextResponse } from 'next/server';
import { programarDespachoAvisos } from '@/lib/services/avisos/despacho.server';
import { z } from 'zod';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { exigirUuid, respuestaErrorCrm, sinClavesDeOrganizacion } from '@/lib/services/crm/crmRouteSupport';
import { actualizarOportunidad, cargarOportunidadEditable } from '@/lib/services/crm/opportunityWriteService';

/**
 * PATCH /api/crm/opportunities/[id]/seguimiento — «Próximo paso» del drawer
 * (CRM ola 3B, Figma 820:64894; sustituye la escritura desde el navegador de
 * `FollowupSection`, guardarraíl 36).
 *
 * Body: { next_action?, next_contact_at? (instante con zona), temperature?,
 *         contact_channel?, contact_result?, expected_updated_at? }
 * Lo editable va por `crm_update_opportunity` (misma RPC que el formulario:
 * propia con `edit` o `edit_any`, bloqueo optimista). Canal y resultado del
 * último contacto no son campos de la RPC: se escriben aquí, en el servidor,
 * con la organización de la sesión y tras la misma comprobación de permiso.
 */
const CANALES_CONTACTO = ['call', 'email', 'whatsapp', 'meeting', 'visit'] as const;
const RESULTADOS_CONTACTO = ['reached', 'no_answer', 'left_voicemail', 'callback_scheduled', 'qualified', 'not_interested', 'objection'] as const;

const bodySchema = z
  .object({
    next_action: z.string().trim().max(500).nullable().optional(),
    next_contact_at: z.string().datetime({ offset: true }).nullable().optional(),
    temperature: z.enum(['cold', 'warm', 'hot']).nullable().optional(),
    contact_channel: z.enum(CANALES_CONTACTO).nullable().optional(),
    contact_result: z.enum(RESULTADOS_CONTACTO).nullable().optional(),
    expected_updated_at: z.string().datetime({ offset: true }).optional(),
  })
  .strict();

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getServerOrgContext(request);
    const body: Record<string, unknown> = await readOrgBody(ctx, request);
    const id = exigirUuid((await params).id);
    const parsed = bodySchema.safeParse(sinClavesDeOrganizacion(body));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
    }
    await cargarOportunidadEditable(ctx, id, 'PATCH /api/crm/opportunities/[id]/seguimiento');
    const { contact_channel, contact_result, ...editables } = parsed.data;
    let data: Record<string, unknown> | null = null;
    if (Object.keys(editables).some((k) => k !== 'expected_updated_at')) {
      data = await actualizarOportunidad(ctx, id, editables);
      programarDespachoAvisos(ctx.organizationId);
    }
    if (contact_channel !== undefined || contact_result !== undefined) {
      const cambios: Record<string, unknown> = {};
      if (contact_channel !== undefined) cambios.contact_channel = contact_channel;
      if (contact_result !== undefined) cambios.contact_result = contact_result;
      const { data: fila, error } = await ctx.supabase
        .from('opportunities')
        .update(cambios)
        .eq('id', id)
        .eq('organization_id', ctx.organizationId)
        .select('id, next_action, next_contact_at, temperature, contact_channel, contact_result, updated_at')
        .maybeSingle();
      if (error) throw error;
      data = { ...(data ?? {}), ...((fila as Record<string, unknown> | null) ?? {}) };
    }
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return respuestaErrorCrm(error, 'PATCH /api/crm/opportunities/[id]/seguimiento');
  }
}
