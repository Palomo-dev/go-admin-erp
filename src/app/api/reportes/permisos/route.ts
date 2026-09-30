/**
 * GET /api/reportes/permisos — qué acciones del centro de reportes ofrece la
 * interfaz a la persona de la sesión: exportar y programar (`reports.export`),
 * firmar un cierre (`finance.approve`), reabrirlo (`accounting.reverse`) y
 * administrar (`admin.full_access`: ver los envíos de todos y aprobar correos
 * externos).
 *
 * Solo decide qué botones se muestran: cada ruta vuelve a exigir su permiso.
 */
import { NextResponse } from 'next/server';
import { hasOrgAdminOrPermission, withOrg } from '@/lib/utils/orgContext';
import { SIN_CACHE } from '@/lib/services/compras/rutas.server';
import { respuestaErrorReportes } from '@/lib/services/reportes/rutas.server';
import type { PermisosReportes } from '@/lib/services/reportes/clienteReportes';

export const dynamic = 'force-dynamic';
const RUTA = 'GET /api/reportes/permisos';

export const GET = withOrg(async (ctx) => {
  try {
    const [exportar, firmar, reabrir, admin] = await Promise.all([
      hasOrgAdminOrPermission(ctx, 'reports.export'),
      hasOrgAdminOrPermission(ctx, 'finance.approve'),
      hasOrgAdminOrPermission(ctx, 'accounting.reverse'),
      hasOrgAdminOrPermission(ctx),
    ]);
    const resultado: PermisosReportes = { exportar, firmar, reabrir, admin };
    return NextResponse.json({ resultado }, { headers: SIN_CACHE });
  } catch (err) {
    return respuestaErrorReportes(RUTA, err);
  }
});
