/**
 * /api/modules/pages — páginas apagadas a propósito, por módulo, de LA
 * organización de la sesión.
 *
 * Antes (F-77 §«Pendiente»): mismo defecto que F-76 un nivel más abajo. El
 * `GET` tomaba `organizationId` del query string y el `POST` del body, los dos
 * consultaban con `service_role` y ninguno comprobaba sesión, pertenencia ni
 * permiso: cualquier sesión válida podía leer y cambiar las páginas de módulo
 * de OTRA organización.
 *
 * Ahora, igual que `/api/modules`:
 * - La organización sale de la sesión (`withOrg`); otra en body o query → 403
 *   `FOREIGN_ORGANIZATION` y registro, en el punto único `readOrgBody`.
 * - `GET`: basta **pertenencia** (la RLS de `organization_module_pages` ya deja
 *   leer sus filas a cualquier miembro activo, y el menú lateral las lee así
 *   desde el navegador en cada carga).
 * - `POST`: exige **administrador de la organización** (`{ admin: true }`).
 *   Apagar una página cambia el menú de todo el mundo en esa organización.
 * - Sin `service_role`: el cliente de la sesión (`ctx.supabase`) basta, porque
 *   la política `org_module_pages_org_isolation` es `FOR ALL` sobre las filas de
 *   las organizaciones del usuario.
 */

import { NextResponse } from 'next/server';
import { moduleManagementService } from '@/lib/services/moduleManagementService';
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';

const RUTA = '/api/modules/pages';

// GET /api/modules/pages — filas de páginas de la organización de la sesión.
export const GET = withOrg(async (ctx, request) => {
  await readOrgBody(ctx, request, { route: RUTA });

  try {
    const pages = await moduleManagementService.getActiveModulePages(
      ctx.organizationId,
      ctx.supabase
    );

    return NextResponse.json({ success: true, data: pages });
  } catch (error) {
    console.error('Error fetching module pages:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

// POST /api/modules/pages — encender o apagar una página (solo administradores).
export const POST = withOrg(async (ctx, request) => {
  const body = await readOrgBody<{
    moduleCode?: string;
    pageHref?: string;
    pageName?: string;
    isActive?: boolean;
  }>(ctx, request, { route: RUTA });

  try {
    const { moduleCode, pageHref, pageName, isActive } = body ?? {};

    if (!moduleCode || !pageHref || !pageName) {
      return NextResponse.json(
        { error: 'moduleCode, pageHref, and pageName are required' },
        { status: 400 }
      );
    }

    const result = await moduleManagementService.toggleModulePage(
      ctx.organizationId,
      moduleCode,
      pageHref,
      pageName,
      isActive as boolean,
      ctx.supabase
    );

    return NextResponse.json({
      success: result.success,
      message: result.message,
    }, {
      status: result.success ? 200 : 400,
    });
  } catch (error) {
    console.error('Error toggling module page:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}, { admin: true });
