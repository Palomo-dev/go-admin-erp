/**
 * El mapa ruta → módulo del middleware solo puede usar códigos que existen en
 * `modules`. 'branches' y 'branding' no existen: con ellos la ruta exacta
 * /app/organizacion/sucursales respondía «Módulo no activado» siempre.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const fuente = readFileSync(join(process.cwd(), 'src/middleware.ts'), 'utf8');
const mapa = fuente.slice(fuente.indexOf('const routeToModuleMap'), fuente.indexOf('};', fuente.indexOf('const routeToModuleMap')));

describe('mapa de rutas a módulos del middleware', () => {
  it.each(['branches', 'branding'])('no usa el código fantasma %s', (codigo) => {
    expect(mapa).not.toMatch(new RegExp(`:\\s*'${codigo}'`));
  });

  it('sucursales cae en Organizaciones (módulo base)', () => {
    expect(mapa).toContain("'/app/organizacion': 'organizations'");
    expect(mapa).not.toContain("'/app/organizacion/sucursales'");
  });
});
