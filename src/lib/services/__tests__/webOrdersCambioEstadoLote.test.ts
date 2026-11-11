/// <reference types="jest" />
/**
 * Cambio de estado en lote del listado de Pedidos Online.
 *
 * Bug que impide reincidir (org 333, 2026-11-11): «En preparación» sobre cientos
 * de pedidos lanzaba todos los UPDATE a la vez, cada uno releía el pedido con sus
 * ítems y disparaba su aviso. La conexión se saturaba y las lecturas se cancelaban
 * (AbortError). Ahora va de 4 en 4, sin releer, y un fallo no detiene el lote.
 */

const enVuelo = { actual: 0, maximo: 0 };
const actualizados: string[] = [];
const releidos: string[] = [];
let falla: Set<string> = new Set();

function consultaUpdate() {
  let id = '';
  const q = {
    update: () => q,
    eq: (col: string, valor: string) => {
      if (col === 'id') id = valor;
      return q;
    },
    then: (resolver: (r: { error: unknown }) => unknown) => {
      enVuelo.actual++;
      enVuelo.maximo = Math.max(enVuelo.maximo, enVuelo.actual);
      return new Promise((listo) => setTimeout(listo, 5)).then(() => {
        enVuelo.actual--;
        actualizados.push(id);
        return resolver({ error: falla.has(id) ? { message: 'falló' } : null });
      });
    },
  };
  return q;
}

jest.mock('@/lib/supabase/config', () => ({
  supabase: {
    from: (tabla: string) => {
      if (tabla !== 'web_orders') throw new Error(`tabla inesperada ${tabla}`);
      const q = consultaUpdate();
      return {
        ...q,
        select: () => {
          releidos.push('select');
          return q;
        },
      };
    },
  },
}));
jest.mock('@/lib/hooks/useOrganization', () => ({ getOrganizationId: () => 333 }));
jest.mock('@/lib/services/stockMovementService', () => ({ stockMovementService: {} }));
jest.mock('@/lib/services/serialTrackingService', () => ({ serialTrackingService: {} }));

import { webOrdersService } from '../webOrdersService';

const avisos: string[] = [];

beforeEach(() => {
  enVuelo.actual = 0;
  enVuelo.maximo = 0;
  actualizados.length = 0;
  releidos.length = 0;
  avisos.length = 0;
  falla = new Set();
  jest
    .spyOn(webOrdersService, 'avisarCambioEstado')
    .mockImplementation(async (id: string) => {
      avisos.push(id);
    });
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => jest.restoreAllMocks());

describe('cambiarEstadoVarios', () => {
  it('cambia 300 pedidos de 4 en 4, sin releer ninguno, y avisa a cada cliente', async () => {
    const ids = Array.from({ length: 300 }, (_, i) => `p${i}`);
    const progreso: number[] = [];
    const r = await webOrdersService.cambiarEstadoVarios(ids, 'preparing', { onProgreso: (n) => progreso.push(n) });

    expect(r.cambiados).toHaveLength(300);
    expect(r.fallidos).toHaveLength(0);
    expect(new Set(actualizados).size).toBe(300);
    expect(enVuelo.maximo).toBeLessThanOrEqual(4);
    expect(releidos).toHaveLength(0);
    expect(new Set(avisos).size).toBe(300);
    expect(progreso[progreso.length - 1]).toBe(300);
  });

  it('un pedido que falla no detiene el lote y vuelve en fallidos', async () => {
    falla = new Set(['p2', 'p5']);
    const ids = Array.from({ length: 8 }, (_, i) => `p${i}`);
    const r = await webOrdersService.cambiarEstadoVarios(ids, 'ready');

    expect(r.cambiados.sort()).toEqual(['p0', 'p1', 'p3', 'p4', 'p6', 'p7']);
    expect(r.fallidos.map((f) => f.id).sort()).toEqual(['p2', 'p5']);
    expect(avisos).not.toContain('p2');
  });
});
