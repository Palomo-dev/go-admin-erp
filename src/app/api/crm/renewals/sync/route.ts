import { NextRequest, NextResponse } from 'next/server';
import { renewalService } from '@/lib/services/crm/renewalService';

/**
 * API Route - Cron para sincronizar renovaciones del CRM (FASE 4 - Post-venta).
 *
 * POST /api/crm/renewals/sync
 * Body: { organization_id?: number }
 * Ejecuta renewalService.syncRenewals para la organizacion.
 *
 * GET /api/crm/renewals/sync?days=90
 * Retorna proximas renovaciones.
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

    console.log('[CRM Renewals] Iniciando sincronizacion de renovaciones...');

    const count = await renewalService.syncRenewals(organizationId);

    const executionTime = Date.now() - startTime;
    console.log(`[CRM Renewals] Completado: ${count} renovaciones en ${executionTime}ms`);

    return NextResponse.json(
      {
        success: true,
        data: {
          renewals_created: count,
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
    console.error('[CRM Renewals] Error:', message);

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

/**
 * GET - Retorna proximas renovaciones.
 * Query params: days (default: 90), organization_id (opcional)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') || '90', 10);
    const orgIdParam = searchParams.get('organization_id');
    const organizationId = orgIdParam ? parseInt(orgIdParam, 10) : undefined;

    const renewals = await renewalService.getUpcomingRenewals(days, organizationId);

    return NextResponse.json(
      {
        success: true,
        data: renewals,
        count: renewals.length,
      },
      {
        status: 200,
        headers: { 'Cache-Control': 'no-store, max-age=0' },
      }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Renewals] Error en GET:', message);

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
