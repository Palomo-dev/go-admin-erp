/**
 * /api/modules — módulos de una organización.
 *
 * F-76 (docs/hallazgos/F-76.md). Antes, el `POST` tomaba `organizationId` del
 * **body** y el `GET` del **query string**, y los dos consultaban con un
 * cliente `service_role` creado aquí mismo, sin comprobar sesión, pertenencia
 * ni permiso: cualquier usuario autenticado podía encender o apagar los
 * módulos de otra empresa pasando su id. Infringía las reglas duras 5 y 6.
 *
 * Ahora quién opera y sobre qué organización lo decide
 * `resolverObjetivoModulos` (src/lib/security/modulosObjetivo.ts), que empieza
 * por `getServerOrgContext`:
 * - **Miembro**: la organización es la de la sesión. Si el body o la query
 *   nombran otra: 403 `FOREIGN_ORGANIZATION` registrado. La pantalla de
 *   módulos sigue enviando su `organizationId`: la misma no es un error.
 *   `GET` (estado de módulos del plan) basta con pertenencia —es el mismo dato
 *   que cualquier miembro ya lee desde el navegador—. `POST` exige
 *   administrador (`requireOrgAdminOrPermission`: super admin miembro, rol 1/2
 *   por id o `admin.full_access` vía `check_user_permission`; nunca por nombre).
 * - **Plataforma**: administrador activo de GO Admin (`fn_is_platform_admin`)
 *   operando sobre una organización cliente de la que no es miembro. Nombra la
 *   organización en la petición, tiene que existir, y el acceso se registra.
 *
 * `service_role` llega al servicio SOLO con la organización ya validada. El
 * primer arreglo de F-76 lo quitó del todo: `get_current_plan` empieza por
 * `fn_assert_acceso_org`, que rechaza a quien no es miembro activo ni dueño,
 * así que operando como plataforma el plan llegaba `null` y solo quedaban los
 * cuatro módulos del núcleo.
 */

import { NextResponse } from 'next/server';
import { moduleManagementService } from '@/lib/services/moduleManagementService';
import { createPipelineFromTemplate } from '@/lib/services/crm/pipelineTemplates';
import { resolverObjetivoModulos, respuestaDeErrorOrg } from '@/lib/security/modulosObjetivo';

const RUTA = '/api/modules';

interface CuerpoPost {
  moduleCode?: string;
  action?: string;
  modulePages?: Array<{ name: string; href: string }>;
}

// GET /api/modules — estado de módulos de la organización validada.
export async function GET(request: Request) {
  let objetivo;
  try {
    objetivo = await resolverObjetivoModulos(request, { route: RUTA, escritura: false });
  } catch (err) {
    return respuestaDeErrorOrg(err);
  }

  try {
    const status = await moduleManagementService.getOrganizationModuleStatus(
      objetivo.organizationId,
      objetivo.service
    );
    return NextResponse.json({ success: true, data: status });
  } catch (error) {
    console.error('Error fetching modules:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/modules — activar o desactivar un módulo (administrador o plataforma).
export async function POST(request: Request) {
  let objetivo;
  try {
    objetivo = await resolverObjetivoModulos(request, { route: RUTA, escritura: true });
  } catch (err) {
    return respuestaDeErrorOrg(err);
  }

  try {
    const { moduleCode, action, modulePages } = (objetivo.body ?? {}) as CuerpoPost;

    if (!moduleCode || !action) {
      return NextResponse.json(
        { error: 'Module code and action are required' },
        { status: 400 }
      );
    }

    // La organización NO sale del body: es la que validó el resolutor.
    const orgId = objetivo.organizationId;

    let result;
    if (action === 'activate') {
      result = await moduleManagementService.activateModule(orgId, moduleCode, objetivo.service, modulePages);

      // Al activar el CRM se provisionan los embudos de Onboarding y Renovación.
      // El de ventas ya lo siembra la base (fn_seed_crm_pipeline_on_module).
      if (result.success && moduleCode === 'crm') {
        try {
          await createPipelineFromTemplate(objetivo.service, orgId, 'onboarding');
          await createPipelineFromTemplate(objetivo.service, orgId, 'renewal');
        } catch (provisionErr) {
          // No fallar la activación del módulo si la provisión de pipelines falla
          console.warn('POST /api/modules - Advertencia provisionando pipelines CRM:', provisionErr);
        }
      }
    } else if (action === 'deactivate') {
      result = await moduleManagementService.deactivateModule(orgId, moduleCode, objetivo.service);
    } else {
      return NextResponse.json(
        { error: 'Invalid action. Use "activate" or "deactivate"' },
        { status: 400 }
      );
    }

    if (objetivo.via === 'plataforma') {
      console.info(`[${RUTA}] módulo ${action} por la plataforma`, {
        adminUserId: objetivo.userId,
        organizacion: orgId,
        moduleCode,
        ok: result.success,
      });
    }

    return NextResponse.json({
      success: result.success,
      message: result.message,
      data: result.data,
    }, {
      status: result.success ? 200 : 400,
    });
  } catch (error) {
    console.error('Error managing module:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
