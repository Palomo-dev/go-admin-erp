/**
 * adjustmentService (B2) es una fachada de RPC: no toca tablas y cada acción es
 * UNA llamada a su función SQL (la organización va como parámetro y la RPC la
 * vuelve a validar con la sesión).
 */
import { readFileSync } from 'fs';
import { join } from 'path';

jest.mock('@/lib/supabase/config', () => ({ supabase: { rpc: jest.fn() } }));

import { crearServicioAjustes, ErrorAjuste } from '@/lib/services/adjustmentService';

function clienteFalso(respuestas: Record<string, { data?: unknown; error?: unknown }>) {
  const llamadas: { fn: string; args: Record<string, unknown> }[] = [];
  const rpc = jest.fn((fn: string, args: Record<string, unknown>) => {
    llamadas.push({ fn, args });
    const r = respuestas[fn] ?? { data: null, error: null };
    const promesa = Promise.resolve({ data: r.data ?? null, error: r.error ?? null });
    return Object.assign(promesa, { abortSignal: () => promesa });
  });
  return { cliente: { rpc } as never, llamadas };
}

describe('adjustmentService', () => {
  it('no escribe tablas: solo RPC', () => {
    const src = readFileSync(join(process.cwd(), 'src/lib/services/adjustmentService.ts'), 'utf-8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    expect(src).not.toMatch(/\.from\(/);
    for (const fn of ['fn_ajustes_listado', 'fn_ajuste_detalle', 'fn_ajuste_productos', 'fn_ajuste_guardar', 'fn_ajuste_aplicar', 'fn_ajuste_descartar']) {
      expect(src).toContain(`'${fn}'`);
    }
  });

  it('aplicar manda la clave de idempotencia y normaliza la respuesta', async () => {
    const { cliente, llamadas } = clienteFalso({
      fn_ajuste_aplicar: {
        data: {
          ok: true,
          ya_aplicado: false,
          id: 150,
          code: 'AJ-0150',
          movimientos: 3,
          recalculados: [{ product_id: 104, lot_id: null, nombre: 'Camiseta', sistema_al_guardar: 12, sistema_al_aplicar: '10.000', diferencia: 1 }],
          valor_neto: '-2900.00',
        },
      },
    });
    const r = await crearServicioAjustes(cliente).aplicar(2, 150, 'ajuste-150-x');
    expect(llamadas).toEqual([{ fn: 'fn_ajuste_aplicar', args: { p_org: 2, p_ajuste_id: 150, p_clave_idempotencia: 'ajuste-150-x' } }]);
    expect(r).toEqual({
      ok: true,
      ya_aplicado: false,
      id: 150,
      code: 'AJ-0150',
      movimientos: 3,
      recalculados: [{ product_id: 104, lot_id: null, nombre: 'Camiseta', sistema_al_guardar: 12, sistema_al_aplicar: 10, diferencia: 1 }],
      valor_neto: -2900,
    });
  });

  it('un error de la RPC llega como ErrorAjuste con su código', async () => {
    const { cliente } = clienteFalso({ fn_ajuste_descartar: { error: { message: 'motivo_requerido', code: '22023', details: null } } });
    await expect(crearServicioAjustes(cliente).descartar(2, 1, '')).rejects.toMatchObject({ message: 'motivo_requerido', code: '22023' });
    const { cliente: c2 } = clienteFalso({ fn_ajuste_detalle: { error: { message: 'Acceso denegado a la organización', code: '42501' } } });
    const e = await crearServicioAjustes(c2).detalle(3, 1).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ErrorAjuste);
    expect((e as ErrorAjuste).sinPermiso).toBe(true);
  });

  it('listado: números y permisos normalizados; sin costos el impacto es null', async () => {
    const { cliente, llamadas } = clienteFalso({
      fn_ajustes_listado: {
        data: {
          filas: [
            {
              id: 146,
              codigo: 'AJ-0146',
              fecha: '2026-09-17T21:07:48+00:00',
              creado: '2026-09-17T21:07:48+00:00',
              aplicado: null,
              autor: 'Ana',
              sucursal: { id: 119, nombre: 'Principal' },
              tipo: 'entrada',
              modo: 'conteo',
              razon: 'physical_count',
              notas: null,
              estado: 'draft',
              productos: 1,
              diferencia: '190.000',
              unidad: 'GR',
              impacto: null,
            },
          ],
          total: 57,
          kpis: { total: 57, mes: 57, sucursales_mes: 1, borradores: 1, borrador_mas_antiguo_dias: 12, aplicados: 56, descartados: 0, impacto_mes: null },
          permisos: { ver: true, ajustar: false, costos: false },
          hoy: '2026-09-29',
          zona: 'America/Bogota',
        },
      },
    });
    const r = await crearServicioAjustes(cliente).listar(144, { estados: ['draft'], desde: 0, limite: 25 });
    expect(llamadas[0]).toEqual({ fn: 'fn_ajustes_listado', args: { p_org: 144, p_filtros: { estados: ['draft'], desde: 0, limite: 25 } } });
    expect(r.filas[0]).toMatchObject({ id: 146, diferencia: 190, impacto: null, estado: 'draft', modo: 'conteo' });
    expect(r.permisos).toMatchObject({ ver: true, ajustar: false, costos: false, resueltos: true });
    expect(r.kpis.impacto_mes).toBeNull();
  });

  it('productos por ids manda p_ids; sin ids, null', async () => {
    const { cliente, llamadas } = clienteFalso({ fn_ajuste_productos: { data: [] } });
    const s = crearServicioAjustes(cliente);
    await s.productos(2, 3, { ids: [7, 8] });
    await s.productos(2, 3, { texto: 'cami' });
    expect(llamadas.map((l) => l.args)).toEqual([
      { p_org: 2, p_branch: 3, p_texto: null, p_ids: [7, 8], p_limite: 30 },
      { p_org: 2, p_branch: 3, p_texto: 'cami', p_ids: null, p_limite: 30 },
    ]);
  });
});
