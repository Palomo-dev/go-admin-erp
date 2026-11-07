/**
 * GET /api/notas-debito/[id] — detalle de una nota débito de venta (su propia
 * cuenta por cobrar, pagos, asiento y envío DIAN) con su factura de origen.
 * Permiso `finance.view`; organización de la sesión.
 */
import { withOrg } from '@/lib/utils/orgContext';
import { manejarDetalleNota } from '@/lib/services/ventas/rutaDetalleNota.server';

export const dynamic = 'force-dynamic';

export const GET = withOrg(manejarDetalleNota('debito', 'GET /api/notas-debito/[id]'));
