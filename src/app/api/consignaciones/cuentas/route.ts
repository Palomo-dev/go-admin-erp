/**
 * Cuentas de consignación de la organización (Ronda 2 del Contador, punto 1):
 * 911520 (o su auxiliar), la contrapartida DEFINIDA del grupo 94 (nunca 9905) y
 * el auxiliar de 413512 para la remuneración. Cada una debe existir en el plan de
 * cuentas de la organización y ser de movimiento (`fn_consignacion_configurar_cuentas`).
 * - GET: lo configurado y si el estimatorio está habilitado. Permiso `finance.view`.
 * - POST: definirlas. Permiso `finance.create`.
 */
import { withOrg } from '@/lib/utils/orgContext';
import { cuentasConsignacionSchema } from '@/lib/inventario/consignaciones/recibidas';
import { configurarCuentasConsignacion, leerCuentasConsignacion } from '@/lib/services/consignaciones/recibidas.server';
import { ejecutar } from '@/lib/services/consignaciones/rutasRecibidas.server';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req) =>
  ejecutar(ctx, req, { ruta: 'GET /api/consignaciones/cuentas', permisos: ['finance.view'], esquema: null, accion: () => leerCuentasConsignacion(ctx) }),
);

export const POST = withOrg(async (ctx, req) =>
  ejecutar(ctx, req, {
    ruta: 'POST /api/consignaciones/cuentas',
    permisos: ['finance.create'],
    esquema: cuentasConsignacionSchema,
    accion: (s) => configurarCuentasConsignacion(ctx, s),
  }),
);
