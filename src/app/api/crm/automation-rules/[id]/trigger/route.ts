import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { executeAutomationRule } from '@/lib/services/crm/automationService';

/**
 * POST /api/crm/automation-rules/[id]/trigger — Ejecuta una regla manualmente.
 * Body: { trigger_payload?: Record<string, unknown> }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await getServerOrgContext();
    const { id } = await params;

    let body: { trigger_payload?: Record<string, unknown> } = {};
    try {
      body = await request.json();
    } catch {
      // Sin body — payload vacío
    }

    const run = await executeAutomationRule(
      id,
      ctx.organizationId,
      body.trigger_payload || {},
      ctx.supabase,
    );

    return NextResponse.json({ success: true, data: run }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode },
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[Automation Rules Trigger] POST error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
