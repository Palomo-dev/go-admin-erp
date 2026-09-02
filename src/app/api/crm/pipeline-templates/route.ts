import { NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { PIPELINE_TEMPLATES } from '@/lib/services/crm/pipelineTemplates';

/**
 * GET /api/crm/pipeline-templates — Lista las plantillas de pipeline importables.
 * No requiere filtrado por org porque son plantillas canónicas globales,
 * pero sí requiere sesión activa (getServerOrgContext valida la sesión).
 */
export async function GET() {
  try {
    // Validar sesión y org context
    await getServerOrgContext();

    // Devolver las plantillas sin las etapas completas para mantener la respuesta ligera.
    // El detalle de etapas se obtiene al importar.
    const templates = PIPELINE_TEMPLATES.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      pipeline_type: t.pipeline_type,
      stages_count: t.stages.length,
    }));

    return NextResponse.json({ success: true, data: templates }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Pipeline Templates] GET error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
