import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { getServiceClient } from '@/lib/supabase/server-service';
import { isOrgAdmin } from '@/lib/utils/rbac';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const uuid = z.string().uuid();

const linkSchema = z.object({
  /** Vincular un cliente existente a la llamada. */
  customer_id: uuid.nullable().optional(),
  /** Crear un cliente nuevo con el teléfono de la llamada y vincularlo. */
  create_customer: z
    .object({
      first_name: z.string().min(1).max(120),
      last_name: z.string().max(120).optional().nullable(),
      phone: z.string().min(3).max(40),
      email: z.string().email().max(200).optional().nullable(),
    })
    .optional(),
  /** Crear una oportunidad para el cliente vinculado. */
  create_opportunity: z
    .object({
      name: z.string().min(1).max(200),
      pipeline_id: uuid,
      stage_id: uuid,
      amount: z.number().min(0).optional().nullable(),
      currency: z.string().length(3).optional().nullable(),
    })
    .optional(),
  /** Vincular una oportunidad existente. */
  opportunity_id: uuid.nullable().optional(),
});

/**
 * POST /api/crm/calls/[id]/link — Vincula (o crea) cliente y oportunidad
 * para una llamada que no los tenía registrados.
 *
 * Casos de uso:
 * 1. La llamada se hizo a un número desconocido → crear cliente con ese teléfono.
 * 2. La llamada tenía cliente pero no oportunidad → crear oportunidad.
 * 3. Vincular un cliente existente por ID.
 *
 * Solo el dueño de la llamada (calls.user_id) o un admin de la org.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let ctx;
  try {
    ctx = await getServerOrgContext(request);
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.statusCode });
    }
    throw err;
  }

  const parsed = linkSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: 'Body inválido', issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const body = parsed.data;

  try {
    const { id } = await params;
    const sb = getServiceClient();

    // Verificar que la llamada existe y pertenece a la org
    const { data: call } = await sb
      .from('calls')
      .select('id, organization_id, user_id, customer_id, opportunity_id, from_number, to_number, direction')
      .eq('id', id)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();

    if (!call) {
      return NextResponse.json({ success: false, error: 'Llamada no encontrada' }, { status: 404 });
    }

    // Solo el dueño o admin puede vincular
    if (call.user_id && call.user_id !== ctx.userId && !isOrgAdmin(ctx) && !ctx.isSuperAdmin) {
      return NextResponse.json(
        { success: false, error: 'Solo el dueño de la llamada o un administrador puede vincular' },
        { status: 403 }
      );
    }

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
          { success: false, error: `No se pudo crear el cliente: ${custErr.message}` },
          { status: 500 }
        );
      }
      customerId = newCustomer.id;
    }

    // 2. Validar que el cliente pertenece a la org (si se vincula uno existente)
    if (body.customer_id && !body.create_customer) {
      const { data: cust } = await sb
        .from('customers')
        .select('id')
        .eq('id', body.customer_id)
        .eq('organization_id', ctx.organizationId)
        .maybeSingle();
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
      const { data: pipeline } = await sb
        .from('pipelines')
        .select('id')
        .eq('id', body.create_opportunity.pipeline_id)
        .eq('organization_id', ctx.organizationId)
        .maybeSingle();
      if (!pipeline) {
        return NextResponse.json(
          { success: false, error: 'El pipeline no pertenece a esta organización' },
          { status: 403 }
        );
      }

      const { data: stage } = await sb
        .from('stages')
        .select('id, pipeline_id')
        .eq('id', body.create_opportunity.stage_id)
        .eq('pipeline_id', body.create_opportunity.pipeline_id)
        .maybeSingle();
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
          currency: body.create_opportunity.currency ?? 'COP',
        })
        .select('id')
        .single();

      if (oppErr) {
        console.error('[CRM Calls link] crear oportunidad:', oppErr.message);
        return NextResponse.json(
          { success: false, error: `No se pudo crear la oportunidad: ${oppErr.message}` },
          { status: 500 }
        );
      }
      opportunityId = newOpp.id;
    }

    // 4. Validar oportunidad existente
    if (body.opportunity_id && !body.create_opportunity) {
      const { data: opp } = await sb
        .from('opportunities')
        .select('id')
        .eq('id', body.opportunity_id)
        .eq('organization_id', ctx.organizationId)
        .maybeSingle();
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
        { success: false, error: `No se pudo vincular: ${updateErr.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { customer_id: customerId, opportunity_id: opportunityId },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Calls link] error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
