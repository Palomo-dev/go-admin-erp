/**
 * Servicio de Logística › Envíos:
 * - el valor y el pago de cada fila salen del PEDIDO (web_orders / sales) leídos por lote, una
 *   consulta por tabla y no una por envío (antes la lista mostraba «Total $ 0» y «Pago: Pendiente»
 *   en todos los envíos de la tienda);
 * - crear con pedido web va por la ruta única del pedido; sin pedido, el insert de siempre con sus
 *   líneas, y el domiciliario por la RPC;
 * - editar un envío en camino solo manda los campos que el estado permite.
 */
jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));

const createShipment = jest.fn(async (d: Record<string, unknown>) => ({ id: 'nuevo-1', ...d }));
const addShipmentItem = jest.fn(async () => ({}));
const updateShipment = jest.fn(async () => ({}));
const updateShipmentItem = jest.fn(async () => ({}));
const deleteShipmentItem = jest.fn(async () => undefined);
jest.mock('@/lib/services/shipmentsService', () => ({
  shipmentsService: {
    createShipment: (d: Record<string, unknown>) => createShipment(d),
    addShipmentItem: (...a: unknown[]) => addShipmentItem(...(a as [])),
    updateShipment: (...a: unknown[]) => updateShipment(...(a as [])),
    updateShipmentItem: (...a: unknown[]) => updateShipmentItem(...(a as [])),
    deleteShipmentItem: (...a: unknown[]) => deleteShipmentItem(...(a as [])),
    getCarriers: jest.fn(async () => []),
    getTrips: jest.fn(async () => []),
    getStops: jest.fn(async () => []),
  },
}));
const createShipmentFromWebOrder = jest.fn(async () => ({ id: 'envio-web' }));
const assignVehicleAndDriver = jest.fn(async () => ({}));
jest.mock('@/lib/services/deliveryIntegrationService', () => ({
  deliveryIntegrationService: {
    createShipmentFromWebOrder: (...a: unknown[]) => createShipmentFromWebOrder(...(a as [])),
    assignVehicleAndDriver: (...a: unknown[]) => assignVehicleAndDriver(...(a as [])),
  },
}));
const getOrderById = jest.fn(async (id: string) => ({ id, delivery_type: 'delivery_own' }));
jest.mock('@/lib/services/webOrdersService', () => ({ webOrdersService: { getOrderById: (id: string) => getOrderById(id) } }));

import type { SupabaseClient } from '@supabase/supabase-js';
import { actualizarEnvio, crearEnvio, listarEnvios, metadataDeFormulario, numeroEnvioManual, type EnvioEditable } from '@/lib/services/logistica/enviosService';
import type { DatosFormularioEnvio } from '@/lib/logistica/envios';

type Llamada = { tabla: string; metodos: [string, unknown[]][] };

/** Cliente falso: registra cada consulta y responde según la tabla. */
function dbFalso(respuestas: Record<string, unknown[]>) {
  const llamadas: Llamada[] = [];
  const db = {
    from(tabla: string) {
      const llamada: Llamada = { tabla, metodos: [] };
      llamadas.push(llamada);
      const cadena: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'in', 'gte', 'lt', 'order', 'range', 'limit', 'ilike', 'maybeSingle']) {
        cadena[m] = (...args: unknown[]) => {
          llamada.metodos.push([m, args]);
          return cadena;
        };
      }
      cadena.then = (ok: (v: unknown) => unknown) => ok({ data: respuestas[tabla] ?? [], error: null, count: (respuestas[tabla] ?? []).length });
      return cadena;
    },
  };
  return { db: db as unknown as SupabaseClient, llamadas };
}

const envioBase = {
  organization_id: 1, branch_id: 3, tracking_number: 'TRK1', fulfillment_mode: 'own', created_at: '2026-11-24T15:00:00Z', updated_at: null,
  delivery_address: 'Cra 45 #12-30', delivery_city: 'Bogotá', delivery_department: null, delivery_contact_name: 'Ana', delivery_contact_phone: '300',
  delivery_instructions: null, delivery_latitude: null, delivery_longitude: null, expected_delivery_date: null, cod_collected_amount: null,
  cod_collected_method: null, cod_collected_at: null, declared_value: null, shipping_fee: 0, total_cost: 0, currency: 'COP', cod_amount: 0,
  cod_status: null, payment_status: 'pending', driver_id: null, vehicle_id: null, assigned_at: null, failed_attempts: 0, exception_reason: null,
  exception_detail: null, delivery_code_required: false, carrier_id: null, metadata: {}, weight_kg: '1.2', delivered_at: null, dispatched_at: null,
  picked_at: null, shipping_zone_id: null, notes: null, insurance_fee: 0, customer_id: null,
};

describe('listarEnvios', () => {
  test('valor y pago del pedido, por lote: una consulta a web_orders y una a sales para todos los envíos', async () => {
    const { db, llamadas } = dbFalso({
      shipments: [
        { ...envioBase, id: 's1', shipment_number: 'DEL-WO-1', source_type: 'web_order', source_id: 'w1', status: 'pending' },
        { ...envioBase, id: 's2', shipment_number: 'DEL-WO-2', source_type: 'web_order', source_id: 'w2', status: 'pending' },
        { ...envioBase, id: 's3', shipment_number: 'POS-1', source_type: 'sale', source_id: 'v1', status: 'delivered' },
        { ...envioBase, id: 's4', shipment_number: 'ENV-1', source_type: 'manual', source_id: null, status: 'cancelled', declared_value: 58000 },
      ],
      web_orders: [
        { id: 'w1', order_number: 'WO-1', source: 'web', total: 128900, payment_status: 'paid', status: 'confirmed' },
        { id: 'w2', order_number: 'WO-2', source: 'web', total: 45900, payment_status: 'pending', status: 'confirmed' },
      ],
      sales: [{ id: 'v1', total: 215000, payment_status: 'paid', status: 'completed' }],
      proof_of_delivery: [{ shipment_id: 's3', recipient_name: 'Jorge', photo_urls: ['a.jpg'] }],
    });
    const r = await listarEnvios(db, { organizationId: 1, desde: '2026-11-01T05:00:00.000Z', hasta: '2026-11-25T05:00:00.000Z' });
    const porTabla = (t: string) => llamadas.filter((l) => l.tabla === t).length;
    expect(porTabla('web_orders')).toBe(1);
    expect(porTabla('sales')).toBe(1);
    expect(porTabla('proof_of_delivery')).toBe(1);
    const [s1, s2, s3, s4] = r.filas;
    expect([s1.valor, s1.pagoPedido, s1.pagado, s1.pedido]).toEqual([128900, 'paid', true, 'WO-1']);
    expect([s2.valor, s2.pagoPedido]).toEqual([45900, 'pending']);
    expect([s3.valor, s3.pagoPedido, s3.canal, s3.recibio, s3.recibioConFoto]).toEqual([215000, 'paid', 'pos', 'Jorge', true]);
    expect([s4.valor, s4.pagoPedido, s4.pesoKg]).toEqual([58000, 'pending', 1.2]);
    // El periodo filtra created_at en la base, con instantes ya convertidos desde la zona.
    const envios = llamadas.find((l) => l.tabla === 'shipments')!;
    expect(envios.metodos).toEqual(expect.arrayContaining([['gte', ['created_at', '2026-11-01T05:00:00.000Z']], ['lt', ['created_at', '2026-11-25T05:00:00.000Z']]]));
  });
});

const datos = (p: Partial<DatosFormularioEnvio> = {}): DatosFormularioEnvio => ({
  pedidoWebId: null, sedeId: 3, remitente: 'Org 1 · Sede Centro', telefonoRemitente: '', clienteId: null, destinatario: 'Ana', telefono: '+57 3005551234',
  direccion: 'Cra 45 #12-30', barrio: 'Chapinero', ciudad: 'Bogotá', indicaciones: 'Portería', tipoPaquete: 'small_box', pesoKg: 1.2, valorDeclarado: 128900,
  lineas: [
    { clave: 'a', id: null, descripcion: 'Audífonos', cantidad: 1, pesoKg: 0.4, valor: 89000 },
    { clave: 'b', id: null, descripcion: '  ', cantidad: 1, pesoKg: null, valor: null },
  ],
  fragil: true, firma: false, modo: 'own', domiciliarioId: 'd1', transportadoraId: null, guia: '', viajeId: null, paradaOrigenId: null, paradaDestinoId: null,
  promesa: '2026-11-25', costoEnvio: 8000, seguro: 0, cobrarContraentrega: true, contraentrega: 128900, notas: 'Llamar antes', ...p,
});

describe('crearEnvio', () => {
  beforeEach(() => jest.clearAllMocks());

  test('manual: el insert de siempre con su contraentrega, sus líneas y el domiciliario por la RPC', async () => {
    const r = await crearEnvio(1, datos(), { zonaId: 'z1', fuenteCosto: 'zona' });
    expect(r).toEqual({ id: 'nuevo-1', asignacionFallida: false });
    const insert = createShipment.mock.calls[0][0];
    expect(insert).toMatchObject({
      organization_id: 1, branch_id: 3, source_type: 'manual', status: 'pending', fulfillment_mode: 'own', shipping_fee: 8000, cod_amount: 128900,
      cod_status: 'pending', shipping_zone_id: 'z1', total_cost: 8000, expected_delivery_date: '2026-11-25',
    });
    expect(String(insert.shipment_number)).toMatch(/^ENV-/);
    expect(insert.metadata).toMatchObject({ is_fragile: true, barrio: 'Chapinero', package_type: 'small_box', shipping_fee_source: 'zona' });
    expect(addShipmentItem).toHaveBeenCalledTimes(1);
    expect(addShipmentItem).toHaveBeenCalledWith('nuevo-1', expect.objectContaining({ description: 'Audífonos', qty: 1, unit_value: 89000 }));
    expect(assignVehicleAndDriver).toHaveBeenCalledWith('nuevo-1', null, 'd1');
  });

  test('con pedido de la tienda: la ruta única del pedido, sin insert propio', async () => {
    const r = await crearEnvio(1, datos({ pedidoWebId: 'w9', domiciliarioId: null }), { zonaId: null, fuenteCosto: null });
    expect(getOrderById).toHaveBeenCalledWith('w9');
    expect(createShipmentFromWebOrder).toHaveBeenCalledTimes(1);
    expect(createShipment).not.toHaveBeenCalled();
    expect(r.id).toBe('envio-web');
  });

  test('si el domiciliario no se puede asignar, el envío queda y se avisa', async () => {
    assignVehicleAndDriver.mockRejectedValueOnce(new Error('DOMICILIARIO_INVALIDO'));
    const r = await crearEnvio(1, datos(), { zonaId: null, fuenteCosto: null });
    expect(r.asignacionFallida).toBe(true);
  });
});

describe('actualizarEnvio', () => {
  beforeEach(() => jest.clearAllMocks());
  const original = (status: string, sourceId: string | null = null): EnvioEditable => ({
    id: 's1', numero: 'ENV-1', status, sourceType: sourceId ? 'web_order' : 'manual', sourceId, pedido: null, domiciliario: null, creado: '2026-11-24T15:00:00Z',
    metadata: { web_order_number: 'WO-1', sender_name: 'Viejo' },
    datos: datos({ lineas: [{ clave: 'i1', id: 'i1', descripcion: 'Audífonos', cantidad: 1, pesoKg: 0.4, valor: 89000 }], domiciliarioId: 'd1' }),
  });

  test('en camino: solo teléfono, indicaciones, promesa, notas y contraentrega; nada de dirección ni líneas', async () => {
    await actualizarEnvio(original('out_for_delivery'), datos({ direccion: 'Otra', telefono: '+57 3110000000', domiciliarioId: 'd2' }), { zonaId: null, fuenteCosto: null });
    const cambios = (updateShipment.mock.calls[0] as unknown[])[1] as Record<string, unknown>;
    expect(Object.keys(cambios).sort()).toEqual(['cod_amount', 'cod_status', 'delivery_contact_phone', 'delivery_instructions', 'expected_delivery_date', 'notes']);
    expect(addShipmentItem).not.toHaveBeenCalled();
    expect(deleteShipmentItem).not.toHaveBeenCalled();
    expect(assignVehicleAndDriver).not.toHaveBeenCalled();
  });

  test('cerrado: solo las notas', async () => {
    await actualizarEnvio(original('delivered'), datos(), { zonaId: null, fuenteCosto: null });
    expect(Object.keys((updateShipment.mock.calls[0] as unknown[])[1] as object)).toEqual(['notes']);
  });

  test('en preparación: líneas nuevas, cambiadas y quitadas; metadata fusionada; domiciliario por la RPC si cambió', async () => {
    const d = datos({
      lineas: [{ clave: 'n', id: null, descripcion: 'Cargador', cantidad: 2, pesoKg: 0.2, valor: 79800 }],
      domiciliarioId: 'd2',
    });
    await actualizarEnvio(original('pending'), d, { zonaId: null, fuenteCosto: 'sin_zonas' });
    const cambios = (updateShipment.mock.calls[0] as unknown[])[1] as Record<string, unknown>;
    expect(cambios.metadata).toMatchObject({ web_order_number: 'WO-1', sender_name: 'Org 1 · Sede Centro', shipping_fee_source: 'sin_zonas' });
    expect(deleteShipmentItem).toHaveBeenCalledWith('i1');
    expect(addShipmentItem).toHaveBeenCalledWith('s1', expect.objectContaining({ description: 'Cargador', qty: 2, unit_value: 39900 }));
    expect(assignVehicleAndDriver).toHaveBeenCalledWith('s1', null, 'd2');
  });

  test('vinculado a un pedido: el costo, la contraentrega y las líneas no se tocan', async () => {
    await actualizarEnvio(original('pending', 'w1'), datos({ costoEnvio: 1, contraentrega: 1 }), { zonaId: null, fuenteCosto: null });
    const cambios = (updateShipment.mock.calls[0] as unknown[])[1] as Record<string, unknown>;
    expect(cambios).not.toHaveProperty('shipping_fee');
    expect(cambios).not.toHaveProperty('cod_amount');
    expect(addShipmentItem).not.toHaveBeenCalled();
  });
});

describe('ayudantes', () => {
  test('numeroEnvioManual: legible y estable con los mismos datos', () => {
    expect(numeroEnvioManual(new Date('2026-11-24T00:00:00Z'), () => 0.5)).toBe(numeroEnvioManual(new Date('2026-11-24T00:00:00Z'), () => 0.5));
    expect(numeroEnvioManual()).toMatch(/^ENV-[0-9A-Z]+-[0-9A-Z]{4}$/);
  });
  test('metadataDeFormulario fusiona y quita lo vacío, y el viaje solo en modo viaje', () => {
    const m = metadataDeFormulario(datos({ modo: 'viaje', viajeId: 't1', paradaOrigenId: 'p1', fragil: false }), { otra: 1, is_fragile: true }, null);
    expect(m).toMatchObject({ otra: 1, trip_id: 't1', origin_stop_id: 'p1' });
    expect(m).not.toHaveProperty('is_fragile');
    expect(metadataDeFormulario(datos({ modo: 'own', viajeId: 't1' }), { trip_id: 'viejo' }, null)).not.toHaveProperty('trip_id');
  });
});
