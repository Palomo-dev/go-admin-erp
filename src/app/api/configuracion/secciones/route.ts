/**
 * GET /api/configuracion/secciones — qué secciones de Configuración ve la
 * persona y cuáles puede editar (decisión del dueño, 2026-10-07).
 *
 * La organización sale de la sesión (`withOrg`), los módulos activos del plan
 * de `organization_modules` (`moduleManagementService.getActiveModules` con el
 * cliente de la sesión) y cada permiso de `check_user_permission`
 * (`hasOrgAdminOrPermission`). Regla en `permisosSecciones.ts`.
 *
 * Falla CERRADO: si no se pueden leer los módulos, 503 y la página no muestra
 * ninguna sección.
 */
import { NextResponse } from 'next/server';
import { hasOrgAdminOrPermission, withOrg } from '@/lib/utils/orgContext';
import { moduleManagementService } from '@/lib/services/moduleManagementService';
import { resolverPermisosSecciones } from '@/components/configuracion/config/permisosSecciones';
import { logError } from '@/lib/utils/errorMessage';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx) => {
  try {
    const modulos = await moduleManagementService.getActiveModules(ctx.organizationId, ctx.supabase);
    const secciones = await resolverPermisosSecciones(
      modulos.map((m) => m.code),
      (codigo) => hasOrgAdminOrPermission(ctx, codigo),
    );
    return NextResponse.json({ secciones }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    logError('[GET /api/configuracion/secciones]', err);
    return NextResponse.json({ error: 'No se pudieron leer los módulos de la organización', code: 'MODULOS_NO_DISPONIBLES' }, { status: 503 });
  }
});
