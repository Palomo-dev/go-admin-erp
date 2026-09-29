/**
 * Acceso v3 — fase 2 (docs/design/AUTH-ACCESO-V2.md §13): lógica de las
 * pantallas de login, selección, recuperar, restablecer, verificación y
 * sesión vencida.
 */
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://proyectotest.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key-de-jest';

import { NextRequest } from 'next/server';

// --- Dobles para las rutas ---------------------------------------------------
const resend = jest.fn(async () => ({ error: null as null | { message: string; status?: number } }));
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { resend } }),
}));

let usuarioSesion: { id: string; email: string } | null = null;
let tokenSesion: string | null = null;
jest.mock('@/lib/supabase/server-user', () => ({
  getServerUserClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: usuarioSesion }, error: usuarioSesion ? null : { message: 'sin sesión' } }),
      getSession: async () => ({ data: { session: tokenSesion ? { access_token: tokenSesion } : null } }),
    },
  }),
}));

let veredicto: unknown = { estado: 'invalido', motivo: 'x' };
jest.mock('@/lib/auth/verificarTokenAcceso', () => ({
  verificarTokenAcceso: async () => veredicto,
}));

const updateUserById = jest.fn(async () => ({ error: null }));
const signOutAdmin = jest.fn(async () => ({ error: null }));
jest.mock('@/lib/supabase/admin', () => ({
  getSupabaseAdmin: () => ({ auth: { admin: { updateUserById, signOut: signOutAdmin } } }),
}));

import { avisoDesdeParametros, vieneDeSesionVencida, enmascararCorreoVisible } from '@/lib/auth/avisosAcceso';
import { ordenarOrganizaciones, extraerCodigoInvitacion, estadoOrganizacion, leerFavoritas } from '@/lib/auth/seleccionOrganizacion';
import { destinoSesionVencida, destinoVerificacionReenviada } from '@/lib/auth/redireccionesAcceso';
import { esSesionDeEnlaceReciente } from '@/lib/auth/sesionEnlace';
import { destinoTrasLogin } from '@/lib/auth/recuperacionSesion';
import { codigoDeErrorAuth, decidirOrganizacion, type OrganizacionDeUsuario } from '@/lib/auth/emailAuth';
import { _resetRateLimits } from '@/lib/security/rateLimit';

const p = (q: string) => new URLSearchParams(q);

beforeEach(() => {
  _resetRateLimits();
  resend.mockClear();
  updateUserById.mockClear();
  signOutAdmin.mockClear();
  usuarioSesion = null;
  tokenSesion = null;
  veredicto = { estado: 'invalido', motivo: 'x' };
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'info').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('login: catálogo único de avisos de la URL (R1)', () => {
  test('cada error conocido tiene su texto; los desconocidos, el genérico', () => {
    expect(avisoDesdeParametros(p('error=corrupted-session'))).toEqual({ tono: 'error', clave: 'errores.corrupted-session' });
    expect(avisoDesdeParametros(p('error=access_denied'))?.clave).toBe('errores.access_denied');
    expect(avisoDesdeParametros(p('error=lo-que-sea'))?.clave).toBe('errores.generico');
  });
  test('éxitos: correo confirmado, correo cambiado (antes no se mostraba) y contraseña', () => {
    expect(avisoDesdeParametros(p('success=email-confirmed&message=Texto%20inyectado'))).toEqual({ tono: 'exito', clave: 'correoConfirmado' });
    expect(avisoDesdeParametros(p('success=email-changed'))?.clave).toBe('correoCambiado');
    expect(avisoDesdeParametros(p('success=password-updated'))?.clave).toBe('contrasenaCambiada');
  });
  test('el texto de ?message= nunca se pinta', () => {
    const a = avisoDesdeParametros(p('success=email-confirmed&message=%3Cscript%3E'));
    expect(JSON.stringify(a)).not.toContain('script');
  });
  test('sesión vencida y salida', () => {
    expect(vieneDeSesionVencida(p('reason=expired'))).toBe(true);
    expect(vieneDeSesionVencida(p('reason=session-invalidated'))).toBe(true);
    expect(avisoDesdeParametros(p('reason=logout'))?.clave).toBe('sesionCerrada');
  });
});

describe('login: un solo mensaje de credenciales (sin enumeración)', () => {
  test('usuario inexistente y contraseña mala dan el mismo código', () => {
    expect(codigoDeErrorAuth({ message: 'Invalid login credentials' })).toBe('credenciales');
    expect(codigoDeErrorAuth({ message: 'User not found' })).toBe('credenciales');
    expect(codigoDeErrorAuth({ message: 'Email not confirmed' })).toBe('sin_confirmar');
    expect(codigoDeErrorAuth({ message: 'x', status: 429 })).toBe('demasiadas');
    expect(codigoDeErrorAuth({ message: 'algo raro de Supabase' })).toBe('inesperado');
  });
});

describe('selector único de organización (R4, v2-9)', () => {
  const org = (id: number, name: string, status = 'active') => ({ id, name, status }) as OrganizacionDeUsuario & { status: string };
  test('0 → estado vacío, 1 → se entra sin preguntar, 2+ → selector', () => {
    expect(decidirOrganizacion([])).toEqual({ tipo: 'ninguna' });
    expect(decidirOrganizacion([org(1, 'Mi empresa S.A.S.')]).tipo).toBe('una');
    expect(decidirOrganizacion([org(1, 'A'), org(2, 'B')]).tipo).toBe('varias');
  });
  test('principal primero, luego favoritas, luego por nombre; búsqueda sin tildes', () => {
    const lista = [org(1, 'Taller Los Andes'), org(2, 'Café de la Esquina'), org(3, 'Distribuidora del Norte')];
    expect(ordenarOrganizaciones(lista, { principalId: 3, favoritas: [1] }).map((o) => o.id)).toEqual([3, 1, 2]);
    expect(ordenarOrganizaciones(lista, { texto: 'cafe' }).map((o) => o.id)).toEqual([2]);
  });
  test('estados', () => {
    expect(estadoOrganizacion('suspended')).toBe('frozen');
    expect(estadoOrganizacion('trial_expired')).toBe('frozen');
    expect(estadoOrganizacion(null)).toBe('active');
  });
  test('favoritas guardadas: tolera basura', () => {
    expect(leerFavoritas({ getItem: () => '[1,"2",null]' })).toEqual([1, 2, 0]);
    expect(leerFavoritas({ getItem: () => '{roto' })).toEqual([]);
  });
  test('código de invitación pegado: enlace completo o solo el código (R6)', () => {
    const codigo = 'a'.repeat(64);
    expect(extraerCodigoInvitacion(`https://app.goadmin.io/auth/invite?invite_code=${codigo}`)).toBe(codigo);
    expect(extraerCodigoInvitacion(`  ${codigo} `)).toBe(codigo);
    expect(extraerCodigoInvitacion('no es un código!')).toBeNull();
  });
});

describe('redirectTo validado (R15)', () => {
  test.each([
    ['/app/pos?x=1', '/app/pos?x=1'],
    ['https://malicioso.example', '/app/inicio'],
    ['//malicioso.example', '/app/inicio'],
    ['/auth/login', '/app/inicio'],
    ['/auth/invite?invite_code=abc', '/auth/invite?invite_code=abc'],
  ])('%p → %p', (entrada, esperado) => {
    expect(destinoTrasLogin(entrada)).toBe(esperado);
  });
});

describe('rutas que redirigen (R2, R9)', () => {
  test('sesión vencida → login con reason=expired y regreso validado', () => {
    expect(destinoSesionVencida(p('redirectTo=/app/pos'))).toBe('/auth/login?reason=expired&redirectTo=%2Fapp%2Fpos');
    expect(destinoSesionVencida(p('redirectTo=https://x.example'))).toBe('/auth/login?reason=expired&redirectTo=%2Fapp%2Finicio');
    expect(destinoSesionVencida(p(''))).toBe('/auth/login?reason=expired');
  });
  test('enlace reenviado → pantalla única en estado reenviado', () => {
    expect(destinoVerificacionReenviada(p('email=ana@ejemplo.com'))).toBe('/auth/verify/failed?estado=reenviado&email=ana%40ejemplo.com');
  });
  test('los route handlers responden 308', async () => {
    const { GET: sesion } = await import('@/app/auth/session-expired/route');
    const r1 = sesion(new NextRequest('https://app.goadmin.io/auth/session-expired?redirectTo=/app/crm'));
    expect(r1.status).toBe(308);
    expect(new URL(r1.headers.get('location')!).searchParams.get('reason')).toBe('expired');
    const { GET: reenviado } = await import('@/app/auth/verify/resent/route');
    const r2 = reenviado(new NextRequest('https://app.goadmin.io/auth/verify/resent?email=ana@ejemplo.com'));
    expect(r2.status).toBe(308);
    expect(new URL(r2.headers.get('location')!).pathname).toBe('/auth/verify/failed');
  });
  test('el correo de la URL se muestra enmascarado', () => {
    expect(enmascararCorreoVisible('ana.gomez@ejemplo.com')).toBe('an•••@ejemplo.com');
    expect(enmascararCorreoVisible('<script>')).toBeNull();
  });
});

describe('restablecer: solo con sesión abierta desde el enlace del correo (R8)', () => {
  const ahora = Math.floor(Date.now() / 1000);
  test('métodos y ventana', () => {
    expect(esSesionDeEnlaceReciente([{ method: 'recovery', timestamp: ahora - 60 }], ahora)).toBe(true);
    expect(esSesionDeEnlaceReciente([{ method: 'password', timestamp: ahora - 60 }], ahora)).toBe(false);
    expect(esSesionDeEnlaceReciente([{ method: 'oauth', timestamp: ahora }], ahora)).toBe(false);
    expect(esSesionDeEnlaceReciente([{ method: 'recovery', timestamp: ahora - 7200 }], ahora)).toBe(false);
    expect(esSesionDeEnlaceReciente(undefined, ahora)).toBe(false);
  });

  async function post(cuerpo: unknown) {
    const { POST } = await import('@/app/api/auth/restablecer/route');
    return POST(new Request('https://app.goadmin.io/api/auth/restablecer', { method: 'POST', body: JSON.stringify(cuerpo) }));
  }

  test('con una sesión normal (contraseña) → 403 enlace_vencido y no cambia nada', async () => {
    usuarioSesion = { id: 'u1', email: 'ana@ejemplo.com' };
    tokenSesion = 't';
    veredicto = { estado: 'valido', metodo: 'secreto-local', claims: { sub: 'u1', exp: ahora + 3600, role: 'authenticated', amr: [{ method: 'password', timestamp: ahora - 10 }] } };
    const res = await post({ password: 'una frase bastante larga' });
    expect(res.status).toBe(403);
    expect(updateUserById).not.toHaveBeenCalled();
  });

  test('sin sesión → 401', async () => {
    const res = await post({ password: 'una frase bastante larga' });
    expect(res.status).toBe(401);
    expect(updateUserById).not.toHaveBeenCalled();
  });

  test('con sesión de recuperación: aplica la política única y cierra las otras sesiones', async () => {
    usuarioSesion = { id: 'u1', email: 'ana@ejemplo.com' };
    tokenSesion = 't';
    veredicto = { estado: 'valido', metodo: 'secreto-local', claims: { sub: 'u1', exp: ahora + 3600, role: 'authenticated', amr: [{ method: 'recovery', timestamp: ahora - 10 }] } };
    const corta = await post({ password: 'corta' });
    expect(corta.status).toBe(400);
    expect(await corta.json()).toMatchObject({ codigo: 'longitud' });
    const igual = await post({ password: 'ana@ejemplo.com' });
    expect(await igual.json()).toMatchObject({ codigo: 'igual_al_correo' });
    global.fetch = jest.fn(async () => new Response('ABCDEF:1\n')) as unknown as typeof fetch;
    const ok = await post({ password: 'una frase bastante larga', cerrarOtras: true });
    expect(ok.status).toBe(200);
    expect(updateUserById).toHaveBeenCalledWith('u1', { password: 'una frase bastante larga' });
    expect(signOutAdmin).toHaveBeenCalledWith('t', 'others');
  });
});

describe('reenviar confirmación: respuesta uniforme', () => {
  async function post(email: string, ip = '198.51.100.20') {
    const { POST } = await import('@/app/api/auth/reenviar-confirmacion/route');
    return POST(new Request('https://app.goadmin.io/api/auth/reenviar-confirmacion', {
      method: 'POST',
      headers: { 'x-forwarded-for': ip, origin: 'https://app.goadmin.io' },
      body: JSON.stringify({ email }),
    }));
  }
  test('igual si Auth dice que no existe o que ya está confirmada', async () => {
    resend.mockResolvedValueOnce({ error: { message: 'User not found', status: 400 } });
    const a = await post('nadie@ejemplo.com');
    const b = await post('ana@ejemplo.com');
    expect(a.status).toBe(200);
    expect(await a.json()).toEqual(await b.json());
  });
  test('límite por correo destino aunque cambie la IP', async () => {
    for (let i = 0; i < 3; i++) expect((await post('ana@ejemplo.com', `203.0.113.${i}`)).status).toBe(200);
    expect((await post('ana@ejemplo.com', '203.0.113.99')).status).toBe(429);
  });
});
