/**
 * Pedido manual, reconstrucción de pedidos pagados y «Pagos sin pedido». Todo con mocks: ninguna
 * prueba llama a una API real (fetch queda prohibido) ni a la base.
 */
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: jest.fn() }));
jest.mock('@/lib/services/taxResolverCore', () => ({ resolveLineTaxWith: jest.fn(async () => ({ tax_rate: 19 })) }));
jest.mock('@/lib/services/webOrderCreditNote', () => ({ crearNotaCreditoPedidoWeb: jest.fn() }));
jest.mock('@/lib/services/integrations/wompi/wompiService', () => ({
  wompiService: { getCredentials: jest.fn(), createPaymentLink: jest.fn(), getTransaction: jest.fn(), deactivatePaymentLink: jest.fn() },
}));
jest.mock('@/lib/services/integrations/bold', () => ({ boldService: { createPaymentLink: jest.fn(), getTransactionStatus: jest.fn() } }));
jest.mock('@/lib/services/integrations/qrShared/qrSessionService', () => ({ createQrSession: jest.fn() }));
jest.mock('@/lib/services/integrations/qrShared/cobroQrServidor', () => ({ MONEDA_RIELES_QR: 'COP' }));
jest.mock('@/lib/services/integrations/qrShared/paymentConfirmation', () => ({ WEB_ORDER_CHANGE_SOURCE: 'web_order_change' }));
jest.mock('@/lib/services/crm/email/resendClient', () => ({ getMasterResend: jest.fn(), getMasterResendKey: jest.fn(() => null), getResendClient: jest.fn() }));
jest.mock('@/lib/services/webOrderServerConfirmation', () => ({ webOrderServerConfirmation: { autoConfirmPaidOrder: jest.fn() } }));

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import {
  decidirReconstruccion,
  esNumeroDeTienda,
  generarNumeroPedidoWeb,
  montoCoincide,
  organizacionDelNumero,
  sedeSugerida,
  totalesPedidoManual,
} from '@/lib/pos/pedidosWeb/pedidoManual';
import { consultarCobro, cobroDeEvento, type DepsConsulta } from '@/lib/services/pagos/consultaPasarela.server';
import { crearPedidoManual, pagosSinPedido, reconstruirPedido, verificarCobro, type DepsPedidos } from '../pedidosManualesServer';
import { fakeDbPedidos } from './fakeDbPedidos';

const fetchReal = global.fetch;
beforeAll(() => {
  global.fetch = jest.fn(() => {
    throw new Error('Prohibido llamar a una API real en estas pruebas');
  }) as unknown as typeof fetch;
});
afterAll(() => {
  global.fetch = fetchReal;
});

// ─── Formato WO y prefijo ───────────────────────────────────────────────────

describe('número de pedido de la tienda', () => {
  test('formato WO-{org}-{Date.now() base 36}-{4 al azar}, en mayúsculas como la tienda', () => {
    const ahora = 1793979846000;
    const n = generarNumeroPedidoWeb(333, ahora, () => 0.123456789);
    expect(n).toBe(`WO-333-${ahora.toString(36).toUpperCase()}-${(0.123456789).toString(36).substring(2, 6).toUpperCase()}`);
    expect(n).toMatch(/^WO-333-[A-Z0-9]+-[A-Z0-9]{4}$/);
    expect(esNumeroDeTienda(n)).toBe(true);
    // Nunca el formato viejo del RPC generate_web_order_number.
    expect(n.startsWith('WEB-')).toBe(false);
  });

  test('la organización sale SOLO del prefijo WO-{org}- (333 y 339 comparten comercio Wompi)', () => {
    expect(organizacionDelNumero('WO-333-MW556LJG-HD58')).toBe(333);
    expect(organizacionDelNumero('WO-339-MW434LF5-3KDP')).toBe(339);
    expect(organizacionDelNumero('CHG-1234-ABC')).toBeNull();
    expect(organizacionDelNumero('1578504-1793979846-12445')).toBeNull();
    expect(organizacionDelNumero(null)).toBeNull();
  });

  test('monto: centavos de la pasarela contra el valor en pesos, exacto', () => {
    expect(montoCoincide(12345600, 123456)).toBe(true);
    expect(montoCoincide(12345600, 123455)).toBe(false);
    expect(montoCoincide(null, 0)).toBe(false);
  });
});

describe('totales del pedido manual (modelo de la tienda)', () => {
  const lineas = [{ product_id: 1, nombre: 'Café', quantity: 2, unit_price: 11900, tasa: 19 }];
  test('IVA incluido: el total es la suma de los precios más el envío', () => {
    const t = totalesPedidoManual(lineas, { envio: 5000, impuestoIncluido: true });
    expect(t).toMatchObject({ subtotal: 23800, tax_total: 3800, delivery_fee: 5000, total: 28800 });
    expect(t.items[0]).toMatchObject({ unit_price: 11900, total: 23800, tax_amount: 3800 });
  });
  test('IVA aparte: se suma al total', () => {
    expect(totalesPedidoManual(lineas, { envio: 0, impuestoIncluido: false }).total).toBe(28322);
  });
  test('sin productos o con cantidades inválidas: error', () => {
    expect(() => totalesPedidoManual([], { impuestoIncluido: true })).toThrow('Agrega al menos un producto');
    expect(() => totalesPedidoManual([{ ...lineas[0], quantity: 0 }], { impuestoIncluido: true })).toThrow();
  });
});

describe('decisión de la reconstrucción', () => {
  const base = { organizationId: 333, transaccionId: 'tx1' };
  const pedido = (o: Partial<{ organization_id: number; payment_status: string }>) => ({ id: 'p1', organization_id: 333, order_number: 'WO-333-AAA-BBBB', payment_status: 'paid', payment_reference: 'tx1', ...o });
  test('ya pagado en la misma organización: no se duplica', () => {
    expect(decidirReconstruccion({ ...base, referencia: 'WO-333-AAA-BBBB', existentes: [pedido({})] }).tipo).toBe('ya_existe');
  });
  test('pendiente con el mismo número o link: se completa ese mismo pedido', () => {
    expect(decidirReconstruccion({ ...base, referencia: 'WO-333-AAA-BBBB', existentes: [pedido({ payment_status: 'pending' })] }).tipo).toBe('completar');
  });
  test('prefijo de otra organización: rechazado aunque la conexión vea el cobro', () => {
    expect(decidirReconstruccion({ ...base, referencia: 'WO-339-AAA-BBBB', existentes: [] })).toEqual({ tipo: 'rechazar', code: 'OTRA_ORGANIZACION', organizacion: 339 });
  });
  test('el cobro ya tiene pedido en otra organización: rechazado', () => {
    expect(decidirReconstruccion({ ...base, referencia: 'X-1', existentes: [pedido({ organization_id: 339 })] })).toMatchObject({ tipo: 'rechazar', code: 'COBRO_DE_OTRA_ORGANIZACION' });
  });
  test('número de la tienda sin pedido: se crea con el MISMO número', () => {
    expect(decidirReconstruccion({ ...base, referencia: 'wo-333-aaa-bbbb', existentes: [] })).toEqual({ tipo: 'crear', orderNumber: 'WO-333-AAA-BBBB', notaOriginal: null });
  });
  test('referencia que no es de la tienda: número nuevo, la original en notas y confirmar tienda', () => {
    expect(decidirReconstruccion({ ...base, referencia: 'REF-EXTERNA-9', existentes: [] })).toEqual({ tipo: 'crear_nuevo', notaOriginal: 'REF-EXTERNA-9', requiereConfirmarTienda: true });
  });
  test('sede sugerida: la que tiene existencias de más productos del pedido', () => {
    expect(sedeSugerida([1, 2], [{ branch_id: 5, product_id: 1, disponible: 3 }, { branch_id: 4, product_id: 1, disponible: 1 }, { branch_id: 4, product_id: 2, disponible: 2 }, { branch_id: 5, product_id: 2, disponible: 0 }])).toBe(4);
    expect(sedeSugerida([1], [])).toBeNull();
  });
});

// ─── Capa de consulta (solo lectura) ────────────────────────────────────────

const txWompi = (o: Record<string, unknown> = {}) => ({
  id: '1578504-1793979846-12445',
  status: 'APPROVED',
  currency: 'COP',
  reference: 'WO-333-MW556LJG-HD58',
  amount_in_cents: 2880000,
  created_at: '2026-11-06T15:44:06.268Z',
  finalized_at: '2026-11-06T15:45:33.722Z',
  payment_method_type: 'NEQUI',
  ...o,
});

function depsConsulta(tx: Record<string, unknown> | null, porRef: Record<string, unknown>[] = tx ? [tx] : []): DepsConsulta & { llamadas: string[] } {
  const llamadas: string[] = [];
  return {
    llamadas,
    wompiCredenciales: async () => ({ publicKey: 'pub', privateKey: 'prv', eventsSecret: '', integritySecret: '', environment: 'sandbox' }),
    wompiTransaccion: async (_c, id) => {
      llamadas.push(`id:${id}`);
      return tx && tx.id === id ? { data: tx } : null;
    },
    wompiPorReferencia: async (_c, ref) => {
      llamadas.push(`ref:${ref}`);
      return { data: porRef.filter((t) => t.reference === ref) };
    },
    boldTransaccion: async (_c, id) => {
      llamadas.push(`bold:${id}`);
      return { id, status: 'APPROVED', amount: { currency: 'COP', total: 50000, taxes: 0, tip: 0 }, reference: 'WO-333-X-ABCD', created_at: '2026-11-01T10:00:00Z', payment_method: 'CARD' };
    },
  };
}
const dbVacia = fakeDbPedidos({}) as unknown as SupabaseClient;

describe('consultaPasarela (mocks, solo lectura)', () => {
  test('Wompi por ID de transacción', async () => {
    const c = await consultarCobro(dbVacia, { id: 'cx', connectorCode: 'wompi_co' }, { transaccionId: '1578504-1793979846-12445' }, depsConsulta(txWompi()));
    expect(c).toMatchObject({ estado: 'aprobada', montoCentavos: 2880000, referencia: 'WO-333-MW556LJG-HD58', metodo: 'nequi', fecha: '2026-11-06T15:45:33.722Z' });
  });
  test('Wompi por referencia: elige la aprobada entre varios intentos', async () => {
    const rechazada = txWompi({ id: 'a', status: 'DECLINED', created_at: '2026-11-06T16:00:00Z' });
    const c = await consultarCobro(dbVacia, { id: 'cx', connectorCode: 'wompi_co' }, { referencia: 'WO-333-MW556LJG-HD58' }, depsConsulta(null, [rechazada, txWompi()]));
    expect(c.estado).toBe('aprobada');
    expect(c.transaccionId).toBe('1578504-1793979846-12445');
  });
  test('referencia que la pasarela no conoce: no_encontrada', async () => {
    const c = await consultarCobro(dbVacia, { id: 'cx', connectorCode: 'wompi_co' }, { referencia: 'WO-333-NO-EXIS' }, depsConsulta(null));
    expect(c.estado).toBe('no_encontrada');
  });
  test('Bold por ID: amount.total en pesos → centavos', async () => {
    const c = await consultarCobro(dbVacia, { id: 'cb', connectorCode: 'bold_link' }, { transaccionId: 'B-1' }, depsConsulta(null));
    expect(c).toMatchObject({ estado: 'aprobada', montoCentavos: 5000000, proveedor: 'bold_link' });
  });
  test('PayU, Mercado Pago, PayPal y Stripe: stubs sin consulta', async () => {
    for (const code of ['payu_co', 'mp_checkout', 'paypal_checkout', 'stripe_payments'] as const) {
      const d = depsConsulta(txWompi());
      expect((await consultarCobro(dbVacia, { id: 'x', connectorCode: code }, { transaccionId: 't' }, d)).estado).toBe('no_soportada');
      expect(d.llamadas).toHaveLength(0);
    }
  });
  test('evento de webhook de Wompi → cobro', () => {
    expect(cobroDeEvento('wompi_co', { data: { transaction: txWompi() } })).toMatchObject({ estado: 'aprobada', transaccionId: '1578504-1793979846-12445' });
    expect(cobroDeEvento('wompi_co', {})).toBeNull();
  });
});

// ─── Servidor ───────────────────────────────────────────────────────────────

const ctx = (org: number, permisos: string[] = ['pos.web_order.change', 'pos.pedidos_web.marcar_pagado'], roleId = 5): ServerOrgContext =>
  ({
    userId: 'u1',
    userEmail: 'cajero@ejemplo.test',
    organizationId: org,
    roleId,
    isSuperAdmin: false,
    supabase: { rpc: async (_: string, a: { p_code: string }) => ({ data: permisos.includes(a.p_code), error: null }) },
  }) as unknown as ServerOrgContext;

function base(org: number, extra: Record<string, Record<string, unknown>[]> = {}) {
  return fakeDbPedidos({
    branches: [{ id: 21, organization_id: org, is_active: true }],
    organization_taxes: [{ organization_id: org, tax_included: true, is_default: true, is_active: true }],
    products: [{ id: 1, name: 'Café', sku: 'C1', status: 'active', organization_id: org }, { id: 2, name: 'Pan', sku: 'P2', status: 'active', organization_id: org }],
    product_prices: [{ product_id: 1, price: 11900, effective_from: '2020-01-01' }, { product_id: 2, price: 5000, effective_from: '2020-01-01' }],
    integration_connectors: [{ id: 'k-wompi', code: 'wompi_co' }],
    integration_connections: [{ id: 'cx1', connector_id: 'k-wompi', organization_id: org, status: 'connected', name: 'Wompi', environment: 'production' }],
    organizations: [{ id: org, name: 'Tienda de prueba' }],
    stock_levels: [{ branch_id: 21, product_id: 1, qty_on_hand: 10, qty_reserved: 0 }],
    web_orders: [],
    web_order_items: [],
    integration_object_mappings: [],
    integration_events: [],
    ...extra,
  });
}

function deps(db: ReturnType<typeof fakeDbPedidos>, tx: Record<string, unknown> | null, otros: Partial<DepsPedidos> = {}): DepsPedidos & { autoConfirmar: jest.Mock } {
  return {
    db: db as unknown as SupabaseClient,
    consulta: depsConsulta(tx),
    autoConfirmar: jest.fn(async () => ({ saleId: 'venta-1', stockErrors: [] })),
    crearLink: jest.fn(async (_db, _org, p: { id: string }) => ({ url: `https://checkout.wompi.co/l/lnk_${p.id}`, externalId: 'lnk_9', proveedor: 'wompi_co' as const, connectionId: 'cx1' })),
    ahora: () => 1793979846000,
    ...otros,
  } as DepsPedidos & { autoConfirmar: jest.Mock };
}

const cliente = { nombre: 'Laura Gómez', celular: '+57 300 000 0000', correo: 'Laura@Ejemplo.test', direccion: 'Calle 1 # 2-3' };

describe('1 · pedido manual', () => {
  test('crea web_orders + web_order_items con WO-{org}-…, pendiente, reserva stock y genera el link', async () => {
    const db = base(333);
    const d = deps(db, null);
    const r = await crearPedidoManual(ctx(333), { branch_id: 21, cliente, items: [{ product_id: 1, quantity: 2 }], canal: 'whatsapp' }, d);
    expect(r.pedido.order_number).toMatch(/^WO-333-[A-Z0-9]+-[A-Z0-9]{4}$/);
    expect(r.link?.url).toContain('checkout.wompi.co');
    const pedido = db.tablas.web_orders[0];
    expect(pedido).toMatchObject({ organization_id: 333, branch_id: 21, status: 'pending', payment_status: 'pending', source: 'whatsapp', total: 23800, customer_email: 'laura@ejemplo.test' });
    expect(db.tablas.web_order_items).toHaveLength(1);
    expect(db.rpcs.map((x) => x.fn)).toEqual(['reserve_stock_for_web_order']);
    expect(db.tablas.integration_object_mappings[0]).toMatchObject({ external_type: 'payment_link', external_id: 'lnk_9', internal_table: 'web_orders', internal_id: pedido.id });
    expect(d.crearLink).toHaveBeenCalledWith(expect.anything(), 333, expect.objectContaining({ order_number: r.pedido.order_number, total: 23800 }), undefined);
  });

  test('sin permiso: 403 y nada escrito', async () => {
    const db = base(333);
    await expect(crearPedidoManual(ctx(333, []), { branch_id: 21, cliente, items: [{ product_id: 1, quantity: 1 }] }, deps(db, null))).rejects.toMatchObject({ status: 403 });
    expect(db.escrituras).toHaveLength(0);
  });

  test('sede de otra organización: rechazada', async () => {
    const db = base(333);
    await expect(crearPedidoManual(ctx(333), { branch_id: 99, cliente, items: [{ product_id: 1, quantity: 1 }] }, deps(db, null))).rejects.toMatchObject({ code: 'SEDE_INVALIDA' });
  });

  test('sin stock: el pedido se cancela y responde 409', async () => {
    const db = fakeDbPedidos(base(333).tablas, () => ({ data: { ok: false, shortages: [{ product_id: 1 }] }, error: null }));
    await expect(crearPedidoManual(ctx(333), { branch_id: 21, cliente, items: [{ product_id: 1, quantity: 50 }] }, deps(db, null))).rejects.toMatchObject({ status: 409, code: 'STOCK_INSUFICIENTE' });
    expect(db.tablas.web_orders[0].status).toBe('cancelled');
  });
});

describe('2 · reconstruir un pedido pagado', () => {
  const body = { connection_id: 'cx1', referencia: 'WO-333-MW556LJG-HD58', valor: 28800, fecha: '2026-11-06T15:45:33.722Z', branch_id: 21, cliente, items: [{ product_id: 1, quantity: 2 }], envio: 5000 };

  test('aprobada y monto exacto: crea con el MISMO número, pagado, payment_reference = tx y confirmed_at = fecha', async () => {
    const db = base(333);
    const d = deps(db, txWompi());
    const r = await reconstruirPedido(ctx(333), body, d);
    expect(r.estado).toBe('creado');
    const p = db.tablas.web_orders[0];
    expect(p).toMatchObject({ order_number: 'WO-333-MW556LJG-HD58', payment_status: 'paid', payment_reference: '1578504-1793979846-12445', payment_method: 'nequi', confirmed_at: '2026-11-06T15:45:33.722Z', organization_id: 333 });
    expect(String(p.internal_notes)).toContain('[Reconstruido]');
    expect(d.autoConfirmar).toHaveBeenCalledWith(p.id);
  });

  test('idempotencia: la segunda vez no duplica ni vuelve a confirmar', async () => {
    const db = base(333);
    const d = deps(db, txWompi());
    await reconstruirPedido(ctx(333), body, d);
    const r2 = await reconstruirPedido(ctx(333), body, d);
    expect(r2.estado).toBe('ya_existia');
    expect(db.tablas.web_orders).toHaveLength(1);
    expect(d.autoConfirmar).toHaveBeenCalledTimes(1);
  });

  test('org por prefijo: un cobro WO-333 visto desde la 339 (mismo comercio Wompi) se rechaza sin escribir', async () => {
    const db = base(339);
    await expect(reconstruirPedido(ctx(339), body, deps(db, txWompi()))).rejects.toMatchObject({ status: 409, code: 'OTRA_ORGANIZACION' });
    expect(db.escrituras).toHaveLength(0);
  });

  test('monto distinto: rechazado sin escribir', async () => {
    const db = base(333);
    await expect(reconstruirPedido(ctx(333), { ...body, valor: 28000 }, deps(db, txWompi()))).rejects.toMatchObject({ status: 409, code: 'MONTO_DISTINTO' });
    expect(db.escrituras).toHaveLength(0);
  });

  test('cobro no aprobado: rechazado', async () => {
    const db = base(333);
    await expect(reconstruirPedido(ctx(333), body, deps(db, txWompi({ status: 'DECLINED' })))).rejects.toMatchObject({ code: 'COBRO_NO_APROBADO' });
    expect(db.escrituras).toHaveLength(0);
  });

  test('referencia que la pasarela no encuentra: 404, no se crea nada', async () => {
    const db = base(333);
    await expect(reconstruirPedido(ctx(333), body, deps(db, null))).rejects.toMatchObject({ status: 404, code: 'COBRO_NO_ENCONTRADO' });
    expect(db.escrituras).toHaveLength(0);
  });

  test('referencia que no es de la tienda: exige confirmar; confirmada, número nuevo y la original en notas', async () => {
    const db = base(333);
    const tx = txWompi({ reference: 'REF-EXTERNA-9' });
    const sinConfirmar = { ...body, referencia: 'REF-EXTERNA-9' };
    await expect(reconstruirPedido(ctx(333), sinConfirmar, deps(db, tx))).rejects.toMatchObject({ code: 'CONFIRMAR_TIENDA', extra: { sede_sugerida: 21 } });
    expect(db.escrituras).toHaveLength(0);
    const r = await reconstruirPedido(ctx(333), { ...sinConfirmar, confirmar_tienda: true }, deps(db, tx));
    expect(r.estado).toBe('creado');
    const p = db.tablas.web_orders[0];
    expect(p.order_number).toMatch(/^WO-333-/);
    expect(p.order_number).not.toBe('REF-EXTERNA-9');
    expect(String(p.internal_notes)).toContain('referencia original: REF-EXTERNA-9');
  });

  test('la suma de productos y envío debe dar el valor cobrado', async () => {
    const db = base(333);
    await expect(reconstruirPedido(ctx(333), { ...body, envio: 0 }, deps(db, txWompi({ amount_in_cents: 2880000 })))).rejects.toMatchObject({ code: 'TOTAL_NO_CUADRA' });
  });

  test('pedido manual pendiente con link: el cobro del link (payment_link_id) completa ESE pedido', async () => {
    const db = base(333, {
      web_orders: [{ id: 'm1', organization_id: 333, order_number: 'WO-333-MANUAL-AAAA', payment_status: 'pending', payment_reference: null, total: 23800, status: 'pending' }],
      integration_object_mappings: [{ connection_id: 'cx1', external_type: 'payment_link', external_id: 'lnk_9', internal_table: 'web_orders', internal_id: 'm1', deleted_at: null }],
    });
    const tx = txWompi({ id: 'tx-link', reference: '9pTnMx_1793979846_abc', amount_in_cents: 2380000, payment_link_id: 'lnk_9' });
    const d = deps(db, tx);
    const r = await reconstruirPedido(ctx(333), { connection_id: 'cx1', transaccion: 'tx-link', valor: 23800, cliente, items: [] }, d);
    expect(r.estado).toBe('completado');
    expect(db.tablas.web_orders).toHaveLength(1);
    expect(db.tablas.web_orders[0]).toMatchObject({ payment_status: 'paid', payment_reference: 'tx-link' });
    expect(d.autoConfirmar).toHaveBeenCalledWith('m1');
  });

  test('verificar no escribe nada y dice qué pasaría', async () => {
    const db = base(333);
    const r = await verificarCobro(ctx(333), body, deps(db, txWompi()));
    expect(r.decision.tipo).toBe('crear');
    expect(db.escrituras).toHaveLength(0);
  });
});

describe('3 · pagos sin pedido', () => {
  const evento = (tx: Record<string, unknown>, connection_id = 'cx1') => ({ connection_id, direction: 'inbound', created_at: '2026-11-06T16:00:00Z', payload: { event: 'transaction.updated', data: { transaction: tx } } });
  test('solo los aprobados de esta organización sin pedido (ni los de otra con el mismo comercio)', async () => {
    const db = base(333, {
      integration_events: [
        evento(txWompi({ id: 't-huerfano', reference: 'WO-333-HUERF-AAAA' })),
        evento(txWompi({ id: 't-con-pedido', reference: 'WO-333-CONPE-BBBB' })),
        evento(txWompi({ id: 't-otra', reference: 'WO-339-OTRA-CCCC' })),
        evento(txWompi({ id: 't-rechazado', reference: 'WO-333-RECH-DDDD', status: 'DECLINED' })),
        evento(txWompi({ id: 't-sin-prefijo', reference: 'LINK_123' })),
      ],
      web_orders: [{ id: 'w1', organization_id: 333, order_number: 'WO-333-CONPE-BBBB', payment_status: 'paid', payment_reference: 't-con-pedido' }],
    });
    const r = await pagosSinPedido(ctx(333), {}, deps(db, null));
    expect(r.map((p) => p.cobro.transaccionId).sort()).toEqual(['t-huerfano', 't-sin-prefijo']);
    expect(r.find((p) => p.cobro.transaccionId === 't-sin-prefijo')?.sinPrefijo).toBe(true);
    expect(db.escrituras).toHaveLength(0);
  });
});
