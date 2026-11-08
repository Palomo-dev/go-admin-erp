/**
 * POST /api/consignaciones/por-aceptar/[id]/aceptar
 * - Nota por aceptar (R2): crea TU nota recibida con tus funciones
 *   (`fn_consignacion_recibida_aceptar`); cada producto del consignante se enlaza
 *   con uno tuyo de consignación.
 * - Liquidación o devolución que te llegó (R8): «Aceptar y facturar» es el MISMO
 *   flujo de la entregada (`liquidarConsignacion`: liquidar + factura de venta +
 *   cerrar).
 * Permiso `finance.create`.
 */
import { withOrg } from '@/lib/utils/orgContext';
import { aceptarNotaSchema, claveSchema } from '@/lib/inventario/consignaciones/recibidas';
import { aceptarDocumentoRecibido, aceptarNota, documentoPorAceptar, ErrorRecibidaServidor, respuestaErrorRecibida } from '@/lib/services/consignaciones/recibidas.server';
import { ejecutar, idDeRuta } from '@/lib/services/consignaciones/rutasRecibidas.server';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, req, routeParams) => {
  const id = await idDeRuta(routeParams);
  if (!id) return respuestaErrorRecibida('documento_no_encontrado');
  const esNota = new URL(req.url).searchParams.get('tipo') !== 'liquidacion';
  if (esNota) {
    return ejecutar(ctx, req, {
      ruta: 'POST /api/consignaciones/por-aceptar/[id]/aceptar',
      permisos: ['finance.create'],
      esquema: aceptarNotaSchema,
      estado: 201,
      accion: (s) => aceptarNota(ctx, id, s),
    });
  }
  return ejecutar(ctx, req, {
    ruta: 'POST /api/consignaciones/por-aceptar/[id]/aceptar?tipo=liquidacion',
    permisos: ['finance.create'],
    esquema: claveSchema,
    accion: async () => {
      const doc = await documentoPorAceptar(ctx, id);
      if (doc.tipo === 'consignacion_nota') throw new ErrorRecibidaServidor('documento_no_disponible');
      return aceptarDocumentoRecibido(ctx, id);
    },
  });
});
