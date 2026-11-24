import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, hasOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { respuestaErrorCrm } from '@/lib/services/crm/crmRouteSupport';
import { DEFAULT_HEALTH_CONFIG, parseHealthConfigEditable, validateHealthConfig } from '@/lib/services/crm/healthBands';

/**
 * /api/crm/health/config — «Configuración de factores» de Salud de clientes
 * (Figma 1424:932, anotación 1424:1606). La config vive en
 * `health_score_configs.config = { bands, indicators[] }` (PK organization_id,
 * verificado por MCP el 2026-11-15); no hace falta tabla nueva.
 *
 * - GET: config editable de la organización de la sesión (con los indicadores
 *   apagados) o la propuesta inicial si aún no hay fila, y `puedeEditar`
 *   resuelto en el servidor (regla 6).
 * - PUT: solo admin (`admin.full_access`). Valida que los pesos encendidos
 *   sumen 100, que cada clave exista en `fn_customer_health` y las bandas.
 *   La organización sale de la sesión (regla 5): un body con otra → 403.
 *   «Guardar y recalcular» lo encadena el cliente con `POST /api/crm/health/refresh`.
 */
export const dynamic = 'force-dynamic';

const NO_CACHE = { 'Cache-Control': 'private, no-store' };

export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    const [{ data, error }, puedeEditar] = await Promise.all([
      ctx.supabase
        .from('health_score_configs')
        .select('config, is_active')
        .eq('organization_id', ctx.organizationId)
        .maybeSingle(),
      hasOrgAdminOrPermission(ctx),
    ]);
    if (error) throw error;
    const fila = data as { config: unknown; is_active: boolean | null } | null;
    const config = (fila ? parseHealthConfigEditable(fila.config) : null) ?? DEFAULT_HEALTH_CONFIG;
    return NextResponse.json(
      { success: true, data: { config, guardada: !!fila, activa: fila?.is_active !== false, puedeEditar } },
      { headers: NO_CACHE },
    );
  } catch (error) {
    return respuestaErrorCrm(error, 'GET /api/crm/health/config');
  }
}

export async function PUT(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    if (!(await hasOrgAdminOrPermission(ctx))) {
      console.warn('[crm] PUT /api/crm/health/config sin admin (org %s, rol %s)', ctx.organizationId, ctx.roleId);
      return NextResponse.json({ success: false, error: 'Solo un administrador puede cambiar los factores de salud', code: 'ADMIN_REQUIRED' }, { status: 403 });
    }
    const body = await readOrgBody<{ config?: unknown }>(ctx, request, { route: 'crm/health/config' });
    const config = parseHealthConfigEditable(body?.config);
    if (!config) {
      return NextResponse.json({ success: false, error: 'Config inválida', errores: ['formato'] }, { status: 400 });
    }
    const errores = validateHealthConfig(config);
    if (errores.length > 0) {
      return NextResponse.json({ success: false, error: 'Config inválida', errores }, { status: 400 });
    }
    const { data, error } = await ctx.supabase
      .from('health_score_configs')
      .upsert({ organization_id: ctx.organizationId, config, updated_at: new Date().toISOString() }, { onConflict: 'organization_id' })
      .select('is_active')
      .maybeSingle();
    if (error) throw error;
    const activa = (data as { is_active: boolean | null } | null)?.is_active !== false;
    return NextResponse.json({ success: true, data: { config, guardada: true, activa, puedeEditar: true } }, { headers: NO_CACHE });
  } catch (error) {
    return respuestaErrorCrm(error, 'PUT /api/crm/health/config');
  }
}
