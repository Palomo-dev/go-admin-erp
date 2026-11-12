/// <reference types="jest" />
/**
 * Búsqueda del listado de Pedidos Online.
 *
 * Bug que impide reincidir (org 333, 2026-11-11): al escribir una palabra, los ids
 * de los pedidos con un producto que coincidía iban todos en la misma URL
 * (`id.in.(…)`) y Supabase respondía 400. Ahora son dos consultas: por los datos
 * del pedido y, de 100 en 100 ids, por producto; se unen sin repetir y en orden.
 */

type Llamada = { tabla: string; or?: string; in?: [string, string[]]; eqs: Array<[string, unknown]> };
const llamadas: Llamada[] = [];
let filasTexto: Array<{ id: string; created_at: string }> = [];
let filasItems: Array<{ web_order_id: string }> = [];

jest.mock('@/lib/supabase/config', () => ({
  supabase: {
    from: (tabla: string) => {
      const llamada: Llamada = { tabla, eqs: [] };
      llamadas.push(llamada);
      const q: Record<string, unknown> = {};
      const mismo = () => q;
      Object.assign(q, {
        select: mismo,
        order: mismo,
        gte: mismo,
        lte: mismo,
        ilike: mismo,
        eq: (col: string, v: unknown) => {
          llamada.eqs.push([col, v]);
          return q;
        },
        or: (filtro: string) => {
          llamada.or = filtro;
          return q;
        },
        in: (col: string, ids: string[]) => {
          llamada.in = [col, ids];
          return q;
        },
        range: (desde: number, hasta: number) => {
          let data: unknown[];
          if (tabla === 'web_order_items') data = filasItems.slice(desde, hasta + 1);
          else if (llamada.in) {
            const ids = new Set(llamada.in[1]);
            data = [...ids].map((id) => ({ id, created_at: `2026-11-0${(Number(id.slice(1)) % 9) + 1}T00:00:00Z` }));
          } else data = filasTexto.slice(desde, hasta + 1);
          return Promise.resolve({ data, error: null });
        },
      });
      return q;
    },
  },
}));
jest.mock('@/lib/hooks/useOrganization', () => ({ getOrganizationId: () => 333 }));
jest.mock('@/lib/services/stockMovementService', () => ({ stockMovementService: {} }));
jest.mock('@/lib/services/serialTrackingService', () => ({ serialTrackingService: {} }));

import { valorFiltroPostgrest, webOrdersService } from '../webOrdersService';

beforeEach(() => {
  llamadas.length = 0;
  filasTexto = [];
  filasItems = [];
});

describe('valorFiltroPostgrest', () => {
  it('pone el valor entre comillas y escapa comillas y barras', () => {
    expect(valorFiltroPostgrest('%vxv2%')).toBe('"%vxv2%"');
    expect(valorFiltroPostgrest('%Calle 69, (apto 2)%')).toBe('"%Calle 69, (apto 2)%"');
    expect(valorFiltroPostgrest('a"b\\c')).toBe('"a\\"b\\\\c"');
  });
});

describe('getOrders con búsqueda', () => {
  it('trae los pedidos por producto en consultas de 100 ids, sin repetir y en orden', async () => {
    filasTexto = [{ id: 'p1', created_at: '2026-11-09T00:00:00Z' }];
    // 250 ítems coinciden, de 250 pedidos distintos; p1 ya vino por texto.
    filasItems = Array.from({ length: 250 }, (_, i) => ({ web_order_id: `p${i + 1}` }));

    const pedidos = await webOrdersService.getOrders({ search: 'queso' });

    const porIds = llamadas.filter((l) => l.tabla === 'web_orders' && l.in);
    expect(porIds).toHaveLength(3);
    expect(Math.max(...porIds.map((l) => l.in![1].length))).toBeLessThanOrEqual(100);
    expect(porIds.flatMap((l) => l.in![1])).not.toContain('p1');
    expect(new Set(pedidos.map((p) => p.id)).size).toBe(250);
    for (let i = 1; i < pedidos.length; i++) {
      expect(pedidos[i - 1].created_at >= pedidos[i].created_at).toBe(true);
    }
    // La búsqueda por texto no lleva ids y va con el valor entre comillas.
    const porTexto = llamadas.find((l) => l.tabla === 'web_orders' && l.or);
    expect(porTexto?.or).toContain('order_number.ilike."%queso%"');
    expect(porTexto?.or).not.toContain('id.in');
    // Los ítems se buscan solo en pedidos de la organización.
    expect(llamadas.find((l) => l.tabla === 'web_order_items')?.eqs).toContainEqual(['pedido.organization_id', 333]);
  });

  it('sin búsqueda hace una sola consulta, sin filtro de texto', async () => {
    filasTexto = [{ id: 'p1', created_at: '2026-11-09T00:00:00Z' }];
    await webOrdersService.getOrders({});
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0].or).toBeUndefined();
  });
});
