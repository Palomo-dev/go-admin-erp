// ============================================================================
// L3 · Qué se puede hacer con una factura de compra según su estado.
//
// Regla (plan §3.4, `accionesPermitidas`): se edita y se elimina solo en
// borrador; se confirma un borrador; se recepciona una confirmada que no ha
// entrado al inventario; se paga una confirmada con saldo; se anula lo que no
// está anulado ni tiene pagos.
//
// El bloque «HOY» fija el comportamiento del servicio viejo que se sustituye:
// `recepcionarInventario` dejaba recepcionar una `partial` (el stock podía
// entrar dos veces). Se invierte en el paso que lo retira (F5).
// ============================================================================

jest.mock('@/lib/services/timezoneResolver', () => ({ resolveTimezone: async () => 'America/Bogota' }));
jest.mock('@/lib/hooks/useOrganization', () => ({
  getOrganizationId: () => 120,
  getCurrentBranchId: () => 7,
  getCurrentUserId: async () => 'u-1',
}));
jest.mock('@/lib/services/monedaOrganizacion', () => ({ resolveOrgCurrency: async () => ({ code: 'COP' }) }));

const incrementOnPurchase = jest.fn(async () => ({ success: true, skipped: 0, skippedItems: [], errors: [] }));
jest.mock('@/lib/services/stockMovementService', () => ({
  stockMovementService: { incrementOnPurchase: (...a: unknown[]) => incrementOnPurchase(...(a as [])) },
  describeSkippedItems: () => '',
}));
jest.mock('@/lib/services/serialTrackingService', () => ({ serialTrackingService: {} }));

import { DobleCompras } from './dobleCompras';

let doble = new DobleCompras();
jest.mock('@/lib/supabase/config', () => ({
  get supabase() {
    return doble;
  },
}));

import { accionesPermitidas, estadoRecepcion, estadoPagoCompra } from '@/lib/services/compras/logica';
import { FacturasCompraService } from '@/components/finanzas/facturas-compra/FacturasCompraService';

describe('accionesPermitidas (regla nueva)', () => {
  test('borrador: editar, eliminar y confirmar; nada de pagar ni recepcionar', () => {
    expect(accionesPermitidas({ estado: 'draft', recepcion: 'por_recibir', saldo: 100, tienePagos: false })).toEqual({
      editar: true,
      eliminar: true,
      confirmar: true,
      recepcionar: false,
      registrarPago: false,
      anular: true,
    });
  });

  test('confirmada sin recepción y con saldo: recepcionar, pagar y anular', () => {
    expect(accionesPermitidas({ estado: 'received', recepcion: 'por_recibir', saldo: 100, tienePagos: false })).toEqual({
      editar: false,
      eliminar: false,
      confirmar: false,
      recepcionar: true,
      registrarPago: true,
      anular: true,
    });
  });

  test('confirmada y recibida con pagos: solo pagar lo que falta; no se anula', () => {
    const a = accionesPermitidas({ estado: 'partial', recepcion: 'recibido', saldo: 20, tienePagos: true });
    expect(a).toMatchObject({ recepcionar: false, registrarPago: true, anular: false, editar: false });
  });

  test('pagada: nada que pagar', () => {
    expect(accionesPermitidas({ estado: 'received', recepcion: 'recibido', saldo: 0, tienePagos: true }).registrarPago).toBe(false);
  });

  test('anulada: ninguna acción', () => {
    expect(Object.values(accionesPermitidas({ estado: 'void', recepcion: 'no_aplica', saldo: 0, tienePagos: false })).some(Boolean)).toBe(
      false,
    );
  });

  test('recepción y pago derivados', () => {
    expect(estadoRecepcion({ stock_received_at: '2026-09-24T10:00:00Z', lineasConProducto: 2 })).toBe('recibido');
    expect(estadoRecepcion({ stock_received_at: null, lineasConProducto: 0 })).toBe('no_aplica');
    expect(estadoRecepcion({ stock_received_at: null, lineasConProducto: 1 })).toBe('por_recibir');
    expect(estadoPagoCompra('received', 100, 100)).toBe('pendiente');
    expect(estadoPagoCompra('received', 100, 40)).toBe('parcial');
    expect(estadoPagoCompra('partial', 100, 0)).toBe('pagada');
    expect(estadoPagoCompra('void', 100, 0)).toBe('anulada');
  });
});

describe('HOY: el servicio viejo', () => {
  beforeEach(() => incrementOnPurchase.mockClear());

  test('solo edita draft/pending', async () => {
    doble = new DobleCompras({ invoice_purchase: [{ data: { id: 'f', status: 'received', branch_id: 7 }, error: null }] });
    await expect(
      FacturasCompraService.actualizarFactura('f', { items: [] } as unknown as Parameters<typeof FacturasCompraService.actualizarFactura>[1]),
    ).rejects.toThrow(/No se puede editar/);
  });

  test('solo elimina draft', async () => {
    doble = new DobleCompras({ invoice_purchase: [{ data: { status: 'received' }, error: null }] });
    await expect(FacturasCompraService.eliminarFactura('f')).rejects.toThrow(/borrador/);
  });

  test('HOY (bug): recepcionar una `partial` vuelve a meter el stock', async () => {
    doble = new DobleCompras({
      invoice_purchase: [
        {
          data: {
            id: 'f',
            status: 'partial',
            branch_id: 7,
            organization_id: 120,
            number_ext: 'X',
            items: [{ id: 'l1', product_id: 9, description: 'P', qty: 2, unit_price: 10 }],
          },
          error: null,
        },
      ],
    });
    const r = await FacturasCompraService.recepcionarInventario('f');
    expect(r.success).toBe(true);
    expect(incrementOnPurchase).toHaveBeenCalledTimes(1);
  });

  test('una `received` no se recepciona dos veces', async () => {
    doble = new DobleCompras({ invoice_purchase: [{ data: { id: 'f', status: 'received', branch_id: 7, items: [] }, error: null }] });
    const r = await FacturasCompraService.recepcionarInventario('f');
    expect(r.success).toBe(false);
    expect(incrementOnPurchase).not.toHaveBeenCalled();
  });
});
