/**
 * /pos-display es una ruta PÚBLICA (docs/pos-doble-pantalla/PLAN.md §1 y §11):
 * la pantalla del cliente es un espejo sin datos propios (el carrito llega por
 * BroadcastChannel y la marca degrada a vacío si no puede leerse), así que una
 * sesión caída en la caja nunca debe poner el formulario de login de GO Admin
 * frente al cliente.
 *
 * La lógica de rutas públicas vive dentro de handleRouteProtection en
 * src/middleware.ts y no está extraída: este test de humo lee el archivo y
 * comprueba que la entrada existe en `isPublicRoute`. Si algún día se extrae,
 * cambiar este test por uno que importe esa función.
 */

import fs from 'fs';
import path from 'path';

const MIDDLEWARE = path.join(process.cwd(), 'src', 'middleware.ts');

function isPublicRouteBlock(): string {
  const src = fs.readFileSync(MIDDLEWARE, 'utf8');
  const start = src.indexOf('const isPublicRoute = (');
  expect(start).toBeGreaterThan(-1);
  const end = src.indexOf(');', start);
  expect(end).toBeGreaterThan(start);
  return src.slice(start, end);
}

describe('/pos-display es pública en el middleware', () => {
  it('isPublicRoute incluye /pos-display (exacta y con subrutas)', () => {
    const block = isPublicRouteBlock();
    expect(block).toContain("pathname === '/pos-display'");
    expect(block).toContain("pathname.startsWith('/pos-display/')");
  });

  it('la entrada explica que es un espejo sin datos propios (referencia al PLAN)', () => {
    const block = isPublicRouteBlock();
    expect(block).toMatch(/PLAN\.md/);
    expect(block).toMatch(/espejo sin datos propios/);
  });

  it('no se abre nada más que /pos-display: /app y la raíz siguen protegidas', () => {
    const block = isPublicRouteBlock();
    expect(block).not.toMatch(/'\/app/);
    expect(block).not.toContain("pathname === '/'");
  });
});
