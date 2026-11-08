/**
 * GET /api/consignaciones/por-aceptar/[id] — un documento que llegó de otra
 * organización vinculada (nota por aceptar, Figma R2; o liquidación/devolución
 * del consignatario, Figma R8). Es la COPIA que armó el emisor: nunca se leen
 * tablas de la otra organización. Para una liquidación, trae además la
 * comparación con tu nota (`fn_consignacion_documento_recibido_preparar`).
 * Permiso `finance.view`.
 */
import { withOrg } from '@/lib/utils/orgContext';
import { documentoPorAceptar, prepararDocumentoRecibido, respuestaErrorRecibida } from '@/lib/services/consignaciones/recibidas.server';
import { ejecutar, idDeRuta } from '@/lib/services/consignaciones/rutasRecibidas.server';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req, routeParams) => {
  const id = await idDeRuta(routeParams);
  if (!id) return respuestaErrorRecibida('documento_no_encontrado');
  return ejecutar(ctx, req, {
    ruta: 'GET /api/consignaciones/por-aceptar/[id]',
    permisos: ['finance.view'],
    esquema: null,
    accion: async () => {
      const documento = await documentoPorAceptar(ctx, id);
      const comparacion = documento.tipo === 'consignacion_nota' || documento.estado !== 'enviado' ? null : await prepararDocumentoRecibido(ctx, id);
      return { documento, comparacion };
    },
  });
});
