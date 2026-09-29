/**
 * Credenciales de Factus por organización: solo el servidor las lee (RPC con
 * service role), la cuenta demo del entorno nunca sirve en producción
 * (fail-closed) y la activación exige que el NIT de la cuenta sea el de la
 * organización. Además, comprobaciones estáticas de las migraciones: las
 * funciones que tocan secretos no se pueden ejecutar desde el cliente y las
 * columnas secretas no se pueden leer.
 */

import fs from 'fs';
import path from 'path';
import { crearDobleSupabase, type Tablas } from './dobleSupabase';

let db: ReturnType<typeof crearDobleSupabase>;
jest.mock('@/lib/supabase/server-service', () => ({
  getServiceClient: () => db,
  assertServerOnly: () => undefined,
}));
const getCompany = jest.fn();
const authenticate = jest.fn(async () => ({ accessToken: 't', refreshToken: 'r', expiresAt: new Date(Date.now() + 3600_000) }));
jest.mock('@/lib/services/factusService', () => {
  const real = jest.requireActual('@/lib/services/factusService');
  return {
    ...real,
    __esModule: true,
    default: { ...real.default, getCompany: (...a: unknown[]) => getCompany(...a), authenticate: (...a: unknown[]) => authenticate(...(a as [])) },
  };
});

import { getCredentials, esDespliegueDeProduccion, clearTokenCache } from '@/lib/services/factusTokenManager';
import {
  obtenerAccesoFactus,
  verificarYActivar,
  nitCoincide,
  FacturacionNoActivadaError,
} from '@/lib/services/einvoicing/accesoFactus.server';
import { OrgContextError } from '@/lib/utils/orgContextError';

const ENV_ORIGINAL = { ...process.env };
let credsOrg: Record<string, unknown> | null;
let estados: Array<Record<string, unknown>>;

function crearDb(tablas: Tablas = { organizations: [{ id: 132, nit: '900123456-7', city: 'Medellín', address: 'Calle 10 # 5-20' }] }) {
  return crearDobleSupabase(tablas, {
    fn_factus_credenciales_leer: () => ({ data: credsOrg ? [credsOrg] : [] }),
    fn_factus_servicio_estado: (args) => {
      estados.push(args);
      return { data: args.p_status };
    },
  });
}

beforeEach(() => {
  process.env = { ...ENV_ORIGINAL, FACTUS_CLIENT_ID: 'demo', FACTUS_CLIENT_SECRET: 'demo', FACTUS_USERNAME: 'demo', FACTUS_PASSWORD: 'demo' };
  delete process.env.FACTUS_ENVIRONMENT;
  delete process.env.VERCEL_ENV;
  credsOrg = null;
  estados = [];
  clearTokenCache();
  jest.clearAllMocks();
  db = crearDb();
});
afterAll(() => {
  process.env = ENV_ORIGINAL;
});

describe('cuenta demo del entorno: solo desarrollo (fail-closed en producción)', () => {
  test('en desarrollo existe y siempre es sandbox', () => {
    process.env.FACTUS_ENVIRONMENT = 'sandbox';
    expect(getCredentials()).toMatchObject({ environment: 'sandbox', clientId: 'demo' });
  });

  test('FACTUS_ENVIRONMENT=production → no hay cuenta de entorno', () => {
    process.env.FACTUS_ENVIRONMENT = 'production';
    expect(esDespliegueDeProduccion()).toBe(true);
    expect(getCredentials()).toBeNull();
  });

  test('despliegue de producción en Vercel → tampoco', () => {
    process.env.FACTUS_ENVIRONMENT = 'sandbox';
    process.env.VERCEL_ENV = 'production';
    expect(getCredentials()).toBeNull();
  });

  test('producción + organización sin credenciales → 409 aunque se pida la demo', async () => {
    process.env.FACTUS_ENVIRONMENT = 'production';
    const err = await obtenerAccesoFactus(132, { permitirDemoDesarrollo: true }).catch((e) => e);
    expect(err).toBeInstanceOf(FacturacionNoActivadaError);
    expect(err).toBeInstanceOf(OrgContextError);
    expect(err.statusCode).toBe(409);
    expect(authenticate).not.toHaveBeenCalled();
  });

  test('desarrollo sin pedir la demo → tampoco se usa', async () => {
    await expect(obtenerAccesoFactus(132)).rejects.toBeInstanceOf(FacturacionNoActivadaError);
  });
});

describe('credenciales de la organización', () => {
  test('se leen por la RPC del servidor y ganan a la demo', async () => {
    credsOrg = { environment: 'production', client_id: 'cid', client_secret: 'sec', username: 'u', password: 'p', service_status: 'active', factus_company_nit: '900123456' };
    const acceso = await obtenerAccesoFactus(132, { permitirDemoDesarrollo: true });
    expect(acceso).toMatchObject({ origen: 'organizacion', environment: 'production', accessToken: 't' });
    expect(db.llamadas[0]).toEqual({ nombre: 'fn_factus_credenciales_leer', args: { p_organization_id: 132, p_incluir_pendiente: false } });
    expect(authenticate).toHaveBeenCalledWith(expect.objectContaining({ clientId: 'cid', environment: 'production' }));
  });
});

describe('verificarYActivar', () => {
  beforeEach(() => {
    credsOrg = { environment: 'sandbox', client_id: 'cid', client_secret: 'sec', username: 'u', password: 'p', service_status: 'pending_activation', factus_company_nit: null };
  });

  test('NIT de la cuenta = NIT de la organización (sin DV) → activa', async () => {
    getCompany.mockResolvedValue({ nit: '900123456', dv: '7', name: 'Empresa' });
    const r = await verificarYActivar(132, 'usuario-1');
    expect(r).toMatchObject({ ok: true, activado: true, nitFactus: '900123456' });
    expect(estados[0]).toMatchObject({ p_organization_id: 132, p_status: 'active', p_company_nit: '900123456', p_check_ok: true, p_actor: 'usuario-1' });
  });

  test('cuenta de otro NIT (p. ej. la demo) → no activa y queda registrado', async () => {
    getCompany.mockResolvedValue({ nit: '1000789002', dv: '2', name: 'Otra' });
    const r = await verificarYActivar(132);
    expect(r).toMatchObject({ ok: false, activado: false });
    expect(estados[0]).toMatchObject({ p_status: 'pending_activation', p_company_nit: null, p_check_ok: false });
  });

  test('faltan ciudad y dirección de la empresa → no activa, lo dice y no lo registra como fallo de credenciales', async () => {
    db = crearDb({ organizations: [{ id: 132, nit: '900123456-7', city: ' ', address: null }] });
    getCompany.mockResolvedValue({ nit: '900123456', dv: '7', name: 'Empresa' });
    const r = await verificarYActivar(132, 'usuario-1');
    expect(r).toMatchObject({ ok: false, activado: false, datosFaltantes: ['ciudad', 'direccion'] });
    expect(r.mensaje).toContain('la ciudad y la dirección');
    expect(estados).toHaveLength(0);
  });

  test('sin NIT (ni nit ni tax_id) → no activa', async () => {
    db = crearDb({ organizations: [{ id: 132, nit: null, tax_id: '', city: 'Medellín', address: 'Calle 10 # 5-20' }] });
    getCompany.mockResolvedValue({ nit: '900123456', dv: '7', name: 'Empresa' });
    const r = await verificarYActivar(132);
    expect(r).toMatchObject({ ok: false, activado: false, datosFaltantes: ['nit'] });
  });

  test('Factus caído → no registra nada (el cron reintenta)', async () => {
    const { FactusApiError } = jest.requireActual('@/lib/services/factusService');
    getCompany.mockRejectedValue(new FactusApiError('Bad Gateway', 502));
    const r = await verificarYActivar(132);
    expect(r.ok).toBe(false);
    expect(estados).toHaveLength(0);
  });

  test('sin credenciales cargadas → mensaje, sin llamar a Factus', async () => {
    credsOrg = null;
    const r = await verificarYActivar(132);
    expect(r.ok).toBe(false);
    expect(getCompany).not.toHaveBeenCalled();
  });
});

describe('nitCoincide', () => {
  test.each([
    ['900123456', '900123456', true],
    ['900.123.456-7', '900123456', true],
    ['9001234567', '900123456', true],
    ['900123457', '900123456', false],
    ['', '900123456', false],
    ['900123456', '1000789002', false],
  ])('%s vs %s → %s', (org, factus, esperado) => {
    expect(nitCoincide(org, factus)).toBe(esperado);
  });
});

describe('migraciones: secretos solo en el servidor', () => {
  const dir = path.join(process.cwd(), 'supabase', 'migrations');
  const sql = ['20260924031326_factus_servicio_plataforma_cola.sql', '20260924031821_factus_cola_retencion.sql']
    .map((f) => fs.readFileSync(path.join(dir, f), 'utf8'))
    .join('\n');

  test('cada función SECURITY DEFINER se revoca a public, anon y authenticated y se concede solo a service_role', () => {
    const nombres = Array.from(sql.matchAll(/create or replace function public\.(\w+)\(/g)).map((m) => m[1]);
    const definer = nombres.filter((n) => {
      const bloque = sql.slice(sql.indexOf(`function public.${n}(`), sql.indexOf('$$;', sql.indexOf(`function public.${n}(`)));
      return /security definer/i.test(bloque.split('as $$')[0]);
    });
    expect(definer.length).toBeGreaterThanOrEqual(6);
    for (const n of definer) {
      expect(sql).toMatch(new RegExp(`revoke all on function public\\.${n}\\([^)]*\\) from public, anon, authenticated`));
      expect(sql).toMatch(new RegExp(`grant execute on function public\\.${n}\\([^)]*\\) to service_role`));
      expect(sql).not.toMatch(new RegExp(`grant execute on function public\\.${n}\\([^)]*\\) to (anon|authenticated)`));
    }
  });

  test('las columnas secretas no se conceden al cliente y el texto plano está bloqueado', () => {
    expect(sql).toMatch(/revoke all on public\.electronic_invoicing_config from anon, authenticated/);
    const grant = /grant select \(([^)]*)\) on public\.electronic_invoicing_config to authenticated/.exec(sql);
    expect(grant).not.toBeNull();
    const columnas = grant![1].split(',').map((c) => c.trim());
    for (const secreta of ['client_secret', 'password', 'client_id', 'username', 'credentials_secret_id', 'last_check_message']) {
      expect(columnas).not.toContain(secreta);
    }
    expect(sql).toMatch(/trg_eic_sin_secretos_en_claro/);
    expect(sql).toMatch(/vault\.create_secret/);
  });

  test('ningún componente de cliente llama a las RPC de credenciales ni al módulo de acceso', () => {
    const raiz = path.join(process.cwd(), 'src');
    const hallazgos: string[] = [];
    const recorrer = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) {
          if (e.name !== '__tests__' && e.name !== 'node_modules') recorrer(p);
        } else if (/\.(tsx?|jsx?)$/.test(e.name)) {
          const t = fs.readFileSync(p, 'utf8');
          if (/^\s*['"]use client['"]/.test(t) && /(fn_factus_credenciales|accesoFactus\.server|colaFacturacion\.server)/.test(t)) {
            hallazgos.push(path.relative(raiz, p));
          }
        }
      }
    };
    recorrer(raiz);
    expect(hallazgos).toEqual([]);
  });
});
