/**
 * GET /api/cuentas-por-pagar/contexto-pago?documento=invoice_purchase|account_payable&id=<uuid>
 *
 * Contexto del diálogo único de pago (`ContextoPago`, mismo contrato que
 * `/api/pagos/contexto`) para PAGAR a un proveedor: la cuenta por pagar abierta
 * con sus cuotas, métodos, cuentas bancarias, caja abierta y el día de hoy en la
 * zona de la sucursal. El pago se registra después con `POST /api/pagos`
 * (dirección `pago`, origen `factura_compra` o `cxp`).
 *
 * Permiso `finance.view`. Lecturas con RLS y filtro por la organización de la sesión.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody, OrgContextError } from '@/lib/utils/orgContext';
import { contextoPagoProveedor } from '@/lib/services/compras/contextoPagoProveedor.server';
import { SIN_CACHE, exigirPermisos, respuestaError } from '@/lib/services/compras/rutas.server';

export const dynamic = 'force-dynamic';
const RUTA = 'GET /api/cuentas-por-pagar/contexto-pago';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const GET = withOrg(async (ctx, req) => {
  try {
    await readOrgBody(ctx, req, { route: RUTA });
    const url = new URL(req.url);
    const documento = url.searchParams.get('documento');
    const id = url.searchParams.get('id') ?? '';
    if ((documento !== 'invoice_purchase' && documento !== 'account_payable') || !UUID_RE.test(id)) {
      throw new OrgContextError('Parámetros inválidos', 400, 'datos_invalidos');
    }
    await exigirPermisos(ctx, ['finance.view'], RUTA);
    const contexto = await contextoPagoProveedor(ctx, { documento, id });
    return NextResponse.json(contexto, { headers: SIN_CACHE });
  } catch (err) {
    return respuestaError(RUTA, err);
  }
});
