/**
 * Cajas del POS: cierre con la diferencia calculada en el servidor y una sola
 * caja abierta por alcance (docs/design/POS-PARIDAD-PAGINAS-SECUNDARIAS.md §5 K-2).
 *
 * Antes: `POST /api/pos/cajas/[id]/cerrar` guardaba la `difference` que
 * mandaba el navegador, la caja propia se cerraba con un update directo con
 * la diferencia del navegador, y el POS decidía quién cierra por el NOMBRE del
 * rol (`roleName.includes('admin')`).
 */
import * as fs from 'fs';
import * as path from 'path';

const SRC = path.resolve(__dirname, '..', '..');
const leer = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');

describe('Guardarraíles del cierre y la apertura de caja', () => {
  test('POST /api/pos/cajas/[id]/cerrar cierra en una transacción del servidor (pos_caja_cerrar)', () => {
    const src = leer('app/api/pos/cajas/[id]/cerrar/route.ts');
    // D6: el cierre guarda el conteo por método en la misma transacción; la
    // diferencia la calcula la base.
    expect(src).toMatch(/rpc\(\s*'pos_caja_cerrar'/);
    expect(src).toMatch(/parametrosCierre\(sessionId/);
    // Ya no hay UPDATE directo a cash_sessions desde la ruta.
    expect(src).not.toMatch(/from\('cash_sessions'\)\s*\.update/);
    // La diferencia del body no se desestructura ni se escribe.
    expect(src).not.toMatch(/const \{[^}]*difference[^}]*\} = parsed\.data/);
    expect(src).not.toMatch(/parsed\.data\.difference/);
  });

  test('el outbox del Desktop cierra con la misma RPC y sin la diferencia local', () => {
    const src = leer('lib/offline/cashSync.ts');
    expect(src).toMatch(/rpc\(\s*'pos_caja_cerrar'/);
    expect(src).not.toMatch(/from\('cash_sessions'\)\s*\.update/);
    expect(src).not.toMatch(/payload\.difference/);
  });

  test('el cierre con red (propio o ajeno) no manda la diferencia', () => {
    const src = leer('components/pos/cajas/CajasService.ts');
    const cuerpo = src.slice(src.indexOf('private static async closeOnServer'));
    const fetchBody = cuerpo.slice(cuerpo.indexOf('body: JSON.stringify('), cuerpo.indexOf('body: JSON.stringify(') + 120);
    expect(fetchBody).not.toMatch(/difference/);
    // Con red la caja propia ya no se cierra con un update directo a cash_sessions.
    const cierre = src.slice(src.indexOf('static async closeSession'), src.indexOf('private static async closeOtherSession'));
    expect(cierre).not.toMatch(/from\('cash_sessions'\)\s*\.update/);
  });

  test('el POS no decide el cierre por el nombre del rol', () => {
    const src = leer('app/app/pos/page.tsx');
    expect(src).not.toMatch(/roleName\.includes\('admin'\)/);
    expect(src).not.toMatch(/isOrgAdmin/);
    expect(src).toMatch(/puedeCerrarCaja\(cashSession, permisosCaja\.userId \?\? currentUserId, permisosCaja\.cerrarCajasAjenas\)/);
  });

  test('abrir caja traduce la violación del índice único (23505) al error de caja ya abierta', () => {
    const src = leer('components/pos/cajas/CajasService.ts');
    expect(src).toMatch(/code === '23505'\) throw alreadyOpen/);
  });
});
