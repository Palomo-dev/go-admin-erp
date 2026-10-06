/**
 * Roles y permisos — lógica pura (Figma «13. Equipo › Roles y permisos»):
 * matriz por módulo × acción, cambios sin guardar, conflicto al guardar,
 * origen de los permisos efectivos y comparación. Catálogo ficticio con la
 * forma real de `permissions` (código, módulo, nombre, descripción).
 */
import {
  accionDe,
  agruparPorModulo,
  alternarGrupo,
  clasificarCatalogo,
  estadoCasilla,
  filtrarModulos,
  sensibilidadDe,
  type PermisoCatalogo,
} from '../matrizPermisos';
import { calcularCambios, deltaModulo, deshacerCambio, mismosIds, resolverConflicto } from '../cambios';
import { agruparEfectivos, anotarOrigenes, contarOrigenes, explicar } from '../permisosEfectivos';
import { compararRoles, diferenciaContraPrimero } from '../comparar';

const CATALOGO: PermisoCatalogo[] = clasificarCatalogo([
  { id: 1, code: 'pos.view', module: 'pos', name: 'View', description: 'Ver el punto de venta' },
  { id: 2, code: 'pos.create', module: 'pos', name: 'Create', description: 'Crear ventas' },
  { id: 3, code: 'pos.refund', module: 'pos', name: 'Refund', description: 'Devolver una venta' },
  { id: 4, code: 'pos.delete', module: 'pos', name: 'Delete', description: 'Eliminar ventas' },
  { id: 5, code: 'inventory.view', module: 'inventory', name: 'View', description: 'Ver inventario' },
  { id: 6, code: 'inventory_management', module: 'inventory', name: 'inventory_management', description: null },
  { id: 7, code: 'hr.leaves.approve', module: 'hr', name: 'Approve', description: 'Aprobar permisos de ausencia' },
  { id: 8, code: 'roles.edit', module: 'roles', name: 'Edit', description: 'Editar roles' },
  { id: 9, code: 'finance.view', module: 'finance', name: 'View', description: 'Ver finanzas' },
]);
const S = (...ids: number[]) => new Set(ids);

describe('matriz: acción y sensibilidad derivadas del código', () => {
  test('el último segmento da la acción; los heredados sin verbo van a «otros»', () => {
    expect(accionDe('pos.view')).toBe('ver');
    expect(accionDe('hr.leaves.approve')).toBe('aprobar');
    expect(accionDe('crm.calls.view_all')).toBe('ver');
    expect(accionDe('inventory_management')).toBe('otros');
    expect(accionDe('pos.refund')).toBe('otros');
  });

  test('dinero > acceso > eliminar', () => {
    expect(sensibilidadDe('pos.refund', 'pos')).toBe('dinero');
    expect(sensibilidadDe('finance.view', 'finance')).toBe('dinero');
    expect(sensibilidadDe('finance.delete', 'finance')).toBe('dinero');
    expect(sensibilidadDe('roles.edit', 'roles')).toBe('acceso');
    expect(sensibilidadDe('pos.delete', 'pos')).toBe('eliminar');
    expect(sensibilidadDe('pos.view', 'pos')).toBeNull();
  });

  test('agrupa por módulo con ids por columna y marca el módulo sensible', () => {
    const pos = agruparPorModulo(CATALOGO).find((m) => m.modulo === 'pos')!;
    expect(pos.porAccion.ver).toEqual([1]);
    expect(pos.porAccion.crear).toEqual([2]);
    expect(pos.porAccion.eliminar).toEqual([4]);
    expect(pos.porAccion.aprobar).toEqual([]);
    expect(pos.sensible).toBe(true);
  });
});

describe('matriz: casilla «todo el módulo» con parcial', () => {
  test('todo · parcial · nada · vacío', () => {
    expect(estadoCasilla([1, 2], S(1, 2))).toBe('todo');
    expect(estadoCasilla([1, 2], S(1))).toBe('parcial');
    expect(estadoCasilla([1, 2], S())).toBe('nada');
    expect(estadoCasilla([], S(1))).toBe('vacio');
  });

  test('alternar un grupo parcial lo marca entero; entero, lo desmarca; no toca lo bloqueado', () => {
    expect([...alternarGrupo(S(1), [1, 2, 3])].sort()).toEqual([1, 2, 3]);
    expect([...alternarGrupo(S(1, 2, 3, 9), [1, 2, 3])]).toEqual([9]);
    // En el editor de cargo, lo que da el rol (bloqueado) no entra en la selección del cargo.
    expect([...alternarGrupo(S(), [1, 2], S(1))]).toEqual([2]);
  });

  test('la búsqueda ignora tildes y un módulo que coincide conserva todos sus permisos', () => {
    const modulos = agruparPorModulo(CATALOGO);
    const porPermiso = filtrarModulos(modulos, S(), { termino: 'devolucion venta' });
    expect(porPermiso).toHaveLength(0);
    const devolver = filtrarModulos(modulos, S(), { termino: 'DEVOLVER' });
    expect(devolver.map((m) => m.permisos.map((p) => p.id))).toEqual([[3]]);
    const modulo = filtrarModulos(modulos, S(), { termino: 'pos' });
    expect(modulo.find((m) => m.modulo === 'pos')?.permisos).toHaveLength(4);
    const concedidos = filtrarModulos(modulos, S(5), { soloConcedidos: true });
    expect(concedidos.map((m) => m.modulo)).toEqual(['inventory']);
    const sensibles = filtrarModulos(modulos, S(), { soloSensibles: true });
    expect(sensibles.flatMap((m) => m.permisos.map((p) => p.id)).sort()).toEqual([3, 4, 8, 9]);
  });
});

describe('cambios sin guardar', () => {
  test('añadidos, quitados y sensibles; deshacer y delta por módulo', () => {
    const c = calcularCambios(S(1, 4), S(1, 3, 5), CATALOGO);
    expect(c.anadidos.map((p) => p.id).sort()).toEqual([3, 5]);
    expect(c.quitados.map((p) => p.id)).toEqual([4]);
    expect(c.sensibles.map((s) => [s.permiso.id, s.tipo])).toEqual([
      [3, 'anadido'],
      [4, 'quitado'],
    ]);
    expect(c.total).toBe(3);
    expect(deltaModulo([1, 2, 3, 4], S(1, 4), S(1, 3, 5))).toBe(0);
    expect([...deshacerCambio(S(1, 3, 5), S(1, 4), 3)].sort()).toEqual([1, 5]);
    expect([...deshacerCambio(S(1, 3, 5), S(1, 4), 4)].sort()).toEqual([1, 3, 4, 5]);
  });

  test('comparar conjuntos no ordena ni muta (antes hasChanges() hacía .sort() en el render)', () => {
    const a = S(3, 1);
    expect(mismosIds(a, S(1, 3))).toBe(true);
    expect([...a]).toEqual([3, 1]);
    expect(mismosIds(a, S(1))).toBe(false);
  });
});

describe('conflicto al guardar', () => {
  test('mis cambios se reaplican sobre la versión de la otra persona y se avisan los choques', () => {
    const base = S(1, 2);
    const mio = S(1, 2, 3); // yo añadí 3
    const suyo = S(1, 4); // la otra persona quitó 2 y añadió 4
    const c = resolverConflicto(base, mio, suyo, CATALOGO);
    expect([...c.rebasado].sort()).toEqual([1, 3, 4]);
    expect(c.suyos.anadidos.map((p) => p.id)).toEqual([4]);
    expect(c.suyos.quitados.map((p) => p.id)).toEqual([2]);
    expect(c.choques).toEqual([]);
  });

  test('si los dos hicieron lo mismo, no se duplica; lo que la otra persona añadió se conserva', () => {
    const c = resolverConflicto(S(1, 2), S(1), S(1, 7), CATALOGO); // los dos quitamos 2; ella añadió 7
    expect([...c.rebasado].sort()).toEqual([1, 7]);
    expect(c.mios.total).toBe(1);
    expect(c.suyos.total).toBe(2);
    expect(c.choques).toEqual([]);
  });
});

describe('«¿Qué puede hacer?»: el origen se ANOTA, no se decide', () => {
  const codigo = (id: number) => CATALOGO.find((p) => p.id === id)!.codigo;

  test('lo efectivo lo dice el servidor; rol, cargo o ambos', () => {
    const permisos = anotarOrigenes({
      catalogo: CATALOGO,
      efectivos: new Set([codigo(1), codigo(2), codigo(5)]),
      codigosRol: new Set([codigo(1), codigo(2)]),
      cargo: new Map([
        [codigo(2), true],
        [codigo(5), true],
      ]),
    });
    const de = (id: number) => permisos.find((p) => p.permiso.id === id)!;
    expect(de(1).origenes).toEqual(['rol']);
    expect(de(2).origenes).toEqual(['rol', 'cargo']);
    expect(de(5).origenes).toEqual(['cargo']);
    expect(de(3).concedido).toBe(false);
    expect(explicar(de(3))).toEqual({ tipo: 'noPuede', motivo: 'ningunoLoDa', sensible: true });
    expect(contarOrigenes(permisos, new Set([codigo(1), codigo(2)]))).toEqual({ rol: 2, cargoSuma: 1, cargoQuita: 0, total: 3 });
  });

  test('si la base dice que no (cargo con allowed = false) se explica, sin recalcular la precedencia', () => {
    const permisos = anotarOrigenes({
      catalogo: CATALOGO,
      efectivos: new Set([codigo(1)]),
      codigosRol: new Set([codigo(1), codigo(4)]),
      cargo: new Map([[codigo(4), false]]),
    });
    const quitado = permisos.find((p) => p.permiso.id === 4)!;
    expect(quitado.concedido).toBe(false);
    expect(quitado.quitadoPorCargo).toBe(true);
    expect(explicar(quitado)).toEqual({ tipo: 'noPuede', motivo: 'cargoLoQuita', sensible: true });
    expect(contarOrigenes(permisos, new Set([codigo(1), codigo(4)])).cargoQuita).toBe(1);
  });

  test('un permiso que el rol dice dar pero la base no devuelve NO se pinta como concedido', () => {
    const permisos = anotarOrigenes({ catalogo: CATALOGO, efectivos: new Set(), codigosRol: new Set([codigo(1)]), cargo: new Map() });
    expect(permisos.every((p) => !p.concedido && p.origenes.length === 0)).toBe(true);
  });

  test('acceso total (admin): todo concedido con origen «admin»; agrupado por módulo', () => {
    const permisos = anotarOrigenes({ catalogo: CATALOGO, efectivos: 'todos', codigosRol: new Set(), cargo: new Map() });
    expect(permisos.every((p) => p.concedido && p.origenes[0] === 'admin')).toBe(true);
    const grupos = agruparEfectivos(permisos);
    expect(grupos.map((g) => g.modulo)).toEqual(['finance', 'hr', 'inventory', 'pos', 'roles']);
    expect(grupos.find((g) => g.modulo === 'pos')?.concedidos).toBe(4);
  });
});

describe('comparar roles', () => {
  test('filas por módulo, «solo diferencias» y lo que cada rol suma sobre el primero', () => {
    const roles = [
      { id: 4, permisoIds: [1, 5] },
      { id: 5, permisoIds: [1, 2, 5, 7] },
    ];
    const todos = compararRoles(roles, CATALOGO);
    expect(todos.flatMap((g) => g.filas.map((f) => f.permiso.id)).sort()).toEqual([1, 2, 5, 7]);
    const diferencias = compararRoles(roles, CATALOGO, { soloDiferencias: true });
    expect(diferencias.flatMap((g) => g.filas.map((f) => [f.permiso.id, f.tiene]))).toEqual(
      expect.arrayContaining([
        [2, [false, true]],
        [7, [false, true]],
      ]),
    );
    expect(diferencias.flatMap((g) => g.filas)).toHaveLength(2);
    expect(diferenciaContraPrimero(roles)).toEqual([0, 2]);
  });
});
