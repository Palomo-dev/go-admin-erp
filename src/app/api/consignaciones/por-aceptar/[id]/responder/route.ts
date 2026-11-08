/**
 * POST /api/consignaciones/por-aceptar/[id]/responder — rechazar con motivo un
 * documento que te llegó, o anular uno que enviaste mientras siga «enviado»
 * (`fn_documento_compartido_responder`). Solo cambia el estado del documento
 * compartido; no toca filas de ninguna de las dos organizaciones. Permiso
 * `finance.create`.
 */
import { withOrg } from '@/lib/utils/orgContext';
import { responderDocumentoSchema } from '@/lib/inventario/consignaciones/recibidas';
import { responderDocumento, respuestaErrorRecibida } from '@/lib/services/consignaciones/recibidas.server';
import { ejecutar, idDeRuta } from '@/lib/services/consignaciones/rutasRecibidas.server';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, req, routeParams) => {
  const id = await idDeRuta(routeParams);
  if (!id) return respuestaErrorRecibida('documento_no_encontrado');
  return ejecutar(ctx, req, {
    ruta: 'POST /api/consignaciones/por-aceptar/[id]/responder',
    permisos: ['finance.create'],
    esquema: responderDocumentoSchema,
    accion: (s) => responderDocumento(ctx, id, s.accion, s.motivo),
  });
});
