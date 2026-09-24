/**
 * /api/modules — módulos de LA organización de la sesión.
 *
 * Antes (F-76): el `POST` tomaba `organizationId` del **body** y el `GET` del
 * **query string**, y las dos consultaban con un cliente `service_role` creado
 * aquí mismo. No había ninguna comprobación de sesión, de pertenencia ni de
 * permiso: cualquier usuario autenticado de cualquier organización podía
 * encender o apagar los módulos de otra empresa pasando su id. Infringía de
 * frente las reglas duras 5 y 6 de `CLAUDE.md`.
 *
 * Ahora:
 * - La organización sale de la sesión (`withOrg` → `getServerOrgContext`).
 *   Si el body o la query declaran OTRA organización: 403
 *   `FOREIGN_ORGANIZATION` y se registra, en el punto único `readOrgBody`.
 *   La pantalla de módulos sigue enviando su `organizationId` en el body y
 *   sigue funcionando: la misma organización no es un error.
 * - `GET` (leer el estado de módulos del plan): basta **pertenencia**. Es el
 *   mismo dato que cualquier miembro ya lee con su propia sesión desde el
 *   navegador (`useActiveModules` → `moduleManagementService`), porque la RLS
 *   de `organization_modules` lo permite a todo miembro activo. Exigir admin
 *   aquí no cerraría nada y rompería lectores legítimos.
 * - `POST` (activar / desactivar un módulo): exige **administrador de la
 *   organización** (`withOrg(..., { admin: true })` →
 *   `requireOrgAdminOrPermission`: `is_super_admin`, rol 1/2 por id —nunca por
 *   nombre— o el permiso `admin.full_access` resuelto en la base con
 *   `check_user_permission`). Cambia lo que ve todo el ERP de la organización y
 *   consume el límite de módulos del plan: es acción de administrador.
 * - **Sin `service_role`.** Se usa el cliente de la sesión (`ctx.supabase`,
 *   con RLS). Comprobado contra la base el 2026-09-24: todo lo que estas dos
 *   operaciones necesitan está permitido a un miembro activo —`organizations`
 *   (select if member), `modules` (select for authenticated), `plans` (lectura
 *   pública), `subscriptions` y `organization_modules` (aislamiento por
 *   organización), `pipelines`/`stages` (insert if member)— y `get_current_plan`
 *   es `SECURITY DEFINER` con grant a `authenticated`. Los dos disparadores de
 *   siembra del CRM (`trg_crm_module_activated_seed`,
 *   `trg_seed_crm_pipeline_on_module`) también son `SECURITY DEFINER`, así que
 *   no dependen de los privilegios de quien inserta.
 */

import { NextResponse } from 'next/server';
import { moduleManagementService } from '@/lib/services/moduleManagementService';
import { createPipelineFromTemplate } from '@/lib/services/crm/pipelineTemplates';
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';

const RUTA = '/api/modules';

// GET /api/modules — estado de módulos de la organización de la sesión.
export const GET = withOrg(async (ctx, request) => {
  // Fuera del try: una organización ajena en la query (`?organizationId=999`)
  // debe salir como 403 `FOREIGN_ORGANIZATION` por `withOrg`, no convertirse
  // en el 500 genérico de abajo.
  await readOrgBody(ctx, request, { route: RUTA });

  try {
    const status = await moduleManagementService.getOrganizationModuleStatus(
      ctx.organizationId,
      ctx.supabase
    );

    return NextResponse.json({ success: true, data: status });
  } catch (error) {
    console.error('Error fetching modules:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

// POST /api/modules — activar o desactivar un módulo (solo administradores).
export const POST = withOrg(async (ctx, request) => {
  // Fuera del try, por lo mismo que en el GET: el 403 no se convierte en 500.
  const body = await readOrgBody<{
    moduleCode?: string;
    action?: string;
    modulePages?: Array<{ name: string; href: string }>;
  }>(ctx, request, { route: RUTA });

  try {
    const { moduleCode, action, modulePages } = body ?? {};

    if (!moduleCode || !action) {
      return NextResponse.json(
        { error: 'Module code and action are required' },
        { status: 400 }
      );
    }

    // La organización NO sale del body: es la de la sesión, ya validada.
    const orgId = ctx.organizationId;

    let result;
    if (action === 'activate') {
      result = await moduleManagementService.activateModule(orgId, moduleCode, ctx.supabase, modulePages);

      // Al activar el módulo CRM, provisionar los pipelines de Onboarding y Renovación
      // para que aparezcan en el selector del PipelineHeader desde el inicio.
      if (result.success && moduleCode === 'crm') {
        try {
          await createPipelineFromTemplate(ctx.supabase, orgId, 'onboarding');
          await createPipelineFromTemplate(ctx.supabase, orgId, 'renewal');
        } catch (provisionErr) {
          // No fallar la activación del módulo si la provisión de pipelines falla
          console.warn('POST /api/modules - Advertencia provisionando pipelines CRM:', provisionErr);
        }
      }
    } else if (action === 'deactivate') {
      result = await moduleManagementService.deactivateModule(orgId, moduleCode, ctx.supabase);
    } else {
      return NextResponse.json(
        { error: 'Invalid action. Use "activate" or "deactivate"' },
        { status: 400 }
      );
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
}, { admin: true });
