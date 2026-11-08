/**
 * POST /api/consignaciones/recibidas/[id]/novedad — faltante o daño de mercancía
 * en consignación (Ronda 2 del Contador, punto 7). Registra la evidencia, el
 * responsable y la obligación; saca la mercancía del control físico y de las
 * cuentas de orden. NO genera gasto ni cuenta por pagar: deja un pendiente
 * contable para acreditar la pérdida (`fn_consignacion_registrar_novedad`).
 * Permiso `finance.create` (y en la base, inventario «ajustar»).
 */
import { withOrg } from '@/lib/utils/orgContext';
import { novedadSchema } from '@/lib/inventario/consignaciones/recibidas';
import { registrarNovedad, respuestaErrorRecibida } from '@/lib/services/consignaciones/recibidas.server';
import { ejecutar, idDeRuta } from '@/lib/services/consignaciones/rutasRecibidas.server';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, req, routeParams) => {
  const id = await idDeRuta(routeParams);
  if (!id) return respuestaErrorRecibida('nota_no_encontrada');
  return ejecutar(ctx, req, {
    ruta: 'POST /api/consignaciones/recibidas/[id]/novedad',
    permisos: ['finance.create'],
    esquema: novedadSchema,
    estado: 201,
    accion: (s) => registrarNovedad(ctx, id, s),
  });
});
