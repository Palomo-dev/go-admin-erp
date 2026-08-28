import { NextRequest, NextResponse } from 'next/server';
import { followupEngineService } from '@/lib/services/crm/followupEngineService';

/**
 * API Route - Cron para ejecutar secuencias de seguimiento del CRM.
 *
 * POST /api/crm/followup/run
 * Body: { organization_id?: number }
 *
 * Seguridad: Requiere CRON_SECRET en header Authorization (si está configurado).
 * Si no hay CRON_SECRET, permite ejecución directa (para desarrollo).
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Verificar autorización si CRON_SECRET está configurado
    const expectedToken = process.env.CRON_SECRET;
    if (expectedToken) {
      const authHeader = request.headers.get('authorization');
      if (authHeader !== `Bearer ${expectedToken}`) {
        return NextResponse.json(
          { success: false, error: 'No autorizado' },
          { status: 401 }
        );
      }
    }

    // Leer organization_id del body (opcional)
    let organizationId: number | undefined;
    try {
      const body = await request.json();
      organizationId = body?.organization_id;
    } catch {
      // Sin body — usar getOrganizationId del contexto
    }

    console.log('🔄 [CRM Followup] Iniciando ejecución de secuencias...');

    const result = await followupEngineService.runFollowupSequences(organizationId);

    const executionTime = Date.now() - startTime;
    console.log(
      `✅ [CRM Followup] Completado: ${result.total_actions} acciones en ${executionTime}ms`
    );

    return NextResponse.json(
      {
        success: true,
        data: {
          total_automations: result.total_automations,
          total_actions: result.total_actions,
          results: result.results,
          errors: result.errors,
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
    console.error('❌ [CRM Followup] Error:', message);

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
