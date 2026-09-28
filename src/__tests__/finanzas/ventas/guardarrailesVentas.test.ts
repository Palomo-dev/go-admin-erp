/**
 * Guardarraíles del rediseño de facturas de venta, cartera y pagos (plan §2
 * L1, L13, L14, L15 y §4 P15). Revisan el código NUEVO de estas carpetas; las
 * pantallas viejas se retiran en P15 y no se miden aquí.
 */
import * as fs from 'fs';
import * as path from 'path';

const SRC = path.resolve(__dirname, '..', '..', '..');

const CARPETAS = [
  'components/finanzas/pagos',
  'components/finanzas/cartera',
  'components/finanzas/notas',
  'components/finanzas/facturas-venta/detalle',
  'components/finanzas/facturas-venta/listado',
  'components/finanzas/cuentas-por-cobrar/listado',
  'components/finanzas/cuentas-por-cobrar/detalle',
  'components/finanzas/cuentas-por-cobrar/cliente',
  'lib/finanzas/pagos',
  'lib/finanzas/ventas',
  'lib/finanzas/cartera',
  'lib/services/pagos',
  'lib/services/ventas',
  'lib/services/cartera',
  'app/api/pagos',
  'app/api/facturas-venta',
  'app/api/cartera',
  'app/api/clientes/[id]/cartera',
  'app/api/clientes/[id]/estado-cuenta',
  'lib/services/finanzas',
];

function archivos(dir: string): string[] {
  const abs = path.join(SRC, dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs, { withFileTypes: true }).flatMap((e) => {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) return archivos(rel);
    return /\.(ts|tsx)$/.test(e.name) ? [rel] : [];
  });
}

const TODOS = CARPETAS.flatMap(archivos);
const leer = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');

function buscar(patron: RegExp, excepto: (rel: string) => boolean = () => false): string[] {
  return TODOS.filter((rel) => !excepto(rel)).flatMap((rel) =>
    leer(rel)
      .split('\n')
      .map((linea, i) => ({ linea, i }))
      .filter(({ linea }) => patron.test(linea) && !/^\s*(\*|\/\/)/.test(linea))
      .map(({ i }) => `${rel.replace(/\\/g, '/')}:${i + 1}`),
  );
}

describe('rediseño de ventas y cartera: guardarraíles', () => {
  test('hay archivos que revisar', () => {
    expect(TODOS.length).toBeGreaterThan(10);
  });

  test('L1: nunca se escriben saldos ni pagos a mano (mandan los disparadores y las RPC)', () => {
    expect(buscar(/from\(['"](invoice_sales|accounts_receivable|accounts_payable|invoice_purchase)['"]\)\s*\.(update|insert|upsert|delete)\(/)).toEqual([]);
    expect(buscar(/from\(['"]payments['"]\)\s*\.(update|insert|upsert|delete)\(/)).toEqual([]);
    expect(buscar(/from\(['"]ar_installments['"]\)\s*\.(update|insert|upsert|delete)\(/)).toEqual([]);
  });

  test('L13: la interfaz no escribe la cola ni el estado de facturación electrónica', () => {
    expect(buscar(/electronic_invoicing_jobs['"]\)\s*\.(update|insert|upsert|delete)\(/)).toEqual([]);
    // `einvoice_status` vive en invoice_sales, que L1 ya prohíbe escribir desde aquí.
  });

  test("L14: sin moneda cableada ('COP', 'USD')", () => {
    expect(buscar(/['"](COP|USD)['"]/)).toEqual([]);
  });

  test('L15: fechas por la zona de la organización (sin split de ISO ni utilidades deprecadas)', () => {
    expect(buscar(/toISOString\(\)\.split/)).toEqual([]);
    expect(buscar(/\.split\(['"]T['"]\)\[0\]/)).toEqual([]);
    expect(buscar(/parseLocalDate|from ['"]@\/utils\/Utils['"].*formatDate/)).toEqual([]);
  });

  test('las pantallas nuevas no leen ni escriben tablas desde el navegador', () => {
    const pantallas = (rel: string) => !rel.startsWith('components');
    expect(buscar(/@\/lib\/supabase\/config/, pantallas)).toEqual([]);
  });
});
