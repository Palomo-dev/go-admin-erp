/**
 * Middleware · módulo no habilitado (docs/design/MODULO-NO-HABILITADO.md, §5.1
 * y §5.5; decisiones del dueño del 2026-11-08).
 *
 * - Un módulo apagado, un cargo sin acceso o una página oculta ya NO redirigen a
 *   `/app/inicio?error=…`: se REESCRIBE a la ruta interna y la URL no cambia.
 * - La página oculta también se cierra por enlace directo.
 * - Fail open: si una consulta falla, se deja pasar.
 * - La suscripción vencida sigue redirigiendo a `/app/cuenta-congelada`.
 */

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://proyectotest.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key-de-jest';
process.env.GATE_COOKIE_SECRET = 'secreto-de-la-cookie-de-veredicto-de-jest';

import { NextRequest } from 'next/server';
import type { NextFetchEvent } from 'next/server';
import { SignJWT } from 'jose';
import { middleware } from '@/middleware';
import { _reiniciarVerificadorParaTests } from '@/lib/auth/verificarTokenAcceso';
import { _resetRateLimits } from '@/lib/security/rateLimit';

const SECRETO = 'k3Jd9Qz7Lp2Xw8Rt5Yv1Bn4Mc6Hg0Fs-secreto-jwt-de-jest-modulo-no-habilitado';
const COOKIE = 'sb-proyectotest-auth-token';
const SUB = '11111111-2222-3333-4444-555555555555';
const ORG = 120;
const CARGO = 'aaaaaaaa-0000-4000-8000-000000000001';
const evento = { waitUntil: () => undefined } as unknown as NextFetchEvent;
const originalFetch = global.fetch;

/** Lo que responde la base simulada; `null` = la consulta falla (500). */
interface Base {
  modulosActivos: string[] | null;
  nucleo: Record<string, boolean>;
  miembro: { id: number; is_super_admin: boolean; job_position_id: string | null } | null;
  accesoCargo: { module_code: string; can_access: boolean }[] | null;
  ocultas: Record<string, string[]> | null;
  suscripcion: { status: string; trial_end: string | null; current_period_end: string | null } | null;
}
let base: Base;
const consultas: string[] = [];

function responder(url: string): Response {
  const u = new URL(url);
  const tabla = u.pathname.replace('/rest/v1/', '');
  const q = u.searchParams;
  consultas.push(`${tabla}?${q.toString()}`);
  const json = (v: unknown) => new Response(JSON.stringify(v), { status: 200 });
  const falla = () => new Response('{}', { status: 500 });
  const codigo = (q.get('module_code') ?? q.get('code') ?? '').replace('eq.', '');
  switch (tabla) {
    case 'organizations':
      return json([{ id: ORG, status: 'active' }]);
    case 'subscriptions':
      return json(base.suscripcion ? [{ ...base.suscripcion, stripe_subscription_id: null, stripe_customer_id: null }] : []);
    case 'organization_modules':
      return base.modulosActivos === null ? falla() : json(base.modulosActivos.includes(codigo) ? [{ is_active: true }] : []);
    case 'modules':
      return json(codigo in base.nucleo ? [{ is_core: base.nucleo[codigo] }] : []);
    case 'organization_members':
      return json(base.miembro ? [base.miembro] : []);
    case 'employments':
      return json([]);
    case 'job_position_module_access':
      return base.accesoCargo === null ? falla() : json(base.accesoCargo);
    case 'organization_module_pages':
      return base.ocultas === null ? falla() : json((base.ocultas[codigo] ?? []).map((page_href) => ({ page_href })));
    default:
      return json([]);
  }
}

const ahora = () => Math.floor(Date.now() / 1000);
async function firmar(): Promise<string> {
  return new SignJWT({ role: 'authenticated', aud: 'authenticated' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(SUB)
    .setIssuedAt()
    .setExpirationTime(ahora() + 3600)
    .sign(new TextEncoder().encode(SECRETO));
}
async function pedir(ruta: string, extra = ''): Promise<Response> {
  const sesion = `${COOKIE}=${encodeURIComponent(JSON.stringify({ access_token: await firmar(), refresh_token: 'r' }))}`;
  const req = new NextRequest(`https://app.goadmin.io${ruta}`, { headers: { cookie: `${sesion}; org_id=${ORG}${extra}` } });
  return middleware(req, evento);
}
/** Cookie de veredicto que dejó una respuesta, lista para mandarla en la siguiente. */
function cookieVeredicto(res: Response): string {
  const valor = res.headers.get('set-cookie')?.match(/ga_gate=([^;]+)/)?.[1];
  return valor ? `; ga_gate=${valor}` : '';
}
const reescritura = (res: Response) => {
  const v = res.headers.get('x-middleware-rewrite');
  return v ? new URL(v) : null;
};
const pasa = (res: Response) => res.headers.get('x-middleware-next') === '1';

beforeEach(() => {
  _reiniciarVerificadorParaTests();
  _resetRateLimits();
  process.env.SUPABASE_JWT_SECRET = SECRETO;
  consultas.length = 0;
  base = {
    modulosActivos: ['pos', 'finance'],
    nucleo: { pos: false, finance: false, crm: false, organizations: true, configuracion: true },
    miembro: { id: 9, is_super_admin: false, job_position_id: null },
    accesoCargo: [],
    ocultas: {},
    suscripcion: null,
  };
  global.fetch = jest.fn(async (url: RequestInfo | URL) => responder(String(url))) as unknown as typeof fetch;
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  global.fetch = originalFetch;
  jest.restoreAllMocks();
});

describe('módulo apagado', () => {
  it('reescribe a la pantalla interna y NO redirige: la URL no cambia', async () => {
    const res = await pedir('/app/crm/leads');
    expect(res.headers.get('location')).toBeNull();
    const destino = reescritura(res);
    expect(destino?.pathname).toBe('/app/modulo-no-habilitado');
    expect(destino?.searchParams.get('ruta')).toBe('/app/crm/leads');
    expect(destino?.searchParams.get('bloqueo')).toBe('modulo');
    expect(destino?.searchParams.get('modulo')).toBe('crm');
  });

  it('un módulo básico sin fila activa sigue abierto', async () => {
    const res = await pedir('/app/configuracion');
    expect(pasa(res)).toBe(true);
    expect(reescritura(res)).toBeNull();
  });

  it('fail open: si la consulta del módulo falla, deja pasar', async () => {
    base.modulosActivos = null;
    expect(pasa(await pedir('/app/crm'))).toBe(true);
  });

  it('fail open: un módulo que `modules` no conoce no se bloquea', async () => {
    base.nucleo = {};
    expect(pasa(await pedir('/app/crm'))).toBe(true);
  });

  it('las rutas del catálogo que el mapa viejo no tenía también se protegen (/app/pm)', async () => {
    base.nucleo.pm = false;
    expect(reescritura(await pedir('/app/pm/tareas'))?.searchParams.get('modulo')).toBe('pm');
  });
});

describe('cargo sin acceso', () => {
  it('reescribe con bloqueo=cargo', async () => {
    base.miembro = { id: 9, is_super_admin: false, job_position_id: CARGO };
    base.accesoCargo = [{ module_code: 'pos', can_access: true }];
    const res = await pedir('/app/finanzas');
    expect(res.headers.get('location')).toBeNull();
    expect(reescritura(res)?.searchParams.get('bloqueo')).toBe('cargo');
  });

  it('el super admin no tiene restricción por cargo', async () => {
    base.miembro = { id: 9, is_super_admin: true, job_position_id: CARGO };
    base.accesoCargo = [{ module_code: 'pos', can_access: true }];
    expect(pasa(await pedir('/app/finanzas'))).toBe(true);
  });

  it('fail open: si no se pueden leer las filas del cargo, deja pasar', async () => {
    base.miembro = { id: 9, is_super_admin: false, job_position_id: CARGO };
    base.accesoCargo = null;
    expect(pasa(await pedir('/app/finanzas'))).toBe(true);
  });
});

describe('página oculta', () => {
  it('se cierra también por enlace directo, incluida una subruta', async () => {
    base.ocultas = { pos: ['/app/pos/devoluciones'] };
    for (const ruta of ['/app/pos/devoluciones', '/app/pos/devoluciones/123']) {
      const res = await pedir(ruta);
      expect(res.headers.get('location')).toBeNull();
      expect(reescritura(res)?.searchParams.get('bloqueo')).toBe('pagina');
      expect(reescritura(res)?.searchParams.get('ruta')).toBe(ruta);
    }
  });

  it('las demás páginas del módulo siguen abiertas (gana la página más específica)', async () => {
    base.ocultas = { pos: ['/app/pos'] };
    expect(pasa(await pedir('/app/pos/ventas'))).toBe(true);
    expect(reescritura(await pedir('/app/pos'))?.searchParams.get('bloqueo')).toBe('pagina');
  });

  it('con la cookie de veredicto: otra página del módulo no consulta; la oculta se vuelve a comprobar y se cierra', async () => {
    base.ocultas = { pos: ['/app/pos/devoluciones'] };
    const primera = await pedir('/app/pos/ventas');
    expect(pasa(primera)).toBe(true);
    const cookie = cookieVeredicto(primera);
    expect(cookie).not.toBe('');

    consultas.length = 0;
    expect(pasa(await pedir('/app/pos/cajas', cookie))).toBe(true);
    expect(consultas.some((c) => c.startsWith('organization_modules'))).toBe(false);

    const oculta = await pedir('/app/pos/devoluciones', cookie);
    expect(reescritura(oculta)?.searchParams.get('bloqueo')).toBe('pagina');
  });

  it('fail open: si no se pueden leer las páginas ocultas, deja pasar', async () => {
    base.ocultas = null;
    expect(pasa(await pedir('/app/pos/devoluciones'))).toBe(true);
  });
});

describe('suscripción vencida (causa E)', () => {
  it('sigue redirigiendo a /app/cuenta-congelada antes de mirar el módulo', async () => {
    base.suscripcion = { status: 'canceled', trial_end: null, current_period_end: null };
    const res = await pedir('/app/crm');
    const loc = res.headers.get('location');
    expect(loc && new URL(loc).pathname).toBe('/app/cuenta-congelada');
    expect(reescritura(res)).toBeNull();
    expect(consultas.some((c) => c.startsWith('organization_modules'))).toBe(false);
  });
});

describe('nunca más ?error=module_not_activated', () => {
  it('el middleware no fabrica esos parámetros', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fuente = require('fs').readFileSync(require('path').join(process.cwd(), 'src/middleware.ts'), 'utf8') as string;
    expect(fuente).not.toMatch(/module_not_activated|job_position_no_access/);
  });

  it('ModuleAccessDenied (se montaba sin organización y sin acción) no vuelve', () => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    /* eslint-enable @typescript-eslint/no-require-imports */
    const raiz = path.join(process.cwd(), 'src');
    expect(fs.existsSync(path.join(raiz, 'components/modules/ModuleAccessDenied.tsx'))).toBe(false);
    const inicio = fs.readFileSync(path.join(raiz, 'app/app/inicio/page.tsx'), 'utf8');
    expect(inicio).not.toMatch(/ModuleAccessDenied|module_not_activated|job_position_no_access/);
  });
});
