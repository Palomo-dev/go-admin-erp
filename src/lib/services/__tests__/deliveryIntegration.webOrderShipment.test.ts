/**
 * Fase 0.5 (GO-1) — createShipmentFromWebOrder es la ÚNICA ruta de creación del envío
 * de un pedido web. Antes había dos (confirmación manual y auto-confirmación por pago)
 * con campos y formatos de guía distintos, y ninguna creaba shipment_items.
 *
 * Estos tests fijan el contrato para que GO-4 (asignar transportadora y generar guía)
 * sólo tenga que tocar un sitio.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { WebOrder, WebOrderItem } from '../webOrdersService';

jest.mock('@/lib/supabase/config', () => ({ supabase: { from: jest.fn() } }));
jest.mock('../organizationTimezoneService', () => ({
  getOrganizationTimezone: jest.fn(async () => 'America/Bogota'),
}));

jest.spyOn(console, 'warn').mockImplementation(() => {});
jest.spyOn(console, 'error').mockImplementation(() => {});

import { deliveryIntegrationService } from '../deliveryIntegrationService';

// ── Cliente falso que graba los inserts y responde según una cola por tabla ──

type Respuesta = { data: unknown; error: { code?: string; message?: string } | null };

function makeFakeClient(colas: Record<string, Respuesta[]> = {}) {
  const inserts: Record<string, unknown[]> = {};
  const from = jest.fn((table: string) => {
    let insertado: unknown = null;
    const terminal = (): Respuesta =>
      colas[table]?.shift() ?? { data: insertado ? { id: 'nuevo', ...(insertado as object) } : null, error: null };

    const c: Record<string, jest.Mock> = {};
    for (const m of ['select', 'eq', 'order', 'limit', 'in', 'update']) c[m] = jest.fn().mockReturnThis();
    c.insert = jest.fn((payload: unknown) => {
      insertado = payload;
      (inserts[table] ??= []).push(payload);
      // insert().select().single() → select y single; insert() a secas → thenable
      const chain: Record<string, unknown> = {
        select: () => ({ single: async () => terminal() }),
        then: (resolve: (v: Respuesta) => void) => resolve(terminal()),
      };
      return chain;
    });
    c.maybeSingle = jest.fn(async () => terminal());
    c.single = jest.fn(async () => terminal());
    return c;
  });
  return { client: { from } as unknown as SupabaseClient, inserts, from };
}

function pedido(extra: Partial<WebOrder> = {}): WebOrder {
  const items: WebOrderItem[] = [
    {
      id: 'it-1', web_order_id: 'wo-1', product_id: 10, product_name: 'Silla', product_sku: 'SKU-10',
      quantity: 2, unit_price: 50000, tax_amount: 0, discount_amount: 0, total: 100000,
      status: 'pending', created_at: '2026-09-15T00:00:00Z',
    },
  ];
  return {
    id: 'wo-1',
    organization_id: 113,
    branch_id: 5,
    order_number: 'WEB-0001',
    customer_id: 'cust-del-pedido',
    customer_name: 'Cliente',
    customer_phone: '3000000000',
    delivery_type: 'delivery_own',
    delivery_partner: undefined,
    delivery_address: {
      address: 'Calle 1', city: 'Medellín', department: 'Antioquia',
      country: 'CO', state_code: 'ANT', instructions: 'Timbre 2',
    },
    total: 100000,
    items,
    ...extra,
  } as unknown as WebOrder;
}

describe('createShipmentFromWebOrder — una sola ruta', () => {
  it('inserta el superconjunto de campos de las dos rutas anteriores', async () => {
    const { client, inserts } = makeFakeClient();
    await deliveryIntegrationService.createShipmentFromWebOrder(
      pedido({ estimated_delivery_at: '2026-09-16T15:00:00Z', delivery_partner: 'servientrega' }),
      { client, timezone: 'America/Bogota' }
    );

    const s = inserts.shipments[0] as Record<string, unknown> & { metadata: Record<string, unknown> };
    // De la ruta manual: fecha estimada
    expect(s.expected_delivery_date).toBe('2026-09-16');
    // De la ruta automática: país en instrucciones y metadata de entrega
    expect(s.delivery_instructions).toBe('Timbre 2 | País: CO (ANT)');
    expect(s.metadata).toMatchObject({
      delivery_type: 'delivery_own',
      delivery_partner: 'servientrega',
      delivery_country: 'CO',
      delivery_state_code: 'ANT',
      items_count: 1,
    });
    // Comunes
    expect(s.source_type).toBe('web_order');
    expect(s.source_id).toBe('wo-1');
    expect(s.shipment_number).toBe('DEL-WEB-0001');
    expect(s.status).toBe('pending');
    expect(s.tracking_number).toMatch(/^TRK[0-9A-Z]+$/);
  });

  it('crea los shipment_items a partir de las líneas del pedido', async () => {
    const { client, inserts } = makeFakeClient();
    await deliveryIntegrationService.createShipmentFromWebOrder(pedido(), { client });

    expect(inserts.shipment_items).toHaveLength(1);
    const filas = inserts.shipment_items[0] as Array<Record<string, unknown>>;
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({
      shipment_id: 'nuevo',
      description: 'Silla',
      qty: 2,
      unit_value: 50000,
      total_value: 100000,
      product_id: 10,
      sku: 'SKU-10',
    });
  });

  it('registra el evento de creación en transport_events', async () => {
    const { client, inserts } = makeFakeClient();
    await deliveryIntegrationService.createShipmentFromWebOrder(pedido(), { client });

    const ev = inserts.transport_events[0] as Record<string, unknown>;
    expect(ev).toMatchObject({
      reference_type: 'shipment',
      reference_id: 'nuevo',
      event_type: 'created',
      actor_type: 'system',
      source: 'internal',
    });
  });

  it('usa el customerId inyectado (la auto-confirmación lo resuelve aparte) y, si no, el del pedido', async () => {
    const a = makeFakeClient();
    await deliveryIntegrationService.createShipmentFromWebOrder(pedido(), { client: a.client, customerId: 'cust-resuelto' });
    expect((a.inserts.shipments[0] as Record<string, unknown>).customer_id).toBe('cust-resuelto');

    const b = makeFakeClient();
    await deliveryIntegrationService.createShipmentFromWebOrder(pedido(), { client: b.client });
    expect((b.inserts.shipments[0] as Record<string, unknown>).customer_id).toBe('cust-del-pedido');
  });

  it('es idempotente: si el envío ya existe lo devuelve sin insertar', async () => {
    const { client, inserts } = makeFakeClient({
      shipments: [{ data: { id: 'ya-existia', source_id: 'wo-1' }, error: null }],
    });
    const r = await deliveryIntegrationService.createShipmentFromWebOrder(pedido(), { client });

    expect(r.id).toBe('ya-existia');
    expect(inserts.shipments).toBeUndefined();
    expect(inserts.shipment_items).toBeUndefined();
  });

  it('ante la carrera (23505 del índice único) devuelve el envío que ganó, sin lanzar', async () => {
    const { client, inserts } = makeFakeClient({
      shipments: [
        { data: null, error: null },                                  // 1ª consulta: no existe
        { data: null, error: { code: '23505', message: 'duplicate' } }, // insert: perdió la carrera
        { data: { id: 'gano-el-otro' }, error: null },                // re-consulta: el ganador
      ],
    });
    const r = await deliveryIntegrationService.createShipmentFromWebOrder(pedido(), { client });

    expect(r.id).toBe('gano-el-otro');
    // No se crean items ni evento para un envío que no creamos nosotros
    expect(inserts.shipment_items).toBeUndefined();
    expect(inserts.transport_events).toBeUndefined();
  });

  it('otros errores del insert sí se propagan', async () => {
    const { client } = makeFakeClient({
      shipments: [
        { data: null, error: null },
        { data: null, error: { code: '42501', message: 'permission denied' } },
      ],
    });
    await expect(
      deliveryIntegrationService.createShipmentFromWebOrder(pedido(), { client })
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('rechaza pedidos que no son a domicilio', async () => {
    const { client, inserts } = makeFakeClient();
    await expect(
      deliveryIntegrationService.createShipmentFromWebOrder(pedido({ delivery_type: 'pickup' } as Partial<WebOrder>), { client })
    ).rejects.toThrow(/delivery/);
    expect(inserts.shipments).toBeUndefined();
  });

  it('la fecha estimada es el día calendario en la zona de la organización, no el día UTC', async () => {
    // 03:30 UTC del día 16 son las 22:30 del día 15 en Bogotá.
    const { client, inserts } = makeFakeClient();
    await deliveryIntegrationService.createShipmentFromWebOrder(
      pedido({ estimated_delivery_at: '2026-09-16T03:30:00Z' }),
      { client, timezone: 'America/Bogota' }
    );
    expect((inserts.shipments[0] as Record<string, unknown>).expected_delivery_date).toBe('2026-09-15');
  });

  it('sin fecha estimada, expected_delivery_date queda en null', async () => {
    const { client, inserts } = makeFakeClient();
    await deliveryIntegrationService.createShipmentFromWebOrder(pedido({ estimated_delivery_at: undefined }), { client });
    expect((inserts.shipments[0] as Record<string, unknown>).expected_delivery_date).toBeNull();
  });
});

describe('getShipmentByWebOrderId', () => {
  it('devuelve null con cero filas y no lanza con más de una (toma la más reciente)', async () => {
    const vacio = makeFakeClient({ shipments: [{ data: null, error: null }] });
    expect(await deliveryIntegrationService.getShipmentByWebOrderId('wo-x', vacio.client)).toBeNull();

    const conFila = makeFakeClient({ shipments: [{ data: { id: 'reciente' }, error: null }] });
    const r = await deliveryIntegrationService.getShipmentByWebOrderId('wo-x', conFila.client);
    expect(r?.id).toBe('reciente');
    // Se pide ordenado y limitado a una: es lo que evita el fallo de .single() con duplicados
    const c = conFila.from.mock.results[0].value;
    expect(c.order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(c.limit).toHaveBeenCalledWith(1);
    expect(c.maybeSingle).toHaveBeenCalled();
  });
});
