/**
 * Árbol del kit (`kit/arbol.ts`): lo que decide qué filas ve la persona en un
 * listado jerárquico. Cada caso es uno de los fallos del árbol viejo de
 * categorías (AUDITORIA-CATALOGO-PRODUCCION.md §2).
 */
import {
  ancestrosDe,
  aplanarArbol,
  construirArbol,
  descendientesDe,
  filtrarArbol,
  idsConHijos,
  normalizarBusqueda,
  paginarRaices,
} from '../arbol';

interface Cat {
  id: number;
  parentId: number | null;
  nombre: string;
  orden: number;
}

// Bebidas(1) › Calientes(2) › Café(3)
//            › Frías(4)
// Panadería(5) › Pan(6)
// Calzado(7)
const CATS: Cat[] = [
  { id: 3, parentId: 2, nombre: 'Café de origen', orden: 1 },
  { id: 1, parentId: null, nombre: 'Bebidas', orden: 1 },
  { id: 2, parentId: 1, nombre: 'Bebidas calientes', orden: 1 },
  { id: 4, parentId: 1, nombre: 'Bebidas frías', orden: 2 },
  { id: 5, parentId: null, nombre: 'Panadería', orden: 2 },
  { id: 6, parentId: 5, nombre: 'Pan artesanal', orden: 1 },
  { id: 7, parentId: null, nombre: 'Calzado', orden: 3 },
];
const porOrden = (a: Cat, b: Cat) => a.orden - b.orden;

describe('construirArbol', () => {
  test('arma niveles y ordena hermanas', () => {
    const raices = construirArbol(CATS, porOrden);
    expect(raices.map((r) => r.dato.id)).toEqual([1, 5, 7]);
    expect(raices[0].hijos.map((h) => h.dato.id)).toEqual([2, 4]);
    expect(raices[0].hijos[0].hijos[0].nivel).toBe(2);
  });

  test('un hijo huérfano sube a la raíz en lugar de perderse', () => {
    const raices = construirArbol([...CATS, { id: 9, parentId: 99, nombre: 'Huérfana', orden: 9 }], porOrden);
    expect(raices.map((r) => r.dato.id)).toContain(9);
  });

  test('un ciclo en los datos no cuelga el recorrido', () => {
    const conCiclo: Cat[] = [
      { id: 1, parentId: 2, nombre: 'A', orden: 1 },
      { id: 2, parentId: 1, nombre: 'B', orden: 2 },
    ];
    const raices = construirArbol(conCiclo, porOrden);
    const filas = aplanarArbol(raices, { abiertos: new Set([1, 2]) });
    expect(filas.length).toBeGreaterThan(0);
    expect(filas.length).toBeLessThanOrEqual(2);
  });
});

describe('descendientes y ancestros', () => {
  test('los descendientes salen del árbol completo, no de la página', () => {
    expect([...descendientesDe(CATS, [1])].sort()).toEqual([2, 3, 4]);
    expect(descendientesDe(CATS, [7]).size).toBe(0);
  });

  test('varios orígenes: no se cuentan a sí mismos', () => {
    expect([...descendientesDe(CATS, [1, 2])].sort()).toEqual([3, 4]);
  });

  test('ruta de ancestros de la raíz al padre', () => {
    expect(ancestrosDe(CATS, 3).map((c) => c.id)).toEqual([1, 2]);
    expect(ancestrosDe(CATS, 1)).toEqual([]);
  });

  test('ids con hijos para «Expandir todo»', () => {
    expect([...idsConHijos(CATS)].sort()).toEqual([1, 2, 5]);
  });
});

describe('búsqueda que entra en ramas cerradas', () => {
  const raices = construirArbol(CATS, porOrden);
  const buscar = (t: string) => (c: Cat) => normalizarBusqueda(c.nombre).includes(normalizarBusqueda(t));

  test('encuentra una nieta aunque todo esté cerrado y abre su camino', () => {
    const r = filtrarArbol(raices, buscar('cafe'));
    const filas = aplanarArbol(r.raices, {
      abiertos: new Set(),
      abiertasPorBusqueda: r.abiertasPorBusqueda,
      coincidencias: r.coincidencias,
    });
    expect(filas.map((f) => f.dato.id)).toEqual([1, 2, 3]);
    expect(filas.map((f) => f.contexto)).toEqual([true, true, false]);
  });

  test('una rama cerrada a mano durante la búsqueda se respeta', () => {
    const r = filtrarArbol(raices, buscar('cafe'));
    const filas = aplanarArbol(r.raices, {
      abiertos: new Set(),
      abiertasPorBusqueda: r.abiertasPorBusqueda,
      cerradosAMano: new Set([2]),
      coincidencias: r.coincidencias,
    });
    expect(filas.map((f) => f.dato.id)).toEqual([1, 2]);
  });

  test('sin criterio devuelve el bosque entero', () => {
    const r = filtrarArbol(raices, null);
    expect(r.raices).toHaveLength(3);
    expect(r.coincidencias.size).toBe(CATS.length);
  });

  test('sin tildes ni mayúsculas', () => {
    expect(normalizarBusqueda('  PANADERÍA ')).toBe('panaderia');
  });
});

describe('paginación por raíces', () => {
  test('un padre y sus hijas nunca quedan en páginas distintas', () => {
    const raices = construirArbol(CATS, porOrden);
    const pagina1 = paginarRaices(raices, 1, 1);
    const filas = aplanarArbol(pagina1, { abiertos: new Set([1, 2]) });
    expect(filas.map((f) => f.dato.id)).toEqual([1, 2, 3, 4]);
    expect(paginarRaices(raices, 2, 2).map((r) => r.dato.id)).toEqual([7]);
  });

  test('tamaño 0 = todas', () => {
    expect(paginarRaices(construirArbol(CATS), 1, 0)).toHaveLength(3);
  });
});
