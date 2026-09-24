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
  test('POST /api/pos/cajas/[id]/cerrar calcula la diferencia en el servidor', () => {
    const src = leer('app/api/pos/cajas/[id]/cerrar/route.ts');
    expect(src).toMatch(/rpc\('pos_caja_esperado'/);
    expect(src).toMatch(/const difference = diferenciaEfectivo\(final_amount, esperadoEfectivo\)/);
    // La diferencia del body no se desestructura ni se escribe.
    expect(src).not.toMatch(/const \{[^}]*difference[^}]*\} = parsed\.data/);
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
