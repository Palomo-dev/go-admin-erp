import { NextRequest, NextResponse } from 'next/server';
import { exigirAccesoLlamada, exigirAccesoALlamadaCargada } from '@/lib/services/crm/callAccessService';
import { respuestaErrorCrm, sinClavesDeOrganizacion } from '@/lib/services/crm/crmRouteSupport';
import { CrmHttpError, exigirUuid } from '@/lib/services/crm/crmErrors';
import { isAtomicCallRpcEnabled } from '@/lib/services/crm/callMutationService';
import { prepareLeadCustomerInsert } from '@/lib/services/crm/leadCustomer';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { getServiceClient } from '@/lib/supabase/server-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const uuid = z.string().uuid();

const linkSchema = z.object({
  idempotency_key: uuid.optional(),
  /** Vincular un cliente existente a la llamada. */
  customer_id: uuid.nullable().optional(),
  /** Crear un cliente nuevo con el teléfono de la llamada y vincularlo. */
  create_customer: z
    .object({
      first_name: z.string().min(1).max(120),
      last_name: z.string().max(120).optional().nullable(),
      phone: z.string().min(3).max(40),
      email: z.string().email().max(200).optional().nullable(),
    }).strict()
    .optional(),
  /** Crear una oportunidad para el cliente vinculado. */
  create_opportunity: z
    .object({
      name: z.string().min(1).max(200),
      pipeline_id: uuid,
      stage_id: uuid,
      amount: z.number().min(0).optional().nullable(),
      currency: z.string().length(3).optional().nullable(),
    }).strict()
    .optional(),
  /** Vincular una oportunidad existente. */
  opportunity_id: uuid.nullable().optional(),
}).strict();

/**
 * POST /api/crm/calls/[id]/link — Vincula (o crea) cliente y oportunidad
 * para una llamada que no los tenía registrados.
 *
 * Casos de uso:
 * 1. La llamada se hizo a un número desconocido → crear cliente con ese teléfono.
 * 2. La llamada tenía cliente pero no oportunidad → crear oportunidad.
 * 3. Vincular un cliente existente por ID.
 *
 * Solo el dueño o quien tenga `crm.activities.edit_any` (incluye administradores).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getServerOrgContext(request);
    const raw = await request.json().catch(() => null);
    readOrgBody(ctx, raw, { request });
    const parsed = linkSchema.safeParse(sinClavesDeOrganizacion(raw));
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Body inválido', issues: parsed.error.issues },
        { status: 400 }
      );
    }
    const body = parsed.data;
    const { id: rawId } = await params;
    const id = exigirUuid(rawId).toLowerCase();
    await exigirAccesoLlamada(ctx, id, 'gestion');
    if (isAtomicCallRpcEnabled()) {
      if ((body.create_customer && body.customer_id !== undefined)
        || (body.create_opportunity && body.opportunity_id !== undefined)) {
        throw new CrmHttpError(400, 'vinculacion_invalida', 'Elige crear o vincular la ficha');
      }
      if ((body.create_customer || body.create_opportunity) && !body.idempotency_key) {
        throw new CrmHttpError(400, 'intencion_obligatoria', 'La petición debe identificar esta operación');
      }
      const { idempotency_key, create_customer, ...payload } = body;
      if (create_customer) {
        const prepared = prepareLeadCustomerInsert({
          first_name: create_customer.first_name, last_name: create_customer.last_name ?? undefined,
          phone: create_customer.phone, email: create_customer.email ?? undefined,
        }, null);
        if (!prepared.ok) throw new CrmHttpError(400, 'cliente_preparado_invalido', prepared.result.error);
        Object.assign(payload, { create_customer: prepared.payload });
      }
      const { data, error } = await ctx.supabase.rpc('fn_crm_vincular_llamada', {
        p_org: ctx.organizationId, p_call: id, p_key: idempotency_key ?? randomUUID(), p_payload: payload,
      });
      if (error) throw error;
      const result = data as { call?: { id?: unknown; organization_id?: unknown; customer_id?: unknown; opportunity_id?: unknown } } | null;
      if (result?.call?.id !== id || result.call.organization_id !== ctx.organizationId) {
        throw new Error('Respuesta inválida al vincular la llamada');
      }
      return NextResponse.json({ success: true, data: {
        customer_id: result.call.customer_id ?? null, opportunity_id: result.call.opportunity_id ?? null,
      } });
    }
    const sb = getServiceClient();

    // Verificar que la llamada existe y pertenece a la org
    const { data: call, error: callError } = await sb
      .from('calls')
      .select('id, organization_id, user_id, customer_id, opportunity_id, from_number, to_number, direction')
      .eq('id', id)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();

    if (callError) throw callError;
    if (!call) {
      return NextResponse.json({ success: false, error: 'Llamada no encontrada' }, { status: 404 });
    }
    await exigirAccesoALlamadaCargada(ctx, call, 'gestion');

    let customerId = body.customer_id ?? call.customer_id ?? null;

    // 1. Crear cliente nuevo si se pidió
    if (body.create_customer) {
      const { data: newCustomer, error: custErr } = await sb
        .from('customers')
        .insert({
          organization_id: ctx.organizationId,
          first_name: body.create_customer.first_name,
          last_name: body.create_customer.last_name ?? null,
          phone: body.create_customer.phone,
          email: body.create_customer.email ?? null,
        })
        .select('id')
        .single();

      if (custErr) {
        console.error('[CRM Calls link] crear cliente:', custErr.message);
        return NextResponse.json(
          { success: false, error: 'No se pudo crear el cliente' },
          { status: 500 }
        );
      }
      customerId = newCustomer.id;
    }

    // 2. Validar que el cliente pertenece a la org (si se vincula uno existente)
    if (body.customer_id && !body.create_customer) {
      const { data: cust, error: customerError } = await sb
        .from('customers')
        .select('id')
        .eq('id', body.customer_id)
        .eq('organization_id', ctx.organizationId)
        .maybeSingle();
      if (customerError) throw customerError;
      if (!cust) {
        return NextResponse.json(
          { success: false, error: 'El cliente no pertenece a esta organización' },
          { status: 403 }
        );
      }
    }

    let opportunityId = body.opportunity_id ?? call.opportunity_id ?? null;

    // 3. Crear oportunidad si se pidió
    if (body.create_opportunity && customerId) {
      // Validar pipeline y stage
      const { data: pipeline, error: pipelineError } = await sb
        .from('pipelines')
        .select('id')
        .eq('id', body.create_opportunity.pipeline_id)
        .eq('organization_id', ctx.organizationId)
        .maybeSingle();
      if (pipelineError) throw pipelineError;
      if (!pipeline) {
        return NextResponse.json(
          { success: false, error: 'El pipeline no pertenece a esta organización' },
          { status: 403 }
        );
      }

      const { data: stage, error: stageError } = await sb
        .from('stages')
        .select('id, pipeline_id')
        .eq('id', body.create_opportunity.stage_id)
        .eq('pipeline_id', body.create_opportunity.pipeline_id)
        .maybeSingle();
      if (stageError) throw stageError;
      if (!stage) {
        return NextResponse.json(
          { success: false, error: 'La etapa no pertenece al pipeline indicado' },
          { status: 400 }
        );
      }

      const { data: newOpp, error: oppErr } = await sb
        .from('opportunities')
        .insert({
          organization_id: ctx.organizationId,
          customer_id: customerId,
          name: body.create_opportunity.name,
          pipeline_id: body.create_opportunity.pipeline_id,
          stage_id: body.create_opportunity.stage_id,
          amount: body.create_opportunity.amount ?? null,
          // Sin moneda elegida, NULL: el trigger `trg_00_moneda_base_por_defecto`
          // pone la moneda base de la organización.
          currency: body.create_opportunity.currency ?? null,
        })
        .select('id')
        .single();

      if (oppErr) {
        console.error('[CRM Calls link] crear oportunidad:', oppErr.message);
        return NextResponse.json(
          { success: false, error: 'No se pudo crear la oportunidad' },
          { status: 500 }
        );
      }
      opportunityId = newOpp.id;
    }

    // 4. Validar oportunidad existente
    if (body.opportunity_id && !body.create_opportunity) {
      const { data: opp, error: opportunityError } = await sb
        .from('opportunities')
        .select('id')
        .eq('id', body.opportunity_id)
        .eq('organization_id', ctx.organizationId)
        .maybeSingle();
      if (opportunityError) throw opportunityError;
      if (!opp) {
        return NextResponse.json(
          { success: false, error: 'La oportunidad no pertenece a esta organización' },
          { status: 403 }
        );
      }
    }

    // 5. Actualizar la llamada con customer_id y opportunity_id
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (customerId !== undefined) updateData.customer_id = customerId;
    if (opportunityId !== undefined) updateData.opportunity_id = opportunityId;

    const { error: updateErr } = await sb
      .from('calls')
      .update(updateData)
      .eq('id', id)
      .eq('organization_id', ctx.organizationId);

    if (updateErr) {
      console.error('[CRM Calls link] actualizar llamada:', updateErr.message);
      return NextResponse.json(
        { success: false, error: 'No se pudo vincular' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { customer_id: customerId, opportunity_id: opportunityId },
    });
  } catch (error: unknown) {
    return respuestaErrorCrm(error, 'vincular_llamada');
  }
}
