/**
 * `rutasModulos.ts` (lo que lee el middleware en el Edge) debe ser EXACTAMENTE
 * lo que dice `CATALOGO_NAV`: mismos módulos, mismas rutas y mismas páginas, en
 * el mismo orden. Si este test falla, pega en `RUTAS_MODULOS` el bloque que
 * imprime: no edites a mano una sola entrada.
 */
import { CATALOGO_NAV } from '../catalog';
import { RUTAS_MODULOS, cantidadPaginas, moduloDeRuta, paginaDeRuta } from '../rutasModulos';

function derivado() {
  return CATALOGO_NAV.filter((m) => m.codigo !== null).map((m) => ({
    codigo: m.codigo as string,
    rutas: [...m.rutas],
    paginas: m.paginas.map((p) => p.href),
  }));
}

describe('rutasModulos = CATALOGO_NAV', () => {
  it('mismos módulos, rutas y páginas que el catálogo', () => {
    const esperado = derivado();
    const actual = RUTAS_MODULOS.map((m) => ({ codigo: m.codigo, rutas: [...m.rutas], paginas: [...m.paginas] }));
    if (JSON.stringify(actual) !== JSON.stringify(esperado)) {
      // Ayuda para quien añadió una página al catálogo: el arreglo a pegar.
      console.error(`RUTAS_MODULOS desincronizado. Pega esto en src/lib/navigation/rutasModulos.ts:\n${JSON.stringify(esperado, null, 2)}`);
    }
    expect(actual).toEqual(esperado);
  });

  it('el middleware no vuelve a tener su propio mapa de rutas', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fuente = require('fs').readFileSync(require('path').join(process.cwd(), 'src/middleware.ts'), 'utf8') as string;
    expect(fuente).not.toMatch(/routeToModuleMap/);
    expect(fuente).toMatch(/from '@\/lib\/navigation\/rutasModulos'/);
  });
});

describe('moduloDeRuta / paginaDeRuta', () => {
  it.each([
    ['/app/pos', 'pos'],
    ['/app/pos/ventas/123', 'pos'],
    ['/app/organizacion/sucursales', 'organizations'],
    ['/app/plan/historial', 'organizations'],
    // Desde el 2026-11-13 Roles y permisos es una página de Organización (la URL no cambió).
    ['/app/admin/algo', 'organizations'],
    ['/app/roles', 'organizations'],
    ['/app/roles/cargos/abc', 'organizations'],
    ['/app/pm', 'pm'],
    ['/app/sitio-web/editor/abc', 'website'],
  ])('%s → %s', (ruta, codigo) => {
    expect(moduloDeRuta(ruta)).toBe(codigo);
  });

  it.each(['/app/inicio', '/app/perfil', '/app/posventa', '/app/modulo-no-habilitado'])('%s no es de ningún módulo', (ruta) => {
    expect(moduloDeRuta(ruta)).toBeNull();
  });

  it('gana la página más específica', () => {
    expect(paginaDeRuta('/app/pos/ventas/123', 'pos')).toBe('/app/pos/ventas');
    expect(paginaDeRuta('/app/pos', 'pos')).toBe('/app/pos');
    expect(paginaDeRuta('/app/pos/devoluciones', 'pos')).toBe('/app/pos/devoluciones');
  });

  it('cantidad de páginas igual al catálogo', () => {
    for (const m of CATALOGO_NAV) if (m.codigo) expect(cantidadPaginas(m.codigo)).toBe(m.paginas.length);
    expect(cantidadPaginas('no-existe')).toBe(0);
  });
});
