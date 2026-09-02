import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { getSequences, createSequence } from '@/lib/services/crm/sequenceService';

/**
 * GET /api/crm/sequences — Lista las secuencias de la organización.
 */
export async function GET() {
  try {
    const ctx = await getServerOrgContext();
    const sequences = await getSequences(ctx.organizationId, ctx.supabase);

    return NextResponse.json({ success: true, data: sequences }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode },
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[Sequences] GET error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * POST /api/crm/sequences — Crea una nueva secuencia con steps opcionales.
 * Body: { name, description?, trigger_type?, trigger_config?, exit_conditions?,
 *         is_active?, steps?: [{ step_number, delay_days, channel, template_id?, action_config? }] }
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    const body = await request.json();

    if (!body?.name) {
      return NextResponse.json(
        { success: false, error: 'Falta el campo obligatorio: name' },
        { status: 400 },
      );
    }

    const sequence = await createSequence(
      ctx.organizationId,
      {
        name: body.name,
        description: body.description,
        trigger_type: body.trigger_type,
        trigger_config: body.trigger_config,
        exit_conditions: body.exit_conditions,
        is_active: body.is_active,
        steps: body.steps,
      },
      ctx.supabase,
    );

    return NextResponse.json({ success: true, data: sequence }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode },
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[Sequences] POST error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
