/**
 * Reglas de retención de las consignaciones (Ronda 3 del Contador, punto 2): qué
 * regla CONFIGURADA de la organización (organization_taxes, la misma de compras)
 * aplica a las retenciones de la operación y a las de la remuneración, por clase.
 * Sin regla elegida, la liquidación deja la retención pendiente, nunca en 0.
 * - GET: lo elegido y las reglas activas disponibles. Permiso `finance.view`.
 * - POST: elegir (`fn_consignacion_configurar_retenciones`). Permiso `finance.create`.
 */
import { withOrg } from '@/lib/utils/orgContext';
import { retencionesConsignacionSchema } from '@/lib/inventario/consignaciones/recibidas';
import { configurarRetencionesConsignacion, leerRetencionesConsignacion } from '@/lib/services/consignaciones/recibidas.server';
import { ejecutar } from '@/lib/services/consignaciones/rutasRecibidas.server';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req) =>
  ejecutar(ctx, req, { ruta: 'GET /api/consignaciones/retenciones', permisos: ['finance.view'], esquema: null, accion: () => leerRetencionesConsignacion(ctx) }),
);

export const POST = withOrg(async (ctx, req) =>
  ejecutar(ctx, req, {
    ruta: 'POST /api/consignaciones/retenciones',
    permisos: ['finance.create'],
    esquema: retencionesConsignacionSchema,
    accion: (s) => configurarRetencionesConsignacion(ctx, s),
  }),
);
