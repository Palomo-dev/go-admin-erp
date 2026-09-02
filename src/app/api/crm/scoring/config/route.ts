import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { isOrgAdmin } from '@/lib/utils/rbac';
import ScoringService, {
  type ScoringConfig,
  type ScoringIndicator,
  type ScoringBands,
  type GOCScoringConfig,
} from '@/lib/services/crm/scoringService';

/**
 * GET /api/crm/scoring/config — Obtiene la configuración de scoring de la org.
 * Retorna la config existente o una config por defecto si no hay ninguna.
 */
export async function GET() {
  try {
    const ctx = await getServerOrgContext();

    const service = new ScoringService(ctx.organizationId);
    const config = await service.getConfig();

    if (!config) {
      // Retornar config por defecto para que el frontend pueda editarla
      const defaultConfig: ScoringConfig = {
        organization_id: ctx.organizationId,
        indicators: [],
        bands: { cold: { min: 0, max: 33 }, warm: { min: 34, max: 66 }, hot: { min: 67, max: 100 } },
      };
      return NextResponse.json({ success: true, data: defaultConfig }, { status: 200 });
    }

    return NextResponse.json({ success: true, data: config }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Scoring Config] GET error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * PUT /api/crm/scoring/config — Guarda (upsert) la configuración de scoring.
 * Requiere rol admin/owner.
 * Body: { id?, indicators: ScoringIndicator[], bands: ScoringBands }
 */
export async function PUT(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();

    if (!isOrgAdmin(ctx)) {
      return NextResponse.json(
        { success: false, error: 'No autorizado: se requiere rol admin u owner' },
        { status: 403 }
      );
    }

    const body = await request.json();

    // Validar campos obligatorios
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { success: false, error: 'Cuerpo de la petición inválido' },
        { status: 400 }
      );
    }

    // Detectar schema: GOC (dimensions + bands array) o antiguo (indicators + bands object)
    const isGOCSchema = body.dimensions && typeof body.dimensions === 'object' && Array.isArray(body.bands);

    if (isGOCSchema) {
      // === Validar schema GOC canónico (F1) ===
      const gocConfig = body as GOCScoringConfig;

      // Validar dimensions (4 dimensiones: go_fit, opportunity, capacity, timing)
      const requiredDims = ['go_fit', 'opportunity', 'capacity', 'timing'];
      for (const dimKey of requiredDims) {
        const dim = gocConfig.dimensions[dimKey];
        if (!dim || !dim.label || typeof dim.weight !== 'number') {
          return NextResponse.json(
            { success: false, error: `La dimensión "${dimKey}" debe tener label y weight (numérico)` },
            { status: 400 }
          );
        }
        if (!Array.isArray(dim.criteria)) {
          return NextResponse.json(
            { success: false, error: `La dimensión "${dimKey}" debe tener criteria (array)` },
            { status: 400 }
          );
        }
        for (const crit of dim.criteria) {
          if (!crit?.field || !crit?.operator || typeof crit.points !== 'number') {
            return NextResponse.json(
              { success: false, error: `Cada criterio en "${dimKey}" debe tener field, operator y points` },
              { status: 400 }
            );
          }
        }
      }

      // Validar bands (array de 5 bandas con min, max, label, color)
      if (gocConfig.bands.length < 3) {
        return NextResponse.json(
          { success: false, error: 'bands debe tener al menos 3 bandas' },
          { status: 400 }
        );
      }
      for (const band of gocConfig.bands) {
        if (typeof band.min !== 'number' || typeof band.max !== 'number' || !band.label) {
          return NextResponse.json(
            { success: false, error: 'Cada banda debe tener min, max y label' },
            { status: 400 }
          );
        }
      }

      // Guardar como config GOC en scoring_configs.config (jsonb)
      const service = new ScoringService(ctx.organizationId);
      const saved = await service.saveConfig({
        id: body.id,
        organization_id: ctx.organizationId,
        indicators: [],
        bands: { cold: { min: 0, max: 33 }, warm: { min: 34, max: 66 }, hot: { min: 67, max: 100 } },
      } as ScoringConfig);

      // Si saveConfig exitó, actualizar el jsonb con el schema GOC completo
      if (saved && saved.id) {
        const { error: updateError } = await ctx.supabase
          .from('scoring_configs')
          .update({ config: gocConfig })
          .eq('id', saved.id);
        if (updateError) {
          console.error('[CRM Scoring Config] Error guardando GOC config:', updateError);
          return NextResponse.json(
            { success: false, error: 'Error al persistir la configuración GOC' },
            { status: 500 }
          );
        }
      }

      if (!saved) {
        return NextResponse.json(
          { success: false, error: 'No se pudo guardar la configuración GOC' },
          { status: 500 }
        );
      }

      return NextResponse.json({ success: true, data: { ...saved, goc_config: gocConfig } }, { status: 200 });
    }

    // === Schema antiguo (indicators + bands cold/warm/hot) — backward compatible ===
    if (!Array.isArray(body.indicators)) {
      return NextResponse.json(
        { success: false, error: 'El campo "indicators" debe ser un array o "dimensions" (schema GOC)' },
        { status: 400 }
      );
    }

    if (!body.bands || typeof body.bands !== 'object') {
      return NextResponse.json(
        { success: false, error: 'El campo "bands" es obligatorio' },
        { status: 400 }
      );
    }

    // Validar estructura mínima de cada indicador
    for (const ind of body.indicators as ScoringIndicator[]) {
      if (!ind?.key || !ind?.label || typeof ind.weight !== 'number') {
        return NextResponse.json(
          {
            success: false,
            error: 'Cada indicador debe tener key, label y weight (numérico)',
          },
          { status: 400 }
        );
      }
      if (!Array.isArray(ind.options)) {
        return NextResponse.json(
          { success: false, error: `El indicador "${ind.key}" debe tener options (array)` },
          { status: 400 }
        );
      }
    }

    // Validar bandas
    const bands = body.bands as ScoringBands;
    if (
      !bands.cold || typeof bands.cold.min !== 'number' ||
      !bands.warm || typeof bands.warm.min !== 'number' ||
      !bands.hot || typeof bands.hot.min !== 'number'
    ) {
      return NextResponse.json(
        { success: false, error: 'bands debe tener cold, warm y hot con min numérico' },
        { status: 400 }
      );
    }

    const configToSave: ScoringConfig = {
      id: body.id,
      organization_id: ctx.organizationId,
      indicators: body.indicators,
      bands,
    };

    const service = new ScoringService(ctx.organizationId);
    const saved = await service.saveConfig(configToSave);

    if (!saved) {
      return NextResponse.json(
        { success: false, error: 'No se pudo guardar la configuración' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data: saved }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Scoring Config] PUT error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
