/**
 * Permisos efectivos legibles — lógica pura. Catálogo ficticio con la forma
 * real de `permissions` (verificada por MCP): nombres en inglés o con forma de
 * código y descripciones en español con «Permite …».
 */
import { agruparPermisos, nombreLegible, type FilaPermiso } from '../permisosEfectivos';

const CATALOGO: FilaPermiso[] = [
  { code: 'pos.cajas.cerrar_ajenas', name: 'Cerrar cajas de otros cajeros', description: 'Cerrar una caja del POS que abrió otra persona', module: 'pos' },
  { code: 'pos_access', name: 'pos_access', description: 'Acceso a punto de venta', module: 'sales' },
  { code: 'pos.vender', name: 'Vender', description: 'Permite vender en el POS.', module: 'pos' },
  { code: 'branches.create', name: 'Create', description: 'Crear sucursales', module: 'branches' },
  { code: 'crm.contacts.create', name: 'Crear Contactos', description: null, module: 'crm' },
  { code: 'reports_view', name: 'reports_view', description: null, module: 'reports' },
];

describe('nombreLegible', () => {
  test('la descripción manda y pierde el «Permite» inicial y el punto final', () => {
    expect(nombreLegible(CATALOGO[2])).toBe('Vender en el POS');
  });
  test('sin descripción: el nombre si es texto para personas', () => {
    expect(nombreLegible(CATALOGO[4])).toBe('Crear Contactos');
  });
  test('sin descripción y con nombre-código: el código legible', () => {
    expect(nombreLegible(CATALOGO[5])).toBe('Reports view');
  });
});

describe('agruparPermisos', () => {
  test('solo módulos con algún permiso; «no incluye» con el resto del módulo', () => {
    const grupos = agruparPermisos(CATALOGO, new Set(['pos.vender', 'branches.create']));
    expect(grupos.map((g) => g.modulo)).toEqual(['branches', 'pos']);
    const pos = grupos.find((g) => g.modulo === 'pos')!;
    expect(pos.permitidos.map((p) => p.codigo)).toEqual(['pos.vender']);
    expect(pos.noIncluidos.map((p) => p.nombre)).toEqual(['Cerrar una caja del POS que abrió otra persona']);
  });

  test('acceso total: todos los módulos y nada «no incluido»', () => {
    const grupos = agruparPermisos(CATALOGO, 'todos');
    expect(grupos).toHaveLength(5);
    expect(grupos.every((g) => g.noIncluidos.length === 0)).toBe(true);
  });

  test('sin permisos: lista vacía (no un módulo vacío)', () => {
    expect(agruparPermisos(CATALOGO, new Set())).toEqual([]);
  });

  test('un código que no está en el catálogo no inventa módulos', () => {
    expect(agruparPermisos(CATALOGO, new Set(['fantasma.x']))).toEqual([]);
  });

  test('ordena los permisos por nombre dentro del módulo', () => {
    const grupos = agruparPermisos(CATALOGO, new Set(['pos.vender', 'pos.cajas.cerrar_ajenas']));
    expect(grupos[0].permitidos.map((p) => p.codigo)).toEqual(['pos.cajas.cerrar_ajenas', 'pos.vender']);
  });
});
