/**
 * Fase 1 de «menos consultas» (2026-11-24): piezas puras de pedidos online y de la bandeja de
 * chat. Lo que se comprueba es que el camino nuevo da LO MISMO que el anterior.
 */
jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));
jest.mock('@/lib/hooks/useOrganization', () => ({ getOrganizationId: () => 120 }));

import { estadisticasDePedidos, eventoDeLaSede, type PedidoParaEstadisticas } from '../webOrdersService';
import { filaConDetalles } from '../conversationsService';

const pedido = (p: Partial<PedidoParaEstadisticas>): PedidoParaEstadisticas =>
  ({
    status: 'pending',
    total: 0,
    delivery_type: 'pickup',
    source: 'website',
    payment_status: 'pending',
    created_at: '2026-11-24T15:00:00Z',
    estimated_ready_at: null,
    estimated_delivery_at: null,
    ready_at: null,
    delivered_at: null,
    internal_notes: null,
    ...p,
  }) as PedidoParaEstadisticas;

describe('tarjetas de pedidos online a partir del listado', () => {
  test('cuenta estados, ingresos, ticket promedio, tipo de entrega y origen', () => {
    const stats = estadisticasDePedidos([
      pedido({ status: 'pending', total: 10000 }),
      pedido({ status: 'preparing', total: 20000, payment_status: 'paid', delivery_type: 'delivery_own' }),
      pedido({ status: 'delivered', total: 30000, payment_status: 'pending', source: 'whatsapp' }),
      pedido({ status: 'cancelled', total: 99999 }),
      pedido({ status: 'expired', total: 5000 }),
    ]);
    expect(stats.total_orders).toBe(5);
    expect(stats.pending_orders).toBe(2);
    expect(stats.completed_orders).toBe(1);
    expect(stats.cancelled_orders).toBe(2);
    expect(stats.unconfirmed_orders).toBe(1);
    // Ingresos: pagados o entregados (20.000 + 30.000), sobre 2 pedidos.
    expect(stats.total_revenue).toBe(50000);
    expect(stats.avg_order_value).toBe(25000);
    expect(stats.by_delivery_type).toEqual(
      expect.arrayContaining([
        { type: 'pickup', count: 4, revenue: 30000 },
        { type: 'delivery_own', count: 1, revenue: 20000 },
      ]),
    );
    expect(stats.by_source).toEqual(expect.arrayContaining([{ source: 'website', count: 4 }, { source: 'whatsapp', count: 1 }]));
  });

  test('sin pedidos: todo en cero y sin porcentaje a tiempo', () => {
    const stats = estadisticasDePedidos([]);
    expect(stats).toMatchObject({ total_orders: 0, total_revenue: 0, avg_order_value: 0, on_time_pct: null, by_delivery_type: [], by_source: [] });
  });

  test('las columnas de más del listado (ítems, cliente…) no cambian el resultado', () => {
    const base = [pedido({ status: 'delivered', total: 15000, payment_status: 'paid' }), pedido({ status: 'pending', total: 8000 })];
    const delListado = base.map((p) => ({ ...p, items: [{ id: 1 }], customer: { full_name: 'Cliente de prueba' }, order_number: 'W-1' }));
    expect(estadisticasDePedidos(delListado)).toEqual(estadisticasDePedidos(base));
  });
});

describe('aviso en tiempo real de pedidos con una sede elegida', () => {
  test('pasa el pedido de la sede y descarta el de otra', () => {
    expect(eventoDeLaSede({ new: { branch_id: 7 }, old: {} }, 7)).toBe(true);
    expect(eventoDeLaSede({ new: { branch_id: 8 }, old: {} }, 7)).toBe(false);
    expect(eventoDeLaSede({ new: { branch_id: null }, old: {} }, 7)).toBe(false);
  });

  test('un pedido que cambia de sede avisa a las dos', () => {
    expect(eventoDeLaSede({ new: { branch_id: 8 }, old: { branch_id: 7 } }, 7)).toBe(true);
    expect(eventoDeLaSede({ new: { branch_id: 8 }, old: { branch_id: 7 } }, 8)).toBe(true);
    expect(eventoDeLaSede({ new: { branch_id: 8 }, old: { branch_id: 7 } }, 9)).toBe(false);
  });

  test('un evento sin sede legible (un borrado solo trae el id) se deja pasar', () => {
    expect(eventoDeLaSede({ new: {}, old: { id: 'x' } }, 7)).toBe(true);
    expect(eventoDeLaSede({}, 7)).toBe(true);
  });
});

describe('fila de la bandeja con el último mensaje y las etiquetas embebidos', () => {
  test('queda con la forma de siempre y sin los alias', () => {
    const fila = filaConDetalles({
      id: 'c-1',
      status: 'open',
      customer: { id: 'u-1', full_name: 'Cliente de prueba' },
      ultimo_mensaje: [{ id: 'm-9', content: 'Hola', created_at: '2026-11-24T15:00:00Z', direction: 'inbound', role: 'customer', is_read: false }],
      relaciones_etiqueta: [{ tag: { id: 't-1', name: 'VIP', color: '#000000' } }, { tag: null }],
    });
    expect(fila).toEqual({
      id: 'c-1',
      status: 'open',
      customer: { id: 'u-1', full_name: 'Cliente de prueba' },
      last_message: { id: 'm-9', content: 'Hola', created_at: '2026-11-24T15:00:00Z', direction: 'inbound', role: 'customer', is_read: false },
      tags: [{ id: 't-1', name: 'VIP', color: '#000000' }],
    });
  });

  test('sin mensajes ni etiquetas: last_message null y tags vacío, como antes', () => {
    expect(filaConDetalles({ id: 'c-2', ultimo_mensaje: [], relaciones_etiqueta: [] })).toEqual({ id: 'c-2', last_message: null, tags: [] });
    expect(filaConDetalles({ id: 'c-3' })).toEqual({ id: 'c-3', last_message: null, tags: [] });
  });
});
