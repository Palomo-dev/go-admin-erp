/// <reference types="jest" />
/**
 * Alcance de sucursal en el servidor (`resolverAlcanceSucursal`).
 * Misma regla que `reporte_exigir_alcance_sucursal` en la base. Datos ficticios.
 */
import { calcularAlcance, exigirSucursalPermitida, resolverAlcanceSucursal } from '../alcanceSucursal';

type Resultado = { data: unknown; error: { message: string } | null };

function clienteFalso(tablas: Record<string, Resultado>) {
  const consultadas: string[] = [];
  return {
    consultadas,
    from(tabla: string) {
      consultadas.push(tabla);
      const b: Record<string, unknown> = {};
      for (const m of ['select', 'eq']) b[m] = () => b;
      b.then = (res: (x: Resultado) => void) => res(tablas[tabla] ?? { data: [], error: null });
      return b;
    },
  };
}

const SUCURSALES: Resultado = { data: [{ id: 1 }, { id: 2 }, { id: 3 }], error: null };

describe('calcularAlcance', () => {
  test('admin: todas y acceso total', () => {
    expect(calcularAlcance(true, [1, 2], [1])).toEqual({ esAdmin: true, todas: [1, 2], permitidas: [1, 2], accesoTotal: true });
  });

  test('sin asignaciones: todas y acceso total', () => {
    expect(calcularAlcance(false, [1, 2], [])).toMatchObject({ permitidas: [1, 2], accesoTotal: true });
  });

  test('asignado a una sede: solo esa, sin consolidado', () => {
    expect(calcularAlcance(false, [1, 2, 3], [2])).toMatchObject({ permitidas: [2], accesoTotal: false });
  });

  test('asignado a todas las activas: acceso total', () => {
    expect(calcularAlcance(false, [1, 2], [1, 2, 9])).toMatchObject({ permitidas: [1, 2], accesoTotal: true });
  });
});

describe('exigirSucursalPermitida', () => {
  const restringido = calcularAlcance(false, [1, 2, 3], [2]);

  test('su sucursal pasa', () => {
    expect(() => exigirSucursalPermitida(restringido, 2)).not.toThrow();
  });

  test('otra sucursal → 403 BRANCH_FORBIDDEN', () => {
    expect(() => exigirSucursalPermitida(restringido, 1)).toThrow(expect.objectContaining({ statusCode: 403, code: 'BRANCH_FORBIDDEN' }));
  });

  test('consolidado sin acceso total → 403 BRANCH_SCOPE_REQUIRED', () => {
    expect(() => exigirSucursalPermitida(restringido, null)).toThrow(expect.objectContaining({ statusCode: 403, code: 'BRANCH_SCOPE_REQUIRED' }));
  });

  test('consolidado con acceso total pasa', () => {
    expect(() => exigirSucursalPermitida(calcularAlcance(true, [1, 2], []), null)).not.toThrow();
  });
});

describe('resolverAlcanceSucursal', () => {
  const base = { organizationId: 7, roleId: 5, isSuperAdmin: false, memberId: 40 };

  test('miembro con una sede asignada', async () => {
    const cliente = clienteFalso({ branches: SUCURSALES, member_branches: { data: [{ branch_id: 3 }], error: null } });
    const alcance = await resolverAlcanceSucursal({ ...base, supabase: cliente as never });
    expect(alcance).toMatchObject({ esAdmin: false, permitidas: [3], accesoTotal: false });
  });

  test('admin por role_id no consulta asignaciones', async () => {
    const cliente = clienteFalso({ branches: SUCURSALES });
    const alcance = await resolverAlcanceSucursal({ ...base, roleId: 2, supabase: cliente as never });
    expect(alcance.accesoTotal).toBe(true);
    expect(cliente.consultadas).toEqual(['branches']);
  });

  test('si las asignaciones no se pueden leer, falla en vez de abrir todo', async () => {
    const cliente = clienteFalso({ branches: SUCURSALES, member_branches: { data: null, error: { message: 'x' } } });
    await expect(resolverAlcanceSucursal({ ...base, supabase: cliente as never })).rejects.toThrow(/asignaciones/);
  });

  test('si las sucursales no se pueden leer, falla', async () => {
    const cliente = clienteFalso({ branches: { data: null, error: { message: 'x' } } });
    await expect(resolverAlcanceSucursal({ ...base, supabase: cliente as never })).rejects.toThrow(/sucursales/);
  });
});
