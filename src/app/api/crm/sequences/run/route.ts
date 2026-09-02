import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { processPendingStepRuns } from '@/lib/services/crm/sequenceService';

/**
 * POST /api/crm/sequences/run — Cron: procesa step_runs pendientes.
 *
 * Este endpoint NO usa getServerOrgContext. Valida CRON_SECRET en el header.
 * Body: { organization_id?: number, batch_size?: number }
 */
export async function POST(request: NextRequest) {
  try {
    // Validar CRON_SECRET (fail-closed)
    const expectedToken = process.env.CRON_SECRET;
    if (!expectedToken) {
      console.error('[Sequences Run] CRON_SECRET no configurado — endpoint bloqueado');
      return NextResponse.json(
        { success: false, error: 'No autorizado' },
        { status: 401 },
      );
    }
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json(
        { success: false, error: 'No autorizado' },
        { status: 401 },
      );
    }

    let body: { organization_id?: number; batch_size?: number } = {};
    try {
      body = await request.json();
    } catch {
      // Sin body — procesar todas las orgs
    }

    // Cliente con service role para bypass RLS
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    );

    const batchSize = body.batch_size || 50;

    // Si se especifica organization_id, procesar solo esa org
    if (body.organization_id) {
      const result = await processPendingStepRuns(body.organization_id, supabase, batchSize);

      return NextResponse.json(
        { success: true, data: result },
        {
          status: 200,
          headers: { 'Cache-Control': 'no-store, max-age=0' },
        },
      );
    }

    // Si no se especifica org, obtener todas las orgs con step_runs pendientes
    const now = new Date().toISOString();
    const { data: orgIds } = await supabase
      .from('sequence_step_runs')
      .select('organization_id')
      .eq('status', 'pending')
      .lte('scheduled_at', now)
      .limit(500);

    const uniqueOrgIds = Array.from(
      new Set((orgIds || []).map((r: { organization_id: number }) => r.organization_id)),
    );

    const allResults: Record<number, { processed: number; completed: number; failed: number; skipped: number }> = {};

    for (const orgId of uniqueOrgIds) {
      const result = await processPendingStepRuns(orgId, supabase, batchSize);
      allResults[orgId] = result;
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          organizations_processed: uniqueOrgIds.length,
          results: allResults,
        },
      },
      {
        status: 200,
        headers: { 'Cache-Control': 'no-store, max-age=0' },
      },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[Sequences Run] error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * GET — Alias para compatibilidad con cron jobs que usan GET.
 */
export async function GET(request: NextRequest) {
  return POST(request);
}
