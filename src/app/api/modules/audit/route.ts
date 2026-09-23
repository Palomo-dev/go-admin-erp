/**
 * /api/modules/audit — auditoría de módulos de TODAS las organizaciones.
 *
 * Es una herramienta de plataforma (no la llama ninguna pantalla ni cron):
 * exige sesión de un administrador de plataforma activo
 * (`platform_admins.user_id = auth user` y `status = 'active'`, consultado con
 * service role). Antes no tenía ninguna comprobación y corría con el cliente
 * browser (como `anon`). El trabajo de auditoría/corrección va con el cliente
 * service-role, SOLO después de la comprobación.
 */

import { NextResponse } from 'next/server';
import { moduleManagementService } from '@/lib/services/moduleManagementService';
import { getServerUserClient } from '@/lib/supabase/server-user';
import { getServiceClient } from '@/lib/supabase/server-service';

/** `null` si la sesión es de un admin de plataforma activo; si no, la respuesta 401/403. */
async function requirePlatformAdmin(): Promise<NextResponse | null> {
  const userClient = await getServerUserClient();
  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const { data: admin, error: adminError } = await getServiceClient()
    .from('platform_admins')
    .select('id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle();

  if (adminError || !admin) {
    console.warn('[api/modules/audit] acceso denegado: no es admin de plataforma', {
      userId: user.id,
      error: adminError?.message ?? null,
    });
    return NextResponse.json({ error: 'Requiere administrador de plataforma' }, { status: 403 });
  }
  return null;
}

// GET /api/modules/audit - Ejecutar auditoría de módulos
export async function GET() {
  try {
    const denied = await requirePlatformAdmin();
    if (denied) return denied;

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
}

// POST /api/modules/audit - Corregir inconsistencias de una organización
export async function POST(request: Request) {
  try {
    const denied = await requirePlatformAdmin();
    if (denied) return denied;

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
}
