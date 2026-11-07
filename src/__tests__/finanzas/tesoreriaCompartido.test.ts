/**
 * Requisito del dueño (2026-11-07): en Tesorería TODO comparte componentes.
 * Movimientos, Ingresos y Egresos son una sola lista (`ListaTesoreria`) con el
 * tipo fijado; el alta de ingreso y de egreso es un solo formulario
 * (`FormularioMovimientoTesoreria`, con el tipo como variante) y el detalle es
 * uno (`DetalleMovimientoTesoreria`). Si mañana cambia el formulario en
 * Ingresos, cambia igual en Movimientos y en Egresos.
 *
 * También: las rutas viejas de Tesorería redirigen en el servidor y el menú
 * lista el grupo según el mapa `1009:86249`.
 */
import fs from 'fs';
import path from 'path';
import { CATALOGO_NAV } from '@/lib/navigation/catalog';

const SRC = path.join(process.cwd(), 'src');
const leer = (r: string) => fs.readFileSync(path.join(SRC, r), 'utf8');
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function archivos(dir: string): string[] {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? archivos(path.join(dir, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [path.join(dir, e.name)] : []));
}

describe('Tesorería comparte componentes', () => {
  const PAGINAS = {
    movimientos: 'app/app/finanzas/tesoreria/movimientos/page.tsx',
    ingresos: 'app/app/finanzas/ingresos/page.tsx',
    egresos: 'app/app/finanzas/egresos/page.tsx',
  } as const;

  test.each(Object.entries(PAGINAS))('%s monta la misma ListaTesoreria de tesoreria/compartido', (vista, ruta) => {
    const fuente = leer(ruta);
    expect(fuente).toMatch(/import \{ ListaTesoreria \} from '@\/components\/finanzas\/tesoreria\/compartido'/);
    expect(fuente).toContain(`<ListaTesoreria vista="${vista}" />`);
  });

  test('la lista usa UN formulario de alta para ingreso y egreso, desde compartido/formularios', () => {
    const lista = leer('components/finanzas/tesoreria/compartido/ListaTesoreria.tsx');
    expect(lista).toMatch(/import \{ FormularioMovimientoTesoreria \} from '\.\/formularios'/);
    // Una sola instancia: el tipo (ingreso · egreso) es la variante.
    expect(lista.match(/<FormularioMovimientoTesoreria\s/g)).toHaveLength(1);
    expect(lista).toContain("tipo={alta === 'egreso' ? 'egreso' : 'ingreso'}");
    expect(leer('components/finanzas/tesoreria/compartido/formularios.ts')).toContain(
      "export { FormularioMovimientoTesoreria } from '@/components/finanzas/movimientos/FormularioMovimientoTesoreria'",
    );
  });

  test('nadie más importa el formulario ni el detalle por otra ruta (ninguna copia)', () => {
    const permitidos = new Set([
      path.join(SRC, 'components/finanzas/tesoreria/compartido/formularios.ts'),
      // Pruebas de render del propio componente.
    ]);
    const ofensores = archivos(SRC)
      .filter((f) => !permitidos.has(f) && !/__tests__/.test(f))
      .filter((f) => /components\/finanzas\/movimientos\/(FormularioMovimientoTesoreria|DetalleMovimientoTesoreria)'/.test(sinComentarios(fs.readFileSync(f, 'utf8'))))
      .map((f) => path.relative(SRC, f));
    expect(ofensores).toEqual([]);
  });

  test('los detalles /ingresos/[id] y /egresos/[id] siguen vivos y usan el detalle compartido', () => {
    expect(fs.existsSync(path.join(SRC, 'app/app/finanzas/ingresos/[id]/page.tsx'))).toBe(true);
    expect(fs.existsSync(path.join(SRC, 'app/app/finanzas/egresos/[id]/page.tsx'))).toBe(true);
    for (const r of ['components/finanzas/ingresos/IngresoDetalle.tsx', 'components/finanzas/egresos/EgresoDetalle.tsx']) {
      expect(leer(r)).toContain("from '@/components/finanzas/tesoreria/compartido/formularios'");
    }
  });

  test('Ingresos y Egresos NO redirigen a Movimientos (decisión del dueño)', () => {
    for (const r of [PAGINAS.ingresos, PAGINAS.egresos]) expect(leer(r)).not.toMatch(/redirect\(/);
  });
});

describe('rutas viejas de Tesorería redirigen en el servidor', () => {
  test.each([
    ['app/app/finanzas/bancos/page.tsx', 'destinoBancos'],
    ['app/app/finanzas/bancos/tesoreria/page.tsx', 'destinoTesoreriaConsolidada'],
    ['app/app/finanzas/bancos/anomalias/page.tsx', 'destinoAnomalias'],
    ['app/app/finanzas/bancos/cuentas/nuevo/page.tsx', 'destinoNuevaCuenta'],
    ['app/app/finanzas/bancos/cuentas/[id]/page.tsx', 'destinoCuentaBancaria'],
    ['app/app/finanzas/bancos/cuentas/[id]/movimientos/page.tsx', 'destinoCuentaBancaria'],
    ['app/app/finanzas/conciliacion-bancaria/page.tsx', 'destinoConciliacion'],
    ['app/app/finanzas/conciliacion-bancaria/nuevo/page.tsx', 'destinoConciliacion'],
    ['app/app/finanzas/conciliacion-bancaria/[id]/page.tsx', 'destinoConciliacion'],
    ['app/app/finanzas/transferencias/page.tsx', 'destinoTransferencia'],
    ['app/app/finanzas/transferencias/[id]/page.tsx', 'destinoTransferencia'],
  ])('%s', (ruta, funcion) => {
    const fuente = leer(ruta);
    expect(fuente).not.toMatch(/^'use client'/);
    expect(fuente).toContain(`redirect(${funcion}(`);
  });

  test('ningún enlace interno apunta a una ruta vieja de Tesorería', () => {
    const viejas = /['"`]\/app\/finanzas\/(bancos|conciliacion-bancaria|transferencias)\b/;
    const ofensores = archivos(SRC)
      .filter((f) => !/__tests__/.test(f) && !f.includes(path.join('app', 'app', 'finanzas', 'bancos')) && !f.includes(path.join('app', 'app', 'finanzas', 'conciliacion-bancaria')) && !f.includes(path.join('app', 'app', 'finanzas', 'transferencias')))
      .filter((f) => viejas.test(sinComentarios(fs.readFileSync(f, 'utf8'))))
      .map((f) => path.relative(SRC, f));
    expect(ofensores).toEqual([]);
  });
});

describe('menú del grupo Tesorería (mapa 1009:86249 y decisión del dueño)', () => {
  const finanzas = CATALOGO_NAV.find((m) => m.id === 'finanzas')!;
  const tesoreria = finanzas.paginas.filter((p) => p.grupo === 'Tesorería').map((p) => p.href);

  test('Movimientos, Ingresos, Egresos, Cuentas de dinero, Conciliación y Transferencias, en ese orden', () => {
    expect(tesoreria.slice(0, 6)).toEqual([
      '/app/finanzas/tesoreria/movimientos',
      '/app/finanzas/ingresos',
      '/app/finanzas/egresos',
      '/app/finanzas/tesoreria/cuentas',
      '/app/finanzas/tesoreria/conciliacion',
      '/app/finanzas/tesoreria/transferencias',
    ]);
  });

  test('las rutas viejas ya no están en el menú', () => {
    expect(tesoreria).not.toContain('/app/finanzas/bancos');
    expect(tesoreria).not.toContain('/app/finanzas/transferencias');
  });
});
