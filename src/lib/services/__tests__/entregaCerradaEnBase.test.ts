/**
 * Entrega cerrada en la base (decisiones del dueño 2026-11-25, migración 20261125185658):
 * - «Cobrar y entregar» con envío activo va por UNA RPC (`logistica_entregar_y_cobrar_en_caja`)
 *   con la misma prueba que «Marcar entregado».
 * - Los rechazos de la base llegan con su código (SIN_PERMISO_ENTREGA no se confunde con SIN_PERMISO).
 * - Los caminos viejos de Transporte (manifiestos, prueba suelta) ya no escriben `shipments` ni
 *   `proof_of_delivery` directo: pasan por `logistica_marcar_entregado`.
 */
const mockRpc = jest.fn();
const mockUpdates: { tabla: string; valores: unknown }[] = [];
const mockInserts: { tabla: string; valores: unknown }[] = [];
const mockFrom = jest.fn((tabla: string) => {
  const c: Record<string, jest.Mock> = {};
  for (const m of ['select', 'eq', 'order', 'limit', 'in', 'neq']) c[m] = jest.fn().mockReturnValue(c);
  c.update = jest.fn((valores: unknown) => {
    mockUpdates.push({ tabla, valores });
    return c;
  });
  c.insert = jest.fn((valores: unknown) => {
    mockInserts.push({ tabla, valores });
    return c;
  });
  c.single = jest.fn(async () => ({ data: { id: 'x', organization_id: 7 }, error: null }));
  c.maybeSingle = jest.fn(async () => ({ data: { id: 'pod-1', shipment_id: 's-1' }, error: null }));
  c.then = jest.fn((resolve: (v: unknown) => unknown) => resolve({ data: [], error: null }));
  return c;
});
jest.mock('@/lib/supabase/config', () => ({
  supabase: { rpc: (...a: unknown[]) => mockRpc(...a), from: (t: string) => mockFrom(t) },
}));
jest.mock('../organizationTimezoneService', () => ({ getOrganizationTimezone: jest.fn(async () => 'America/Bogota') }));
jest.spyOn(console, 'warn').mockImplementation(() => {});
jest.spyOn(console, 'error').mockImplementation(() => {});

import { deliveryIntegrationService, EnvioError } from '../deliveryIntegrationService';
import { manifestsService } from '../manifestsService';
import { shipmentsService } from '../shipmentsService';
import { montoCobrarYEntregar, accionMarcarEntregado } from '@/lib/pos/pedidosWeb/entregaEnvio';

beforeEach(() => {
  mockRpc.mockReset();
  mockUpdates.length = 0;
  mockInserts.length = 0;
});

describe('«Cobrar y entregar» con envío activo: una sola RPC', () => {
  it('manda la misma prueba que «Marcar entregado», el código, el medio, la referencia y la factura', async () => {
    mockRpc.mockResolvedValueOnce({
      data: {
        ok: true, shipment_id: 's-1', proof_id: 'p-1', cod_status: 'remitted', aviso: 'entregado', via: 'oficina',
        cobrado_en_caja: true, cobro: { invoice_number: 'FACT-9', cash_session_id: 66, ya_cobrado: false },
      },
      error: null,
    });
    const r = await deliveryIntegrationService.entregarYCobrarEnCaja(
      's-1',
      { recipientName: 'Ana', recipientRelationship: 'titular' },
      { codigo: '7432', metodo: 'transfer', referencia: '  REF-1 ', factura: { number: 'FACT-9' } },
    );
    expect(mockRpc).toHaveBeenCalledWith('logistica_entregar_y_cobrar_en_caja', {
      p_shipment_id: 's-1',
      p_prueba: expect.objectContaining({ nombre: 'Ana', relacion: 'titular', fotos: [] }),
      p_codigo: '7432',
      p_metodo: 'transfer',
      p_referencia: 'REF-1',
      p_factura: { number: 'FACT-9' },
    });
    expect(r).toEqual({
      ok: true, shipmentId: 's-1', proofId: 'p-1', codStatus: 'remitted', aviso: 'entregado',
      cobradoEnCaja: true, invoiceNumber: 'FACT-9', cashSessionId: 66, yaCobrado: false,
    });
  });

  it('código errado: no cobra ni lanza, devuelve los intentos que quedan', async () => {
    mockRpc.mockResolvedValueOnce({ data: { ok: false, error: 'CODIGO_INVALIDO', intentos_restantes: 3 }, error: null });
    await expect(
      deliveryIntegrationService.entregarYCobrarEnCaja('s-1', { recipientName: 'Ana' }, { codigo: '0000', metodo: 'cash' }),
    ).resolves.toEqual({ ok: false, error: 'CODIGO_INVALIDO', intentosRestantes: 3 });
  });

  it.each([
    ['SIN_PERMISO_ENTREGA', 'SIN_PERMISO_ENTREGA'],
    ['NO_OPEN_CASH_SESSION', 'NO_OPEN_CASH_SESSION'],
    ['PEDIDO_CON_ENVIO_ACTIVO', 'PEDIDO_CON_ENVIO_ACTIVO'],
    ['ENTREGA_SOLO_POR_REGISTRO', 'ENTREGA_SOLO_POR_REGISTRO'],
    ['SIN_PERMISO', 'SIN_PERMISO'],
  ])('el RAISE %s llega como EnvioError(%s)', async (raise, codigo) => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: raise, code: '42501' } });
    const e = await deliveryIntegrationService
      .entregarYCobrarEnCaja('s-1', { recipientName: 'Ana' }, { metodo: 'cash' })
      .catch((x: unknown) => x);
    expect(e).toBeInstanceOf(EnvioError);
    expect((e as EnvioError).codigo).toBe(codigo);
  });
});

describe('Transporte deja de escribir la entrega directo', () => {
  it('manifiesto: entrega por logistica_marcar_entregado, sin UPDATE a shipments ni prueba suelta', async () => {
    mockRpc.mockResolvedValueOnce({ data: { ok: true, shipment_id: 's-1', proof_id: 'p-1', cod_status: null }, error: null });
    mockRpc.mockResolvedValue({ data: null, error: null });
    await manifestsService.markShipmentDelivered('m-1', 's-1', { recipient_name: 'Ana', notes: 'portería' }).catch(() => undefined);
    expect(mockRpc.mock.calls[0][0]).toBe('logistica_marcar_entregado');
    expect(mockRpc.mock.calls[0][1]).toMatchObject({ p_shipment_id: 's-1', p_prueba: expect.objectContaining({ nombre: 'Ana', notas: 'portería' }) });
    expect(mockUpdates.filter((u) => u.tabla === 'shipments')).toEqual([]);
    expect(mockInserts.filter((u) => u.tabla === 'proof_of_delivery')).toEqual([]);
  });

  it('manifiesto: si la base rechaza (p. ej. sin permiso), la línea del manifiesto no se marca', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'SIN_PERMISO_ENTREGA', code: '42501' } });
    await expect(manifestsService.markShipmentDelivered('m-1', 's-1', { recipient_name: 'Ana' })).rejects.toMatchObject({ codigo: 'SIN_PERMISO_ENTREGA' });
    expect(mockUpdates.filter((u) => u.tabla === 'manifest_shipments')).toEqual([]);
  });

  it('prueba de entrega de Envíos: va por la RPC, no inserta en proof_of_delivery', async () => {
    mockRpc.mockResolvedValueOnce({ data: { ok: true, shipment_id: 's-1', proof_id: 'p-1', cod_status: null }, error: null });
    await shipmentsService.createProofOfDelivery('s-1', { recipient_name: 'Ana', photo_urls: ['a.jpg'], delivery_location_type: 'door' });
    expect(mockRpc).toHaveBeenCalledWith('logistica_marcar_entregado', expect.objectContaining({
      p_shipment_id: 's-1',
      p_prueba: expect.objectContaining({ nombre: 'Ana', fotos: ['a.jpg'], tipo_lugar: 'door' }),
    }));
    expect(mockInserts.filter((u) => u.tabla === 'proof_of_delivery')).toEqual([]);
    expect(mockUpdates.filter((u) => u.tabla === 'shipments')).toEqual([]);
  });
});

describe('qué hace «Cobrar y entregar» del pedido', () => {
  it('con envío activo y entregable abre Logística; sin envío, el cobro de siempre; sin salir, bloqueado', () => {
    expect(accionMarcarEntregado('out_for_delivery')).toBe('logistica');
    expect(accionMarcarEntregado(null)).toBe('pedido');
    expect(accionMarcarEntregado('delivered')).toBe('pedido');
    expect(accionMarcarEntregado('pending')).toBe('bloqueado');
  });

  it('anuncia la contraentrega del envío; sin ella, el saldo del pedido menos el anticipo pagado', () => {
    const pedido = { total: 270700, payment_status: 'partial', payment_method: 'cash', advance_amount: 20000, advance_status: 'paid' };
    expect(montoCobrarYEntregar(pedido, { cod_amount: 250700, cod_status: 'pending' })).toBe(250700);
    expect(montoCobrarYEntregar(pedido, { cod_amount: 0, cod_status: null })).toBe(250700);
    expect(montoCobrarYEntregar({ ...pedido, payment_status: 'paid' }, null)).toBe(0);
  });
});
