/**
 * Bloque B1: fachada del kardex (fn_kardex_saldo_corrido y fn_kardex_descuadres).
 */
import { aRespuestaKardex, descuadres, listarKardex } from '@/lib/services/kardexService';

jest.mock('@/lib/supabase/config', () => ({ supabase: { rpc: jest.fn() } }));

function clienteQueDevuelve(data: unknown, error: unknown = null) {
  return { rpc: jest.fn().mockResolvedValue({ data, error }) };
}

describe('kardexService', () => {
  it('kardex: saldo y cuadre', () => {
    const r = aRespuestaKardex({
      total: 1,
      costos: true,
      kpis: { entradas: '10', salidas: 0, saldo_cierre: '10', existencias: '29', valor: '4999.89', costo_promedio: '172.41' },
      cuadre: { total: 1, diferencia_total: '19', saldo_kardex: 10, existencias: 29, sin_historia: 0, pares: [{ product_id: 11, diferencia: '19' }] },
      filas: [{ id: 1, direccion: 'in', cantidad: '5.000', saldo: '10.000', source: 'adjustment', source_id: '161' }],
    });
    expect(r.kpis).toMatchObject({ saldo_cierre: 10, existencias: 29, valor: 4999.89 });
    expect(r.cuadre.pares[0].diferencia).toBe(19);
    expect(r.filas[0]).toMatchObject({ saldo: 10, cantidad: 5, source_id: '161', direccion: 'in' });
  });


  it('manda los filtros sin vacíos y lanza el error de la RPC', async () => {
    const c = clienteQueDevuelve({ total: 0, filas: [], kpis: {}, cuadre: {} });
    await listarKardex(3, { producto: 11, origenes: [], busqueda: '', sucursales: [2] }, 50, 25, c);
    expect(c.rpc).toHaveBeenCalledWith('fn_kardex_saldo_corrido', { p_org: 3, p_filtros: { producto: 11, sucursales: [2] }, p_desde: 50, p_limite: 25 });
    const d = clienteQueDevuelve({ total: '2', pares: [] });
    await expect(descuadres(3, { sucursales: [2] }, 10, d)).resolves.toMatchObject({ total: 2, pares: [] });
    expect(d.rpc).toHaveBeenCalledWith('fn_kardex_descuadres', { p_org: 3, p_filtros: { sucursales: [2] }, p_limite: 10 });
    const e = clienteQueDevuelve(null, { message: 'sin_permiso', code: '42501' });
    await expect(listarKardex(3, {}, 0, 25, e)).rejects.toMatchObject({ code: '42501' });
  });
});
