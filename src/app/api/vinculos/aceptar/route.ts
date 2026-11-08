/**
 * POST /api/vinculos/aceptar — acepta una invitación en nombre de la
 * organización de la SESIÓN (regla 5: la organización nunca sale del body; si el
 * cuerpo trae otra, 403 y se registra). Exige ser administrador (lo resuelve la
 * base, `fn_vinculo_es_admin`) y amarrar el vínculo a un tercero propio.
 */
import { withOrg } from '@/lib/utils/orgContext';
import { aceptarVinculoSchema } from '@/lib/inventario/consignaciones/recibidas';
import { aceptarVinculo, respuestaErrorRecibida } from '@/lib/services/consignaciones/recibidas.server';
import { ejecutar } from '@/lib/services/consignaciones/rutasRecibidas.server';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, req) => {
  const copia = req.clone();
  const cuerpo = (await copia.json().catch(() => null)) as { organizacion_id?: unknown } | null;
  if (cuerpo && cuerpo.organizacion_id != null && cuerpo.organizacion_id !== ctx.organizationId) {
    console.warn('[vinculos/aceptar] organización del cuerpo distinta de la sesión → 403', { organizationId: ctx.organizationId, userId: ctx.userId });
    return respuestaErrorRecibida('organizacion_no_permitida');
  }
  return ejecutar(ctx, req, {
    ruta: 'POST /api/vinculos/aceptar',
    permisos: ['finance.view', 'finance.create'],
    esquema: aceptarVinculoSchema,
    accion: (s) => aceptarVinculo(ctx, s.token, ctx.organizationId, s.proveedor_id ?? null, s.cliente_id ?? null),
  });
});
