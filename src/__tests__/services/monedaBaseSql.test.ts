/**
 * La moneda base de una organización se resuelve en DOS sitios que deben dar
 * lo mismo:
 *   - `resolveOrgCurrency` (src/lib/services/monedaOrganizacion.ts): pantallas,
 *     documentos, servicios.
 *   - `public.fn_moneda_base_organizacion` (migración
 *     20260924163000_moneda_base_por_defecto.sql): el trigger BEFORE INSERT que
 *     pone la moneda a un documento creado sin ella.
 *
 * Este test no puede ejecutar SQL, así que vigila tres cosas:
 *   1. La tabla de países de la función SQL es exactamente MONEDA_POR_PAIS +
 *      ALFA3_A_ALFA2 + los nombres de countryPhoneCodes.
 *   2. Los pasos aparecen en el mismo orden en los dos lados.
 *   3. `resolveOrgCurrency` da, escenario por escenario, lo mismo que dio la
 *      función SQL en la prueba en transacción del 2026-09-24 (los valores
 *      esperados de abajo son los que devolvió la base; ver el informe de la
 *      migración).
 */

import fs from 'fs';
import path from 'path';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  MONEDA_POR_PAIS,
  monedaDelPais,
  resetOrgCurrencyCache,
  resolveOrgCurrency,
} from '@/lib/services/monedaOrganizacion';
import { paisIsoDeOrganizacion } from '@/lib/utils/telefono';

const REPO = path.resolve(__dirname, '..', '..', '..');
const MIGRACIONES = path.join(REPO, 'supabase', 'migrations');

/** La última migración que define la función (la versión vigente). */
function sqlFuncion(): string {
  const archivos = fs
    .readdirSync(MIGRACIONES)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .filter((f) =>
      /create\s+or\s+replace\s+function\s+public\.fn_moneda_base_organizacion/i.test(
        fs.readFileSync(path.join(MIGRACIONES, f), 'utf8')
      )
    );
  expect(archivos.length).toBeGreaterThan(0);
  const sql = fs.readFileSync(path.join(MIGRACIONES, archivos[archivos.length - 1]), 'utf8');
  const inicio = sql.search(/create\s+or\s+replace\s+function\s+public\.fn_moneda_base_organizacion/i);
  const fin = sql.indexOf('$$;', inicio);
  return sql.slice(inicio, fin);
}

interface FilaPais {
  iso: string;
  alfa3: string;
  nombre: string;
  moneda: string;
}

function tablaPaisesSql(): FilaPais[] {
  const sql = sqlFuncion();
  const bloque = sql.slice(sql.indexOf('PAISES_INICIO'), sql.indexOf('PAISES_FIN'));
  const filas: FilaPais[] = [];
  const re = /\('([A-Z]{2})',\s*'([A-Z]{3})',\s*'([a-z ]+)',\s*'([A-Z]{3})'\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(bloque))) filas.push({ iso: m[1], alfa3: m[2], nombre: m[3], moneda: m[4] });
  return filas;
}

describe('fn_moneda_base_organizacion (SQL) = resolveOrgCurrency (TS)', () => {
  test('la tabla de países del SQL cubre exactamente MONEDA_POR_PAIS', () => {
    const filas = tablaPaisesSql();
    expect(filas.map((f) => f.iso).sort()).toEqual(Object.keys(MONEDA_POR_PAIS).sort());
    for (const f of filas) {
      expect({ iso: f.iso, moneda: f.moneda }).toEqual({ iso: f.iso, moneda: MONEDA_POR_PAIS[f.iso] });
    }
  });

  test('alfa-3 y nombre de cada fila llevan al mismo país que paisIsoDeOrganizacion', () => {
    for (const f of tablaPaisesSql()) {
      expect({ fila: f.alfa3, iso: paisIsoDeOrganizacion(f.alfa3) }).toEqual({ fila: f.alfa3, iso: f.iso });
      expect({ fila: f.nombre, iso: paisIsoDeOrganizacion(null, f.nombre) }).toEqual({ fila: f.nombre, iso: f.iso });
      expect(monedaDelPais(f.alfa3)).toBe(f.moneda);
    }
  });

  test('los pasos van en el mismo orden en los dos lados', () => {
    const sql = sqlFuncion();
    const pasosSql = ['PASO 1', 'PASO 2', 'PASO 3', 'PASO 5', 'PASO 6'].map((p) => sql.indexOf(p));
    expect(pasosSql.every((i) => i >= 0)).toBe(true);
    expect([...pasosSql].sort((a, b) => a - b)).toEqual(pasosSql);
    // Contenido de cada paso en el SQL.
    const tramo = (a: string, b: string) => sql.slice(sql.indexOf(a), sql.indexOf(b));
    expect(tramo('PASO 1', 'PASO 2')).toMatch(/is_base/);
    expect(tramo('PASO 2', 'PASO 3')).toMatch(/default_currency/);
    expect(tramo('PASO 3', 'PASO 5')).toMatch(/'USD'\s*=\s*any/);
    expect(tramo('PASO 3', 'PASO 5')).toMatch(/order by oc\.created_at asc/);
    expect(tramo('PASO 5', 'PASO 6')).toMatch(/country_code/);
    expect(sql.slice(sql.indexOf('PASO 6'))).toMatch(/return 'USD'/);

    const ts = fs.readFileSync(path.join(REPO, 'src', 'lib', 'services', 'monedaOrganizacion.ts'), 'utf8');
    const cuerpo = ts.slice(ts.indexOf('async function resolveSinCache'));
    const marcas = ["eq('is_base', true)", 'default_currency', "codigos.includes('USD')", 'codigos[0]', 'monedaDelPais(', 'return FALLBACK'];
    const posiciones = marcas.map((m) => cuerpo.indexOf(m));
    expect(posiciones.every((i) => i >= 0)).toBe(true);
    expect([...posiciones].sort((a, b) => a - b)).toEqual(posiciones);
    expect(ts).toMatch(/const FALLBACK: OrgCurrency = \{ code: 'USD'/);
  });
});

// ─── Escenarios: mismos datos, mismo resultado que dio el SQL ───────────────

interface Asignada {
  currency_code: string;
  is_base: boolean;
  created_at: string;
}

interface Datos {
  asignadas?: Asignada[];
  preferida?: string;
  country_code?: string | null;
  country?: string | null;
}

/** Cliente falso con la forma de las consultas de resolveOrgCurrency. */
function cliente(d: Datos): SupabaseClient {
  const tablas: Record<string, Array<Record<string, unknown>>> = {
    organization_currencies: (d.asignadas ?? []).map((a) => ({ organization_id: 4, ...a })),
    organization_preferences:
      d.preferida !== undefined ? [{ organization_id: 4, settings: { finance: { default_currency: d.preferida } } }] : [],
    organizations: [{ id: 4, country_code: d.country_code ?? null, country: d.country ?? null }],
    currencies: [],
  };
  return {
    from(nombre: string) {
      const filtros: Array<[string, unknown]> = [];
      let orden: string | null = null;
      const filas = () => {
        const r = (tablas[nombre] ?? []).filter((f) => filtros.every(([c, v]) => f[c] === v));
        return orden ? [...r].sort((a, b) => String(a[orden as string]).localeCompare(String(b[orden as string]))) : r;
      };
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => {
          filtros.push([c, v]);
          return q;
        },
        order: (c: string) => {
          orden = c;
          return q;
        },
        // maybeSingle de PostgREST: con más de una fila, error y data null.
        maybeSingle: async () => {
          const r = filas();
          return r.length > 1 ? { data: null, error: { message: 'varias filas' } } : { data: r[0] ?? null, error: null };
        },
        then: (ok: (v: { data: unknown[]; error: null }) => unknown) => Promise.resolve({ data: filas(), error: null }).then(ok),
      };
      return q;
    },
  } as unknown as SupabaseClient;
}

const hace = (horas: number) => new Date(Date.UTC(2026, 8, 24, 12 - horas)).toISOString();

describe('resolveOrgCurrency da lo mismo que fn_moneda_base_organizacion', () => {
  beforeEach(() => resetOrgCurrencyCache());
  const silenciar = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  afterAll(() => silenciar.mockRestore());

  // [escenario, datos, lo que devolvió el SQL en la prueba en transacción]
  const casos: Array<[string, Datos, string]> = [
    ['moneda base marcada', { asignadas: [{ currency_code: 'COP', is_base: true, created_at: hace(1) }] }, 'COP'],
    ['sin monedas, país por nombre (Colombia)', { country: 'Colombia' }, 'COP'],
    ['sin monedas, país por nombre con tilde (México)', { country: 'México' }, 'MXN'],
    ['sin monedas, alfa-3 MEX', { country_code: 'MEX' }, 'MXN'],
    ['alfa-3 fuera de la tabla (JPN) + nombre Colombia', { country_code: 'JPN', country: 'Colombia' }, 'COP'],
    ['alfa-3 JPN + nombre Japón (sin moneda en la tabla)', { country_code: 'JPN', country: 'Japón' }, 'USD'],
    ['primera asignada', { asignadas: [{ currency_code: 'EUR', is_base: false, created_at: hace(2) }] }, 'EUR'],
    [
      'primera asignada por created_at',
      {
        asignadas: [
          { currency_code: 'EUR', is_base: false, created_at: hace(2) },
          { currency_code: 'MXN', is_base: false, created_at: hace(3) },
        ],
      },
      'MXN',
    ],
    [
      'USD asignado gana a la primera',
      {
        asignadas: [
          { currency_code: 'EUR', is_base: false, created_at: hace(2) },
          { currency_code: 'MXN', is_base: false, created_at: hace(3) },
          { currency_code: 'USD', is_base: false, created_at: hace(1) },
        ],
      },
      'USD',
    ],
    [
      'preferencia asignada',
      {
        preferida: 'EUR',
        asignadas: [
          { currency_code: 'EUR', is_base: false, created_at: hace(2) },
          { currency_code: 'USD', is_base: false, created_at: hace(1) },
        ],
      },
      'EUR',
    ],
    [
      'preferencia NO asignada se ignora',
      {
        preferida: 'CLP',
        asignadas: [
          { currency_code: 'EUR', is_base: false, created_at: hace(2) },
          { currency_code: 'USD', is_base: false, created_at: hace(1) },
        ],
      },
      'USD',
    ],
    [
      'dos monedas base: se salta el paso 1',
      {
        preferida: 'CLP',
        asignadas: [
          { currency_code: 'EUR', is_base: true, created_at: hace(2) },
          { currency_code: 'MXN', is_base: true, created_at: hace(3) },
          { currency_code: 'USD', is_base: false, created_at: hace(1) },
        ],
      },
      'USD',
    ],
  ];

  test.each(casos)('%s', async (_nombre, datos, esperado) => {
    const r = await resolveOrgCurrency(cliente(datos), 4);
    expect(r.code).toBe(esperado);
  });
});
