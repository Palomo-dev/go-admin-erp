import { CLAVES_CONTABLES, DEFINICIONES_CLAVE, type DefinicionClave } from '../configuracionContable';
import { GRUPOS_ABIERTOS, definicionesPorGrupo, origenDeClave } from '../configuracionGrupos';

describe('definicionesPorGrupo', () => {
  const claves = definicionesPorGrupo().flatMap((g) => g.definiciones.map((d) => d.clave));

  test('ninguna clave se pierde ni se repite', () => {
    expect([...claves].sort()).toEqual([...CLAVES_CONTABLES].sort());
    expect(new Set(claves).size).toBe(claves.length);
  });

  test('conserva las 31 claves y redondeo_en_contra', () => {
    expect(claves).toHaveLength(32);
    expect(claves).toContain('redondeo_en_contra');
  });

  test('Tesorería y Cartera van juntas, y Ventas lleva los dos redondeos', () => {
    const grupos = Object.fromEntries(definicionesPorGrupo().map((g) => [g.grupo, g.definiciones.map((d) => d.clave)]));
    expect(grupos.tesoreria_cartera).toEqual(expect.arrayContaining(['caja', 'bancos', 'clientes', 'proveedores', 'anticipos']));
    expect(grupos.ventas).toEqual(expect.arrayContaining(['ventas_productos', 'redondeo', 'redondeo_en_contra']));
  });

  test('un grupo desconocido no hace desaparecer la clave', () => {
    const rara: DefinicionClave = { ...DEFINICIONES_CLAVE[0], grupo: 'Otro' };
    expect(definicionesPorGrupo([rara]).flatMap((g) => g.definiciones)).toHaveLength(1);
  });

  test('Figma: dos grupos abiertos', () => {
    expect(GRUPOS_ABIERTOS).toEqual(['tesoreria_cartera', 'ventas']);
  });
});

describe('origenDeClave', () => {
  const filas = [{ clave: 'caja' as const, account_code: '1105', branch_id: null }];
  const propuesta = { caja: '1105' };

  test('sin fila: la regla', () => {
    expect(origenDeClave({ clave: 'bancos', valor: null, branchId: null, filas, propuesta })).toBe('regla');
  });
  test('igual a la propuesta del sector', () => {
    expect(origenDeClave({ clave: 'caja', valor: '1105', branchId: null, filas, propuesta })).toBe('sector');
  });
  test('distinta de la propuesta: la eligió el contador', () => {
    expect(origenDeClave({ clave: 'caja', valor: '110505', branchId: null, filas, propuesta })).toBe('contador');
  });
  test('alcance por sede: la propia y la heredada', () => {
    expect(origenDeClave({ clave: 'caja', valor: '110505', branchId: 3, filas, propuesta })).toBe('sede');
    expect(origenDeClave({ clave: 'caja', valor: null, branchId: 3, filas, propuesta })).toBe('hereda');
    expect(origenDeClave({ clave: 'bancos', valor: null, branchId: 3, filas, propuesta })).toBe('regla');
  });
});
