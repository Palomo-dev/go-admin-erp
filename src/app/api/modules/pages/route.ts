/**
 * /api/modules/pages — páginas apagadas a propósito, por módulo, de una
 * organización.
 *
 * F-77 §«Pendiente»: mismo defecto que F-76 un nivel más abajo. El `GET`
 * tomaba `organizationId` del query string y el `POST` del body, los dos
 * consultaban con `service_role` y ninguno comprobaba sesión, pertenencia ni
 * permiso: cualquier sesión válida podía leer y cambiar las páginas de módulo
 * de OTRA organización.
 *
 * Ahora comparte con `/api/modules` el resolutor `resolverObjetivoModulos`
 * (src/lib/security/modulosObjetivo.ts), porque la pantalla de módulos llama a
 * las dos y tienen que decidir igual:
 * - **Miembro**: su organización; otra en body o query → 403
 *   `FOREIGN_ORGANIZATION` registrado. `GET` basta con pertenencia (el menú
 *   lateral ya lee estas filas desde el navegador); `POST` exige administrador,
 *   porque apagar una página cambia el menú de toda la organización.
 * - **Plataforma**: administrador activo de GO Admin sobre una organización
 *   cliente, nombrada en la petición, que exista; el acceso se registra.
 *
 * `service_role` llega al servicio solo con la organización ya validada.
 */

import { NextResponse } from 'next/server';
import { moduleManagementService } from '@/lib/services/moduleManagementService';
import { resolverObjetivoModulos, respuestaDeErrorOrg } from '@/lib/security/modulosObjetivo';

const RUTA = '/api/modules/pages';

interface CuerpoPost {
  moduleCode?: string;
  pageHref?: string;
  pageName?: string;
  isActive?: boolean;
}

// GET /api/modules/pages — filas de páginas de la organización validada.
export async function GET(request: Request) {
  let objetivo;
  try {
    objetivo = await resolverObjetivoModulos(request, { route: RUTA, escritura: false });
  } catch (err) {
    return respuestaDeErrorOrg(err);
  }

  try {
    const pages = await moduleManagementService.getActiveModulePages(
      objetivo.organizationId,
      objetivo.service
    );
    return NextResponse.json({ success: true, data: pages });
  } catch (error) {
    console.error('Error fetching module pages:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/modules/pages — encender o apagar una página (administrador o plataforma).
export async function POST(request: Request) {
  let objetivo;
  try {
    objetivo = await resolverObjetivoModulos(request, { route: RUTA, escritura: true });
  } catch (err) {
    return respuestaDeErrorOrg(err);
  }

  try {
    const { moduleCode, pageHref, pageName, isActive } = (objetivo.body ?? {}) as CuerpoPost;

    if (!moduleCode || !pageHref || !pageName) {
      return NextResponse.json(
        { error: 'moduleCode, pageHref, and pageName are required' },
        { status: 400 }
      );
    }

    const result = await moduleManagementService.toggleModulePage(
      objetivo.organizationId,
      moduleCode,
      pageHref,
      pageName,
      isActive as boolean,
      objetivo.service
    );

    if (objetivo.via === 'plataforma') {
      console.info(`[${RUTA}] página ${isActive ? 'encendida' : 'apagada'} por la plataforma`, {
        adminUserId: objetivo.userId,
        organizacion: objetivo.organizationId,
        moduleCode,
        pageHref,
        ok: result.success,
      });
    }

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
}
