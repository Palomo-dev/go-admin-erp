/**
 * Zonas del campo «Zonas visibles» (entidad `zone`, reserva con plano de mesas): se juntan por
 * nombre los recuadros del plano y las mesas, con sus sedes y las mesas reservables en la web.
 */
import { listarZonasRestaurante, unirZonas } from '../zonasRestauranteService';

const sedes = new Map([
  [1, 'Sede Laureles'],
  [2, 'Sede Envigado'],
]);

describe('unirZonas', () => {
  test('junta recuadros y mesas por nombre sin distinguir mayúsculas, en orden de dibujo', () => {
    const zonas = unirZonas(
      [
        { zone_name: 'Terraza', branch_id: 1, sort_order: 2 },
        { zone_name: 'Salón', branch_id: 1, sort_order: 1 },
      ],
      [
        { zone: 'salón', branch_id: 1, is_web_bookable: true },
        { zone: 'Salón', branch_id: 2, is_web_bookable: false },
        { zone: 'Barra', branch_id: 2, is_web_bookable: true },
        { zone: '  ', branch_id: 2, is_web_bookable: true },
      ],
      sedes,
    );
    expect(zonas.map((z) => z.nombre)).toEqual(['Salón', 'Terraza', 'Barra']);
    expect(zonas[0]).toEqual({ nombre: 'Salón', sedes: [{ id: 1, nombre: 'Sede Laureles' }, { id: 2, nombre: 'Sede Envigado' }], mesasWeb: 1 });
    expect(zonas[1].mesasWeb).toBe(0);
  });

  test('una sede que no es de la organización no se nombra', () => {
    expect(unirZonas([{ zone_name: 'Patio', branch_id: 99, sort_order: null }], [], sedes)[0].sedes).toEqual([]);
  });
});

describe('listarZonasRestaurante', () => {
  test('filtra todo por la organización (y por las sedes pedidas)', async () => {
    const llamadas: { tabla: string; filtros: unknown[][] }[] = [];
    const consulta = (tabla: string, data: unknown[]) => {
      const reg = { tabla, filtros: [] as unknown[][] };
      llamadas.push(reg);
      const q: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'in', 'not']) {
        q[m] = (...args: unknown[]) => {
          reg.filtros.push([m, ...args]);
          return q;
        };
      }
      q.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data, error: null }).then(ok);
      return q;
    };
    const datos: Record<string, unknown[]> = {
      restaurant_zone_layouts: [{ zone_name: 'Salón', branch_id: 1, sort_order: 1 }],
      restaurant_tables: [{ zone: 'Salón', branch_id: 1, is_web_bookable: true }],
      branches: [{ id: 1, name: 'Sede Laureles' }],
    };
    const cliente = { from: (t: string) => consulta(t, datos[t]) } as unknown as Parameters<typeof listarZonasRestaurante>[0];
    const zonas = await listarZonasRestaurante(cliente, 120, [1]);
    expect(zonas).toEqual([{ nombre: 'Salón', sedes: [{ id: 1, nombre: 'Sede Laureles' }], mesasWeb: 1 }]);
    for (const l of llamadas) expect(l.filtros).toContainEqual(['eq', 'organization_id', 120]);
    expect(llamadas.filter((l) => l.tabla !== 'branches').every((l) => l.filtros.some((f) => f[0] === 'in' && f[1] === 'branch_id'))).toBe(true);
  });
});
