/**
 * Logística Fase 1: el servicio de entregas delega en las RPC logistica_* (una transacción por
 * paso) y crea el envío del pedido web con modo de despacho y contraentrega.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { WebOrder } from '../webOrdersService';

const mockRpc = jest.fn();
const mockFila = { id: 's-1', organization_id: 7, status: 'assigned', delivery_contact_name: 'Ana', cod_amount: 0, delivery_code_required: false };
const mockFrom = jest.fn(() => {
  const c: Record<string, jest.Mock> = {};
  for (const m of ['select', 'eq', 'order', 'limit', 'in']) c[m] = jest.fn().mockReturnThis();
  c.single = jest.fn(async () => ({ data: mockFila, error: null }));
  c.maybeSingle = jest.fn(async () => ({ data: mockFila, error: null }));
  return c;
});
jest.mock('@/lib/supabase/config', () => ({ supabase: { rpc: (...a: unknown[]) => mockRpc(...a), from: () => mockFrom() } }));
jest.mock('../organizationTimezoneService', () => ({ getOrganizationTimezone: jest.fn(async () => 'America/Bogota') }));
jest.spyOn(console, 'warn').mockImplementation(() => {});

import { deliveryIntegrationService, EnvioError } from '../deliveryIntegrationService';

beforeEach(() => {
  mockRpc.mockReset();
  mockRpc.mockResolvedValue({ data: { ok: true, shipment_id: 's-1', status: 'assigned' }, error: null });
});

describe('asignar sin vehículo y sin pisar metadata', () => {
  it('llama logistica_asignar_domiciliario con vehículo null', async () => {
    await deliveryIntegrationService.assignVehicleAndDriver('s-1', null, 'dom-1');
    expect(mockRpc).toHaveBeenCalledWith('logistica_asignar_domiciliario', {
      p_shipment_id: 's-1', p_driver_id: 'dom-1', p_vehicle_id: null, p_fecha_estimada: null,
    });
  });

  it('la fecha estimada se guarda como día de la zona de la organización', async () => {
    // 03:30 UTC del 16 = 22:30 del 15 en Bogotá
    await deliveryIntegrationService.assignVehicleAndDriver('s-1', 'veh-1', 'dom-1', '2026-11-16T03:30:00Z');
    expect(mockRpc.mock.calls[0][1]).toMatchObject({ p_vehicle_id: 'veh-1', p_fecha_estimada: '2026-11-15' });
  });
});

describe('entregar', () => {
  it('traduce la prueba al jsonb de la RPC y pasa código y cobro', async () => {
    mockRpc.mockResolvedValueOnce({ data: { ok: true, shipment_id: 's-1', proof_id: 'p-1', cod_status: 'collected' }, error: null });
    const r = await deliveryIntegrationService.markAsDelivered(
      's-1',
      { recipientName: 'Ana', photoUrls: ['f.jpg'], latitude: 6.2, longitude: -75.5 },
      { codigo: '0420', cobro: { metodo: 'cash', monto: 58900 } },
    );
    expect(r).toEqual({ ok: true, shipmentId: 's-1', proofId: 'p-1', codStatus: 'collected', aviso: 'entregado' });
    const args = mockRpc.mock.calls[0][1];
    expect(mockRpc.mock.calls[0][0]).toBe('logistica_marcar_entregado');
    expect(args.p_prueba).toMatchObject({ nombre: 'Ana', fotos: ['f.jpg'], lat: 6.2, lng: -75.5 });
    expect(args.p_codigo).toBe('0420');
    expect(args.p_cobro).toEqual({ metodo: 'cash', monto: 58900 });
  });

  it('código errado: no lanza, devuelve los intentos que quedan', async () => {
    mockRpc.mockResolvedValueOnce({ data: { ok: false, error: 'CODIGO_INVALIDO', intentos_restantes: 3 }, error: null });
    await expect(deliveryIntegrationService.markAsDelivered('s-1', { recipientName: 'Ana' }, { codigo: '1111' }))
      .resolves.toEqual({ ok: false, error: 'CODIGO_INVALIDO', intentosRestantes: 3 });
  });

  it('los RAISE de la base llegan como EnvioError con su código', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'COBRO_REQUERIDO', code: '22023' } });
    await expect(deliveryIntegrationService.markAsDelivered('s-1', { recipientName: 'Ana' }))
      .rejects.toMatchObject({ name: 'EnvioError', codigo: 'COBRO_REQUERIDO' });
  });
});

describe('recoger, novedad y Mis envíos', () => {
  it('recoger = en camino (out_for_delivery)', async () => {
    await deliveryIntegrationService.markAsPickedUp('s-1', { latitude: 1, longitude: 2 });
    expect(mockRpc).toHaveBeenCalledWith('logistica_cambiar_estado', {
      p_shipment_id: 's-1', p_estado: 'out_for_delivery', p_nota: null, p_lat: 1, p_lng: 2,
    });
  });

  it('novedad con motivo', async () => {
    mockRpc.mockResolvedValueOnce({ data: { ok: true, intento: 2 }, error: null });
    const r = await deliveryIntegrationService.registerFailedAttempt('s-1', { reasonCode: 'not_home', reasonText: 'No abre' });
    expect(r).toEqual({ intento: 2, aviso: 'novedad' });
    expect(mockRpc.mock.calls[0][1]).toMatchObject({ p_motivo: 'not_home', p_detalle: 'No abre' });
  });

  it('Mis envíos: los pasos simples van por logistica_cambiar_estado', async () => {
    await deliveryIntegrationService.updateShipmentStatusByDriver('s-1', 'in_transit', 'dom-1');
    expect(mockRpc.mock.calls[0][0]).toBe('logistica_cambiar_estado');
  });

  it('Mis envíos: «entregado» de una contraentrega exige el flujo con código y cobro', async () => {
    mockFila.cod_amount = 50000;
    mockFila.delivery_code_required = true;
    await expect(deliveryIntegrationService.updateShipmentStatusByDriver('s-1', 'delivered', 'dom-1'))
      .rejects.toBeInstanceOf(EnvioError);
    expect(mockRpc).not.toHaveBeenCalled();
    mockFila.cod_amount = 0;
    mockFila.delivery_code_required = false;
  });
});

describe('POS con domicilio', () => {
  it('manda la entrega a logistica_crear_envio_venta_pos (la base calcula contraentrega y flete)', async () => {
    mockRpc.mockResolvedValueOnce({ data: { ok: true, shipment_id: 's-1' }, error: null });
    await deliveryIntegrationService.createShipmentFromPOSSale({
      saleId: 'venta-1', organizationId: 7, branchId: 3, total: 99999, shippingFee: 4000, itemsCount: 2,
      driverId: 'dom-1', paymentStatus: 'pending',
      deliveryInfo: { address: 'Cra 1 # 2-3', city: 'Medellín', barrio: 'Laureles', municipio_dane: '05001' },
    });
    expect(mockRpc.mock.calls[0][0]).toBe('logistica_crear_envio_venta_pos');
    const args = mockRpc.mock.calls[0][1];
    expect(args.p_sale_id).toBe('venta-1');
    expect(args.p_driver_id).toBe('dom-1');
    expect(args.p_entrega).toMatchObject({ direccion: 'Cra 1 # 2-3', barrio: 'Laureles', municipio_dane: '05001', costo_envio: 4000 });
    // El total del navegador no viaja: la contraentrega sale del saldo de la venta en la base.
    expect(JSON.stringify(args)).not.toContain('99999');
  });
});

describe('crear envío de pedido web', () => {
  function cliente() {
    const inserts: Record<string, unknown[]> = {};
    const from = jest.fn((t: string) => {
      const c: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'order', 'limit']) c[m] = () => c;
      c.maybeSingle = async () => ({ data: null, error: null });
      c.insert = (p: unknown) => {
        (inserts[t] ??= []).push(p);
        return { select: () => ({ single: async () => ({ data: { id: 'nuevo', ...(p as object) }, error: null }) }), then: (r: (v: unknown) => void) => r({ error: null }) };
      };
      return c;
    });
    return { client: { from } as unknown as SupabaseClient, inserts };
  }
  const pedido = (extra: Partial<WebOrder>) => ({
    id: 'wo-1', organization_id: 7, branch_id: 3, order_number: 'WEB-1', delivery_type: 'delivery_own',
    delivery_address: { address: 'Calle 1', neighborhood: 'Laureles' }, total: 58900, delivery_fee: 6000, items: [],
    ...extra,
  }) as unknown as WebOrder;

  it('contraentrega: pedido en efectivo sin pagar → cod_amount = total, modo propio, flete del pedido', async () => {
    const { client, inserts } = cliente();
    await deliveryIntegrationService.createShipmentFromWebOrder(pedido({ payment_status: 'pending', payment_method: 'cash' }), { client });
    expect(inserts.shipments[0]).toMatchObject({
      fulfillment_mode: 'own', cod_amount: 58900, cod_status: 'pending', payment_status: 'cod', shipping_fee: 6000,
    });
    expect(inserts.transport_events[0]).toMatchObject({ event_type: 'created', canonical_status: 'created' });
  });

  it('pagado por pasarela → sin contraentrega; domicilio de tercero → transportadora', async () => {
    const { client, inserts } = cliente();
    await deliveryIntegrationService.createShipmentFromWebOrder(
      pedido({ payment_status: 'paid', payment_method: 'wompi', delivery_type: 'delivery_third_party' }), { client },
    );
    expect(inserts.shipments[0]).toMatchObject({ fulfillment_mode: 'national_carrier', cod_amount: 0, cod_status: null, payment_status: 'paid' });
  });
});
