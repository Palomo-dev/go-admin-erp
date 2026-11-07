/**
 * GET /api/notas-credito/[id] — detalle de una nota crédito de venta: el de la
 * factura (líneas, pagos, cartera, asientos, envío DIAN, historial) más la
 * factura de origen, el estado DIAN derivado, concepto, motivo, saldo a favor,
 * devolución y reingreso. Permiso `finance.view`; organización de la sesión.
 */
import { withOrg } from '@/lib/utils/orgContext';
import { manejarDetalleNota } from '@/lib/services/ventas/rutaDetalleNota.server';

export const dynamic = 'force-dynamic';

export const GET = withOrg(manejarDetalleNota('credito', 'GET /api/notas-credito/[id]'));
