/**
 * GET /api/consignaciones/recibidas/[id] — una nota recibida: existencias del
 * consignante (recibido, vendido, devuelto, en tu poder), condiciones del
 * contrato, cuentas con las que nació y liquidaciones (Figma R3). RLS por
 * pertenencia y filtro por la organización de la sesión. Permiso `finance.view`.
 */
import { withOrg } from '@/lib/utils/orgContext';
import { detalleRecibida, respuestaErrorRecibida } from '@/lib/services/consignaciones/recibidas.server';
import { ejecutar, idDeRuta } from '@/lib/services/consignaciones/rutasRecibidas.server';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req, routeParams) => {
  const id = await idDeRuta(routeParams);
  if (!id) return respuestaErrorRecibida('nota_no_encontrada');
  return ejecutar(ctx, req, { ruta: 'GET /api/consignaciones/recibidas/[id]', permisos: ['finance.view'], esquema: null, accion: () => detalleRecibida(ctx, id) });
});
