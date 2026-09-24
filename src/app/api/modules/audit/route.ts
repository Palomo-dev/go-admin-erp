/**
 * /api/modules/audit — auditoría de módulos de TODAS las organizaciones.
 *
 * Es una herramienta de plataforma (no la llama ninguna pantalla ni cron):
 * exige sesión de un **administrador de plataforma** activo. Antes no tenía
 * ninguna comprobación y corría con el cliente browser (como `anon`); luego
 * pasó a comprobarlo con una función local que consultaba `platform_admins`
 * con `service_role`.
 *
 * Desde 2026-09-24 usa el punto único del repositorio, `withPlatformAdmin`
 * (`@/lib/security/platformAdmin` → `fn_is_platform_admin()`, `SECURITY
 * DEFINER`, `status = 'active'`, con el cliente de la sesión y fail-closed),
 * en vez de repetir la comprobación aquí (regla dura 7). Semántica idéntica a
 * la que tenía: mismo `platform_admins`, mismo `status = 'active'`.
 *
 * El trabajo de auditoría / corrección sí va con `service_role`, y **solo
 * después** de esa comprobación: recorre organizaciones de las que el admin de
 * plataforma no es miembro, así que RLS lo dejaría sin datos.
 *
 * `organizationId` del body es la organización CLIENTE de destino, no la del
 * usuario: aquí no hay `readOrgBody` porque no hay organización de sesión con la
 * que compararla — el permiso es de plataforma, no de organización.
 */

import { NextResponse } from 'next/server';
import { moduleManagementService } from '@/lib/services/moduleManagementService';
import { withPlatformAdmin } from '@/lib/security/platformAdmin';
import { getServiceClient } from '@/lib/supabase/server-service';

// GET /api/modules/audit - Ejecutar auditoría de módulos
export const GET = withPlatformAdmin(async () => {
  try {
    const auditResults = await moduleManagementService.auditOrganizationModules(getServiceClient());

    return NextResponse.json({
      success: true,
      data: auditResults
    });

  } catch (error) {
    console.error('Error running module audit:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});

// POST /api/modules/audit - Corregir inconsistencias de una organización
export const POST = withPlatformAdmin(async (_admin, request) => {
  try {
    const body = await request.json();
    const { organizationId } = body;

    const orgId = Number(organizationId);
    if (!organizationId || !Number.isInteger(orgId) || orgId <= 0) {
      return NextResponse.json(
        { error: 'Organization ID is required' },
        { status: 400 }
      );
    }

    const result = await moduleManagementService.fixInconsistencies(orgId, getServiceClient());

    return NextResponse.json({
      success: result.success,
      message: result.message,
      data: result.data
    }, {
      status: result.success ? 200 : 400
    });

  } catch (error) {
    console.error('Error fixing inconsistencies:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});
