/**
 * Guardarraíl 37 — hora oficial del servidor (referenciado desde
 * src/__tests__/guardrails.test.ts). Regla: docs/reglas-fechas-timezone.md
 * §«Hora oficial de las operaciones de dinero»; análisis:
 * docs/design/HORA-SERVIDOR-ANALISIS.md.
 *
 * 1. Ningún archivo que corre en el navegador escribe en una tabla de dinero o
 *    inventario la marca de tiempo del HECHO con el reloj del equipo
 *    (`sale_date: new Date()…`, `opened_at: ahora`…). La pone la base (default
 *    now() / trigger trg_00_hora_oficial) o una RPC.
 * 2. Las fechas que el usuario ELIGE (vencimiento, fecha contable, fecha de
 *    factura tecleada) son datos: no se construyen con `new Date()` sin
 *    argumentos, así que la regla no las toca. La allow-list recoge el resto,
 *    cada entrada con su motivo.
 * 3. El sobre del POS solo se declara sin conexión al reproducir el outbox, y
 *    ninguna migración posterior vuelve a tomar la hora del sobre como oficial.
 */

import * as fs from 'fs';
import * as path from 'path';

const SRC_ROOT = path.resolve(__dirname, '..', '..');
const REPO_ROOT = path.resolve(SRC_ROOT, '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== 'node_modules' && e.name !== '__tests__' && e.name !== '__fixtures__') walk(p, out);
    } else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) {
      out.push(p);
    }
  }
  return out;
}

const rel = (f: string) => path.relative(REPO_ROOT, f).split(path.sep).join('/');

function sinComentarios(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
}

/** Código que puede correr en el navegador: todo menos rutas, *.server.ts y 'server-only'. */
function esDeServidor(archivo: string, src: string): boolean {
  const r = rel(archivo);
  return (
    r.startsWith('src/app/api/')
    || /\.server\.tsx?$/.test(r)
    || /from ['"]server-only['"]|import ['"]server-only['"]/.test(src)
    || r.startsWith('src/lib/services/integrations/')
    || r.startsWith('src/lib/jobs/')
  );
}

/** Tabla → columnas que son la marca de tiempo del hecho (no fechas elegidas por el usuario). */
const MARCAS: Record<string, string[]> = {
  sales: ['sale_date', 'created_at'],
  sale_items: ['created_at', 'paid_at'],
  payments: ['created_at'],
  cash_sessions: ['opened_at', 'closed_at', 'created_at'],
  cash_movements: ['created_at'],
  table_sessions: ['opened_at', 'closed_at', 'created_at'],
  returns: ['return_date', 'created_at'],
  stock_movements: ['created_at'],
  invoice_sales: ['issue_date', 'created_at'],
  invoice_purchase: ['issue_date', 'created_at'],
  credit_notes: ['created_at'],
};

/**
 * Deuda conocida, fuera del alcance de dinero del POS o con motivo propio.
 * Cada entrada: archivo → motivo. Si arreglas uno, quítalo de aquí.
 */
const ALLOW_LIST: Record<string, string> = {
  // Falsos positivos: el `created_at: new Date()` es de un objeto local de la UI
  // (nota de la sesión, línea de la cuenta dividida), no de la fila que se escribe.
  // Frente CRM (otro equipo trabaja src/**/crm/**): el trigger trg_00_hora_oficial
  // ya impone now() en sales.sale_date; queda para que ese frente quite el new Date().
  'src/lib/services/crm/posCrmLink.ts': 'CRM: sales.sale_date con new Date(); la base lo reemplaza por now() (trigger). Pendiente del frente CRM',
};

const RELOJ = String.raw`(?:new Date\(\)(?:\.toISOString\(\))?|Date\.now\(\))`;

function ofensas(src: string): string[] {
  const codigo = sinComentarios(src);
  const tablas = Object.keys(MARCAS).filter((t) =>
    new RegExp(String.raw`\.from\(\s*['"]${t}['"]\s*\)[\s\S]{0,400}?\.(insert|update|upsert)\(`).test(codigo),
  );
  if (tablas.length === 0) return [];
  // Variables de reloj del archivo: `const ahora = new Date().toISOString()`.
  const vars = Array.from(codigo.matchAll(new RegExp(String.raw`(?:const|let)\s+(\w+)\s*=\s*${RELOJ}`, 'g'))).map((m) => m[1]);
  const valor = vars.length > 0 ? `(?:${RELOJ}|(?:${vars.join('|')})\\b)` : RELOJ;
  const hallazgos: string[] = [];
  for (const t of tablas) {
    for (const col of MARCAS[t]) {
      if (new RegExp(String.raw`\b${col}\s*:\s*${valor}`).test(codigo)) hallazgos.push(`${t}.${col}`);
    }
  }
  return Array.from(new Set(hallazgos));
}

describe('37. Hora oficial del servidor en dinero e inventario', () => {
  const archivos = walk(SRC_ROOT).map((f) => ({ f, src: fs.readFileSync(f, 'utf-8') }));

  test('ningún archivo del navegador escribe la marca de tiempo del hecho con el reloj del equipo', () => {
    const encontrados = archivos
      .filter(({ f, src }) => !esDeServidor(f, src) && !(rel(f) in ALLOW_LIST))
      .map(({ f, src }) => ({ archivo: rel(f), columnas: ofensas(src) }))
      .filter((x) => x.columnas.length > 0);
    expect(encontrados).toEqual([]);
  });

  test('la allow-list no tiene entradas obsoletas', () => {
    const obsoletas = Object.keys(ALLOW_LIST).filter((r) => {
      const p = path.join(REPO_ROOT, r);
      return !fs.existsSync(p) || ofensas(fs.readFileSync(p, 'utf-8')).length === 0;
    });
    expect(obsoletas).toEqual([]);
  });

  test('el detector reconoce los patrones prohibidos y respeta las fechas elegidas', () => {
    const malo = `const ahora = new Date().toISOString();\nawait supabase.from('table_sessions').update({ closed_at: ahora })`;
    const malo2 = `await supabase.from('sales').insert({ sale_date: new Date().toISOString() })`;
    const dato = `await supabase.from('invoice_purchase').insert({ issue_date: new Date(dia).toISOString(), due_date: new Date().toISOString() })`;
    const servidor = `await supabase.from('table_sessions').update({ closed_at: HORA_DEL_SERVIDOR })`;
    expect(ofensas(malo)).toEqual(['table_sessions.closed_at']);
    expect(ofensas(malo2)).toEqual(['sales.sale_date']);
    expect(ofensas(dato)).toEqual([]);
    expect(ofensas(servidor)).toEqual([]);
  });

  test('el POS solo declara el sobre sin conexión al reproducir el outbox', () => {
    const pos = fs.readFileSync(path.join(SRC_ROOT, 'lib', 'services', 'posService.ts'), 'utf-8');
    expect(pos).toMatch(/offline:\s*!!checkoutData\.replayFromOutbox/);
    expect(pos.match(/(?<![\w])offline:\s*true/g) ?? []).toEqual([]);
  });

  test('ninguna migración posterior vuelve a tomar la hora del sobre como hora oficial', () => {
    const dir = path.join(REPO_ROOT, 'supabase', 'migrations');
    const ofensoras = fs
      .readdirSync(dir)
      .filter((f) => /^\d{14}_.*\.sql$/.test(f) && f.slice(0, 14) > '20260930190003')
      .filter((f) => /coalesce\(\s*\(p_envelope->>'created_at'\)::timestamptz\s*,\s*now\(\)\s*\)/i.test(fs.readFileSync(path.join(dir, f), 'utf-8')));
    expect(ofensoras).toEqual([]);
  });

  test('la regla SQL y su espejo en TypeScript comparten umbrales', () => {
    const sql = fs.readFileSync(path.join(REPO_ROOT, 'supabase', 'migrations', '20260930190001_hora_servidor_columnas_y_regla.sql'), 'utf-8');
    const ts = fs.readFileSync(path.join(SRC_ROOT, 'lib', 'pos', 'reloj', 'horaOficial.ts'), 'utf-8');
    expect(sql).toMatch(/p_umbral\s+interval default interval '10 minutes'/);
    expect(sql).toMatch(/now\(\) \+ interval '5 minutes'/);
    expect(sql).toMatch(/now\(\) - interval '30 days'/);
    expect(ts).toMatch(/UMBRAL_DIA_CONTABLE_MS = 10 \* 60_000/);
    expect(ts).toMatch(/TOLERANCIA_FUTURO_MS = 5 \* 60_000/);
    expect(ts).toMatch(/ANTIGUEDAD_MAXIMA_MS = 30 \* 24 \* 60 \* 60_000/);
  });
});
