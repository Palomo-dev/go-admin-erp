import { NextRequest, NextResponse } from 'next/server';
import { verifyCronSecret, webhookErrorResponse } from '@/lib/security/webhookSignatures';
import { processPendingAccountDeletions } from '@/lib/services/accountDeletionService';

/**
 * GET /api/cron/process-account-deletions
 *
 * Procesa las solicitudes de eliminación de cuenta que han superado el plazo legal.
 * 
 * Cumplimiento GDPR/LOPD:
 * - Elimina/anonimiza datos personales después de 10 días calendario (15 días hábiles)
 * - Conserva facturación y contabilidad por 10 años (obligación legal)
 * - Envía correos de confirmación
 * - Registra auditoría completa sin datos personales
 * 
 * Debe ser llamado por Vercel Cron cada día.
 * 
 * Seguridad: Requiere el header `Authorization: Bearer CRON_SECRET`.
 * 
 * Query params:
 *   - daysAfter: días calendario después de la solicitud (default: 10)
 */
export async function GET(request: NextRequest) {
  try {
    // 1. Verificar autorización
    try {
      verifyCronSecret(request);
    } catch (err) {
      return webhookErrorResponse(err);
    }

    // 2. Obtener días configurables (default 10 días)
    const { searchParams } = new URL(request.url);
    const daysAfter = parseInt(searchParams.get('daysAfter') || '10', 10);
    
    if (daysAfter < 1 || daysAfter > 30) {
      return NextResponse.json(
        { success: false, error: 'daysAfter debe estar entre 1 y 30' },
        { status: 400 }
      );
    }

    console.log(`[Account Deletion Cron] Iniciando procesamiento (${daysAfter} días)`);

    // 3. Procesar eliminaciones pendientes
    const result = await processPendingAccountDeletions(daysAfter);

    console.log(
      `[Account Deletion Cron] Completado: ${result.succeeded} exitosas, ` +
      `${result.failed} fallidas, ${result.skipped} omitidas de ${result.processed} total`
    );

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      daysAfter,
      ...result,
    });

  } catch (error: unknown) {
    console.error('[Account Deletion Cron] Error inesperado:', error);
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    
    return NextResponse.json(
      { 
        success: false, 
        error: message,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
