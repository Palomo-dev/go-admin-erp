/**
 * Cajas del POS: arqueo con el esperado del servidor
 * (docs/design/POS-PARIDAD-PAGINAS-SECUNDARIAS.md §5 K-1).
 *
 * Antes: «Guardar arqueo» fallaba SIEMPRE (el insert mandaba
 * `cash_counts.difference`, columna GENERATED → Postgres 428C9; 0 arqueos en
 * la base) y comparaba efectivo + tarjeta + … contra el esperado de efectivo.
 */
import * as fs from 'fs';
import * as path from 'path';
import { diferenciaEfectivo, parametrosArqueo } from '@/lib/pos/cajas/arqueo';

const SRC = path.resolve(__dirname, '..', '..');
const leer = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');

describe('parametrosArqueo: el navegador solo manda lo contado', () => {
  test('efectivo aparte, otros métodos por código, sin esperado ni diferencia', () => {
    const p = parametrosArqueo(6, {
      count_type: 'partial',
      counted_amount: 150000,
      counted_by_method: { card: 20000, nequi: 0, cash: 999, transfer: 5000.456 },
      denominations: { bills: { '50000': 3 } },
      notes: 'turno mañana',
    });
    expect(p).toEqual({
      p_session_id: 6,
      p_tipo: 'partial',
      p_efectivo_contado: 150000,
      p_contado_por_metodo: { card: 20000, transfer: 5000.46 },
      p_denominaciones: { bills: { '50000': 3 } },
      p_notas: 'turno mañana',
    });
    expect(JSON.stringify(p)).not.toMatch(/expected|difference|esperado|diferencia/);
  });

  test('descarta montos negativos o no numéricos y notas vacías', () => {
    const p = parametrosArqueo(1, {
      count_type: 'closing',
      counted_amount: 0,
      counted_by_method: { card: -5, pse: Number.NaN },
      denominations: {},
      notes: '   ',
    });
    expect(p.p_contado_por_metodo).toEqual({});
    expect(p.p_denominaciones).toBeNull();
    expect(p.p_notas).toBeNull();
  });

  test('rechaza caja, tipo o efectivo inválidos', () => {
    expect(() => parametrosArqueo(0, { count_type: 'partial', counted_amount: 1 })).toThrow();
    expect(() => parametrosArqueo(-3, { count_type: 'partial', counted_amount: 1 })).toThrow();
    // @ts-expect-error tipo inválido a propósito
    expect(() => parametrosArqueo(1, { count_type: 'otro', counted_amount: 1 })).toThrow();
    expect(() => parametrosArqueo(1, { count_type: 'partial', counted_amount: -1 })).toThrow();
  });

  test('diferencia del efectivo = contado − esperado, redondeada a centavos', () => {
    expect(diferenciaEfectivo(150000, 1215900)).toBe(-1065900);
    expect(diferenciaEfectivo(100.1, 100)).toBe(0.1);
    expect(diferenciaEfectivo(50, 50)).toBe(0);
  });
});

describe('CajasService.createCashCount va por la RPC del servidor', () => {
  const mockRpc = jest.fn();
  beforeAll(() => {
    jest.resetModules();
  });

  test('llama a pos_caja_registrar_arqueo y nunca inserta en cash_counts', async () => {
    const from = jest.fn();
    jest.doMock('@/lib/supabase/config', () => ({ supabase: { rpc: mockRpc, from } }));
    jest.doMock('@/lib/hooks/useOrganization', () => ({
      getOrganizationId: () => 113,
      getCurrentBranchId: () => 83,
      getBranchFilter: () => null,
      getCurrentUserId: async () => 'u-1',
    }));
    mockRpc.mockResolvedValue({ data: { id: 1, counted_amount: 10, expected_amount: 12, difference: -2 }, error: null });
    const { CajasService } = await import('@/components/pos/cajas/CajasService');
    const r = await CajasService.createCashCount(6, { count_type: 'partial', counted_amount: 10, counted_by_method: { card: 3 } });
    expect(mockRpc).toHaveBeenCalledWith('pos_caja_registrar_arqueo', expect.objectContaining({
      p_session_id: 6, p_tipo: 'partial', p_efectivo_contado: 10, p_contado_por_metodo: { card: 3 },
    }));
    expect(from).not.toHaveBeenCalled();
    expect(r.difference).toBe(-2);
  });
});

describe('Guardarraíles del arqueo', () => {
  test('ningún insert a cash_counts manda difference (columna GENERATED)', () => {
    const archivos = [
      'components/pos/cajas/CajasService.ts',
      'components/pos/ventas/VentasService.ts',
      'lib/offline/cashSync.ts',
    ];
    for (const rel of archivos) {
      const src = leer(rel);
      const bloques = src.split(/\.from\(\s*'cash_counts'\s*\)/).slice(1);
      for (const bloque of bloques) {
        const hastaCierre = bloque.slice(0, bloque.indexOf(';') + 1);
        if (/\.(insert|upsert)\(/.test(hastaCierre)) {
          expect({ rel, manda: /\bdifference\s*:/.test(hastaCierre) }).toEqual({ rel, manda: false });
        }
      }
    }
  });
});
