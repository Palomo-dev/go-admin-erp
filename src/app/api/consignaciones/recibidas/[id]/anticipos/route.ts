/**
 * Anticipos al consignante cruzados con la obligación real del mandato (Ronda 2
 * del Contador, punto 6). Los anticipos son los de anticipos a proveedores; el
 * cruce es D auxiliar 281510 del dueño / C cuenta del anticipo, hasta el saldo
 * acreedor de ese auxiliar (`fn_consignacion_cruzar_anticipo`). Sin compra ni
 * documento soporte fabricados.
 * - GET: anticipos vigentes del consignante de la nota. Permiso `finance.view`.
 * - POST: cruzar. Permiso `finance.create`.
 */
import { withOrg } from '@/lib/utils/orgContext';
import { cruceAnticipoSchema } from '@/lib/inventario/consignaciones/recibidas';
import { anticiposDelConsignante, cruzarAnticipo, detalleRecibida, respuestaErrorRecibida } from '@/lib/services/consignaciones/recibidas.server';
import { ejecutar, idDeRuta } from '@/lib/services/consignaciones/rutasRecibidas.server';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req, routeParams) => {
  const id = await idDeRuta(routeParams);
  if (!id) return respuestaErrorRecibida('nota_no_encontrada');
  return ejecutar(ctx, req, {
    ruta: 'GET /api/consignaciones/recibidas/[id]/anticipos',
    permisos: ['finance.view'],
    esquema: null,
    accion: async () => {
      const { nota } = await detalleRecibida(ctx, id);
      return nota ? anticiposDelConsignante(ctx, nota.proveedorId) : [];
    },
  });
});

export const POST = withOrg(async (ctx, req, routeParams) => {
  const id = await idDeRuta(routeParams);
  if (!id) return respuestaErrorRecibida('nota_no_encontrada');
  return ejecutar(ctx, req, {
    ruta: 'POST /api/consignaciones/recibidas/[id]/anticipos',
    permisos: ['finance.create'],
    esquema: cruceAnticipoSchema,
    estado: 201,
    accion: (s) => cruzarAnticipo(ctx, id, s),
  });
});
