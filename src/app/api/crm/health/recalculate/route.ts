import { NextRequest, NextResponse } from 'next/server';
import { healthScoreService } from '@/lib/services/crm/healthScoreService';

/**
 * API Route - Cron para recalcular health scores del CRM (FASE 4 - Post-venta).
 *
 * POST /api/crm/health/recalculate
 * Body: { organization_id?: number }
 * Refresca mv_customer_health y recalcula scores de todos los clientes.
 *
 * Seguridad: Requiere CRON_SECRET en header Authorization (si esta configurado).
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Verificar autorizacion si CRON_SECRET esta configurado
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
      // Sin body
    }

    console.log('[CRM Health] Iniciando recalculo de health scores...');

    const count = await healthScoreService.refreshAllHealthScores(organizationId);

    const executionTime = Date.now() - startTime;
    console.log(`[CRM Health] Completado: ${count} clientes recalculados en ${executionTime}ms`);

    return NextResponse.json(
      {
        success: true,
        data: {
          customers_recalculated: count,
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
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Health] Error:', message);

    return NextResponse.json(
      { success: false, error: message },
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
