/**
 * POST /api/crm/voice-agents/campaigns/run — Cron para procesar la cola de llamadas.
 *
 * Ejecuta runCampaignQueue para todas las organizaciones con campañas activas.
 * Seguridad: Requiere CRON_SECRET en header Authorization (si está configurado).
 *
 * Body: { organization_id?: number } — si se omite, procesa todas las orgs.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { runCampaignQueue } from '@/lib/services/crm/voiceAgentService';

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Faltan credenciales Supabase (service_role)');
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Verificar CRON_SECRET (fail-closed)
    const expectedToken = process.env.CRON_SECRET;
    if (!expectedToken) {
      console.error('[Voice Agent Queue] CRON_SECRET no configurado — endpoint bloqueado');
      return NextResponse.json(
        { success: false, error: 'No autorizado' },
        { status: 401 }
      );
    }
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json(
        { success: false, error: 'No autorizado' },
        { status: 401 }
      );
    }

    const supabase = getServiceSupabase();

    // Leer organization_id del body (opcional)
    let organizationId: number | undefined;
    try {
      const body = await request.json();
      organizationId = body?.organization_id;
    } catch {
      // Sin body — procesar todas las orgs
    }

    const allResults: Array<{
      organization_id: number;
      campaigns_processed: number;
      calls_initiated: number;
      calls_skipped: number;
      errors: string[];
    }> = [];

    if (organizationId) {
      // Procesar una sola org
      const result = await runCampaignQueue(organizationId, supabase);
      allResults.push({ organization_id: organizationId, ...result });
    } else {
      // Procesar todas las orgs con campañas running
      const { data: orgsWithCampaigns } = await supabase
        .from('voice_agent_campaigns')
        .select('organization_id')
        .eq('status', 'running');

      const orgIds = Array.from(
        new Set((orgsWithCampaigns || []).map((r) => (r as { organization_id: number }).organization_id))
      );

      for (const orgId of orgIds) {
        try {
          const result = await runCampaignQueue(orgId, supabase);
          allResults.push({ organization_id: orgId, ...result });
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Error desconocido';
          allResults.push({
            organization_id: orgId,
            campaigns_processed: 0,
            calls_initiated: 0,
            calls_skipped: 0,
            errors: [message],
          });
        }
      }
    }

    const executionTime = Date.now() - startTime;
    const totalCalls = allResults.reduce((sum, r) => sum + r.calls_initiated, 0);
    const totalErrors = allResults.flatMap((r) => r.errors);

    console.log(
      `[Voice Agent Queue] Completado: ${totalCalls} llamadas iniciadas en ${executionTime}ms`
    );

    return NextResponse.json(
      {
        success: true,
        data: {
          results: allResults,
          total_calls_initiated: totalCalls,
          total_errors: totalErrors,
          execution_time_ms: executionTime,
          date: new Date().toISOString(),
        },
      },
      {
        status: 200,
        headers: { 'Cache-Control': 'no-store, max-age=0' },
      }
    );
  } catch (error: unknown) {
    const executionTime = Date.now() - startTime;
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[Voice Agent Queue] Error:', message);

    return NextResponse.json(
      {
        success: false,
        error: message,
        execution_time_ms: executionTime,
        date: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

/**
 * GET - Alias para compatibilidad con cron jobs que usan GET.
 */
export async function GET(request: NextRequest) {
  return POST(request);
}
