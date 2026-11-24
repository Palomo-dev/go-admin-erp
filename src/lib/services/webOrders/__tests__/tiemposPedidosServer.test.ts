/// <reference types="jest" />
/**
 * Confirmación automática y tiempos guardados (`tiemposPedidosServer.ts`): sin fila, o con el
 * interruptor apagado, el servidor hace exactamente lo de hoy (restaurante 30 min, el resto
 * 1 día); con el interruptor encendido, los de la sede y el tipo de entrega.
 */
jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));
jest.spyOn(console, 'warn').mockImplementation(() => {});

import { tiemposAutoConfirmacion, leerAjustesTiempos } from '../tiemposPedidosServer';
import { webOrderServerConfirmation } from '../../webOrderServerConfirmation';

type Respuestas = Record<string, unknown>;

/** Cliente falso: cada tabla responde su `data` a `maybeSingle()`; registra los filtros. */
function cliente(respuestas: Respuestas) {
  const filtros: Array<[string, string, unknown]> = [];
  return {
    filtros,
    from: jest.fn((tabla: string) => {
      const c: Record<string, unknown> = {};
      for (const m of ['select', 'order', 'limit', 'not']) c[m] = jest.fn(() => c);
      c.eq = jest.fn((col: string, v: unknown) => {
        filtros.push([tabla, col, v]);
        return c;
      });
      c.maybeSingle = jest.fn(async () => ({ data: respuestas[tabla] ?? null, error: null }));
      return c;
    }),
  };
}

const pedido = { organization_id: 120, branch_id: 7, delivery_type: 'delivery_own', delivery_address: { city: 'Cali' } };

describe('sin configuración: lo de hoy', () => {
  test('sin fila no hay tiempos configurados', async () => {
    const db = cliente({ organizations: { type_id: 3 } });
    expect(await leerAjustesTiempos(db as never, 120)).toBeNull();
    expect(await tiemposAutoConfirmacion(db as never, pedido)).toBeNull();
  });

  test('minutosPreparacion sin fila = 30 (restaurante) y 1440 (el resto), como hoy', async () => {
    for (const [typeId, esperado] of [[1, 30], [3, 1440], [2, 1440], [null, 1440]] as const) {
      const db = cliente({ organizations: { type_id: typeId } });
      expect(await webOrderServerConfirmation.minutosPreparacion(db as never, pedido as never)).toBe(esperado);
    }
  });

  test('con fila pero el interruptor apagado: lo de hoy', async () => {
    const db = cliente({
      organization_settings: { settings: { por_tipo: { domicilio: { alistar: { valor: 2, unidad: 'horas' } } }, usar_en_confirmacion_automatica: false } },
      organizations: { type_id: 1 },
    });
    expect(await tiemposAutoConfirmacion(db as never, pedido)).toBeNull();
    expect(await webOrderServerConfirmation.minutosPreparacion(db as never, pedido as never)).toBe(30);
  });

  test('un error leyendo la fila cuenta como «sin configuración»', async () => {
    const roto = { from: jest.fn(() => { throw new Error('caída'); }) };
    expect(await leerAjustesTiempos(roto as never, 120)).toBeNull();
  });
});

describe('con «usar estos tiempos al confirmarse solo»', () => {
  const settings = {
    por_tipo: { domicilio: { alistar: { valor: 1, unidad: 'horas' }, entrega: { valor: 40, unidad: 'minutos' } }, transportadora: { alistar: { valor: 1, unidad: 'dias' }, entrega: { valor: 3, unidad: 'dias' } } },
    por_sede: { '7': { domicilio: { alistar: { valor: 2, unidad: 'horas' } } } },
    usar_en_confirmacion_automatica: true,
  };

  test('los de la sede y el tipo de entrega; la organización filtra la fila', async () => {
    const db = cliente({ organization_settings: { settings }, organizations: { type_id: 1, timezone: 'America/Bogota' } });
    const ahora = new Date('2026-11-24T15:00:00Z');
    const r = await tiemposAutoConfirmacion(db as never, pedido, ahora);
    expect(r?.prepMin).toBe(120);
    expect(r?.estimatedDeliveryAt?.toISOString()).toBe('2026-11-24T17:40:00.000Z');
    expect(db.filtros).toContainEqual(['organization_settings', 'organization_id', 120]);
    expect(db.filtros).toContainEqual(['organization_settings', 'key', 'pedidos_online_tiempos']);
    expect(await webOrderServerConfirmation.minutosPreparacion(db as never, pedido as never)).toBe(120);
  });

  test('transportadora: manda la tarifa con días de tránsito', async () => {
    const db = cliente({ organization_settings: { settings }, organizations: { type_id: 3 }, shipping_rates: { estimated_transit_days: 6 } });
    const ahora = new Date('2026-11-24T15:00:00Z');
    const r = await tiemposAutoConfirmacion(db as never, { ...pedido, delivery_type: 'delivery_third_party' }, ahora);
    expect(r?.entregaDeTarifa).toBe(true);
    expect(r?.estimatedDeliveryAt?.toISOString()).toBe('2026-12-01T15:00:00.000Z'); // 1 día + 6 días
  });
});
