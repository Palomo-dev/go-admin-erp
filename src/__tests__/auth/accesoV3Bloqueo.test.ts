/**
 * Acceso v3 — fase 5 (docs/design/AUTH-ACCESO-V2.md §12.4): el login pasa por
 * POST /api/auth/acceso, que cuenta los fallos en el servidor y bloquea 15 min.
 * El contador real vive en la base (fn_acceso_*, probado en transacción); aquí
 * se simula con un doble que aplica las mismas reglas.
 */
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://proyectotest.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key-de-jest';

// --- Doble del contador (misma regla que fn_acceso_registrar_fallo) ----------
const fallos = new Map<string, number>();
const bloqueos = new Map<string, Date>();
let contadorCaido = false;
const rpc = jest.fn(async (fn: string, args: Record<string, unknown>) => {
  if (contadorCaido) return { data: null, error: { message: 'timeout' } };
  if (fn === 'fn_acceso_bloqueo_vigente') {
    const vigentes = (args.p_claves as string[]).map((c) => bloqueos.get(c)).filter((d): d is Date => !!d && d > new Date());
    return { data: vigentes.length ? new Date(Math.max(...vigentes.map((d) => d.getTime()))).toISOString() : null, error: null };
  }
  if (fn === 'fn_acceso_registrar_fallo') {
    let hasta: Date | null = null;
    for (const { clave, limite } of args.p_entradas as { clave: string; limite: number }[]) {
      const n = (fallos.get(clave) ?? 0) + 1;
      fallos.set(clave, n);
      if (n >= limite) bloqueos.set(clave, new Date(Date.now() + 15 * 60 * 1000));
      const b = bloqueos.get(clave);
      if (b && (!hasta || b > hasta)) hasta = b;
    }
    return { data: hasta ? hasta.toISOString() : null, error: null };
  }
  if (fn === 'fn_acceso_limpiar') {
    fallos.delete(args.p_clave as string);
    return { data: null, error: null };
  }
  return { data: null, error: { message: `rpc inesperada ${fn}` } };
});
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: () => ({ rpc }) }));

// --- Doble de Auth -----------------------------------------------------------
const CONTRASENA_BUENA = 'una-clave-larga-y-buena';
const signInWithPassword = jest.fn(async ({ email, password }: { email: string; password: string }) => {
  if (email === 'sin-confirmar@ejemplo.com' && password === CONTRASENA_BUENA) {
    return { data: { session: null, user: null }, error: { message: 'Email not confirmed', status: 400, code: 'email_not_confirmed' } };
  }
  if (email === 'ana@ejemplo.com' && password === CONTRASENA_BUENA) {
    return { data: { session: { access_token: 'at', refresh_token: 'rt', expires_at: 1, user: { id: 'u-1', email } }, user: { id: 'u-1' } }, error: null };
  }
  return { data: { session: null, user: null }, error: { message: 'Invalid login credentials', status: 400, code: 'invalid_credentials' } };
});
jest.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth: { signInWithPassword } }) }));

import { POST } from '@/app/api/auth/acceso/route';
import { clavesDeAcceso } from '@/lib/auth/bloqueoAcceso';
import { _resetRateLimits } from '@/lib/security/rateLimit';

function peticion(cuerpo: unknown, ip = '203.0.113.7') {
  return new Request('http://localhost/api/auth/acceso', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(cuerpo),
  });
}

beforeEach(() => {
  _resetRateLimits();
  fallos.clear();
  bloqueos.clear();
  contadorCaido = false;
  rpc.mockClear();
  signInWithPassword.mockClear();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('claves del contador', () => {
  test('SHA-256: ni el correo ni la IP quedan en claro', () => {
    const c = clavesDeAcceso('ana@ejemplo.com', '203.0.113.7');
    expect(c.cuentaIp).toMatch(/^c:[0-9a-f]{64}$/);
    expect(c.ip).toMatch(/^i:[0-9a-f]{64}$/);
    expect(JSON.stringify(c)).not.toContain('ana');
    expect(JSON.stringify(c)).not.toContain('203.0.113.7');
  });
  test('la misma cuenta desde otra IP es otra clave; la IP es común a todas las cuentas', () => {
    const a = clavesDeAcceso('ana@ejemplo.com', '203.0.113.7');
    expect(clavesDeAcceso('ana@ejemplo.com', '198.51.100.1').cuentaIp).not.toBe(a.cuentaIp);
    expect(clavesDeAcceso('otra@ejemplo.com', '203.0.113.7').ip).toBe(a.ip);
  });
});

describe('POST /api/auth/acceso', () => {
  test('credenciales correctas: devuelve la sesión y limpia el contador de cuenta + IP', async () => {
    const res = await POST(peticion({ email: ' Ana@Ejemplo.com ', password: CONTRASENA_BUENA }));
    expect(res.status).toBe(200);
    const cuerpo = await res.json();
    expect(cuerpo.ok).toBe(true);
    expect(cuerpo.session.access_token).toBe('at');
    expect(signInWithPassword).toHaveBeenCalledWith({ email: 'ana@ejemplo.com', password: CONTRASENA_BUENA });
    expect(rpc).toHaveBeenCalledWith('fn_acceso_limpiar', { p_clave: clavesDeAcceso('ana@ejemplo.com', '203.0.113.7').cuentaIp });
  });

  test('mismo mensaje para contraseña mala y para cuenta que no existe', async () => {
    const mala = await POST(peticion({ email: 'ana@ejemplo.com', password: 'no-es-esta-clave' }));
    const noExiste = await POST(peticion({ email: 'nadie@ejemplo.com', password: 'no-es-esta-clave' }));
    expect(mala.status).toBe(401);
    expect(noExiste.status).toBe(401);
    expect(await mala.json()).toEqual(await noExiste.json());
  });

  test('5 fallos bloquean 15 min, y durante el bloqueo ni la contraseña buena entra (ni se consulta Auth)', async () => {
    for (let i = 1; i <= 4; i++) {
      const r = await POST(peticion({ email: 'ana@ejemplo.com', password: `mala-${i}-xxxxxx` }));
      expect(r.status).toBe(401);
    }
    const quinto = await POST(peticion({ email: 'ana@ejemplo.com', password: 'mala-5-xxxxxx' }));
    expect(quinto.status).toBe(429);
    const cuerpo = await quinto.json();
    expect(cuerpo.codigo).toBe('bloqueado');
    const minutos = (new Date(cuerpo.bloqueadoHasta).getTime() - Date.now()) / 60000;
    expect(minutos).toBeGreaterThan(14);
    expect(minutos).toBeLessThanOrEqual(15);

    signInWithPassword.mockClear();
    const buena = await POST(peticion({ email: 'ana@ejemplo.com', password: CONTRASENA_BUENA }));
    expect(buena.status).toBe(429);
    expect((await buena.json()).codigo).toBe('bloqueado');
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  test('el bloqueo es por cuenta + IP: la misma cuenta desde otra IP sigue pudiendo entrar', async () => {
    for (let i = 1; i <= 5; i++) await POST(peticion({ email: 'ana@ejemplo.com', password: `mala-${i}-xxxxxx` }));
    const otraIp = await POST(peticion({ email: 'ana@ejemplo.com', password: CONTRASENA_BUENA }, '198.51.100.1'));
    expect(otraIp.status).toBe(200);
  });

  test('20 fallos desde una IP (cuentas distintas) bloquean esa IP', async () => {
    let ultimo: Response | null = null;
    for (let i = 1; i <= 20; i++) ultimo = await POST(peticion({ email: `cuenta${i}@ejemplo.com`, password: 'mala-xxxxxxxx' }));
    expect(ultimo!.status).toBe(429);
    const otra = await POST(peticion({ email: 'ana@ejemplo.com', password: CONTRASENA_BUENA }));
    expect((await otra.json()).codigo).toBe('bloqueado');
  });

  test('cuenta sin confirmar: solo lo sabe quien acertó la contraseña', async () => {
    const r = await POST(peticion({ email: 'sin-confirmar@ejemplo.com', password: CONTRASENA_BUENA }));
    expect(r.status).toBe(403);
    expect((await r.json()).codigo).toBe('sin_confirmar');
    const mala = await POST(peticion({ email: 'sin-confirmar@ejemplo.com', password: 'otra-clave-xxxx' }));
    expect((await mala.json()).codigo).toBe('credenciales');
  });

  test('si el contador no responde, falla cerrado y no consulta Auth', async () => {
    contadorCaido = true;
    const r = await POST(peticion({ email: 'ana@ejemplo.com', password: CONTRASENA_BUENA }));
    expect(r.status).toBe(503);
    expect((await r.json()).codigo).toBe('inesperado');
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  test('sin correo válido o sin contraseña: credenciales, sin tocar Auth ni el contador', async () => {
    const r = await POST(peticion({ email: 'no-es-un-correo', password: 'x' }));
    expect(r.status).toBe(401);
    expect(signInWithPassword).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  test('la respuesta nunca incluye el texto crudo de Supabase', async () => {
    const r = await POST(peticion({ email: 'ana@ejemplo.com', password: 'mala-xxxxxxxx' }));
    expect(JSON.stringify(await r.json())).not.toMatch(/Invalid login credentials/i);
  });
});
