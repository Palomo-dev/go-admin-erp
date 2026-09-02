import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import {
  getDiscoveryData,
  saveDiscoveryData,
  initializeDiscoveryFromTemplate,
} from '@/lib/services/crm/discoveryService';
import type { DiscoveryData } from '@/lib/services/crm/discoveryService';

/**
 * GET /api/crm/discovery/[opportunityId] — Obtiene el discovery_data de una oportunidad.
 * Query: ?templateId=<id> — inicializa discovery_data desde un template.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ opportunityId: string }> }
) {
  try {
    const ctx = await getServerOrgContext();
    const { opportunityId } = await params;
    const { searchParams } = new URL(request.url);
    const templateId = searchParams.get('templateId');

    // Si viene templateId, inicializar discovery desde ese template
    if (templateId) {
      const initialized = await initializeDiscoveryFromTemplate(
        opportunityId,
        templateId,
        ctx.supabase
      );

      if (!initialized) {
        return NextResponse.json(
          { success: false, error: 'No se pudo inicializar desde el template' },
          { status: 404 }
        );
      }

      return NextResponse.json({ success: true, data: initialized }, { status: 200 });
    }

    // Sin templateId: retornar discovery_data existente
    const data = await getDiscoveryData(opportunityId, ctx.supabase);

    return NextResponse.json({ success: true, data }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Discovery] GET error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * PUT /api/crm/discovery/[opportunityId] — Guarda el discovery_data de una oportunidad.
 * Body: DiscoveryData
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ opportunityId: string }> }
) {
  try {
    const ctx = await getServerOrgContext();
    const { opportunityId } = await params;
    const body = await request.json();

    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { success: false, error: 'Body inválido: se espera un objeto DiscoveryData' },
        { status: 400 }
      );
    }

    const saved = await saveDiscoveryData(
      opportunityId,
      body as DiscoveryData,
      ctx.supabase
    );

    return NextResponse.json({ success: true, data: saved }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Discovery] PUT error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
