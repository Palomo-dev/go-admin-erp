import { NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { importVerticalTemplate } from '@/lib/services/crm/verticalsService';

/**
 * POST /api/crm/verticales/import-template — Importa los 6 verticales de plantilla.
 * Idempotente: solo crea los verticales que no existan previamente (valida por slug).
 */
export async function POST() {
  try {
    const ctx = await getServerOrgContext();

    const createdCount = await importVerticalTemplate(ctx.organizationId, ctx.supabase);

    return NextResponse.json(
      {
        success: true,
        data: {
          created: createdCount,
          message: createdCount > 0
            ? `${createdCount} verticales importados`
            : 'Todos los verticales ya existían',
        },
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Verticales Import] POST error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
