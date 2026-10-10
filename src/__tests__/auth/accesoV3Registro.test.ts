/**
 * Acceso v3 — fase 3 (docs/design/AUTH-ACCESO-V2.md §13): registro dividido
 * (cuenta → confirmar correo → organización, sucursal, plan y pago), ubicación
 * (país del navegador, ciudad con buscador, «misma ubicación») y un solo alta
 * de organización.
 */
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://proyectotest.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key-de-jest';

// --- Dobles para /api/auth/registro -----------------------------------------
let correoExiste = false;
const createUser = jest.fn(async () => ({ data: { user: { id: 'nuevo-1' } }, error: null }));
const upsertPerfil = jest.fn(async () => ({ error: null }));
jest.mock('@/lib/supabase/admin', () => ({
  getSupabaseAdmin: () => ({
    rpc: async (fn: string) => (fn === 'check_email_exists' ? { data: correoExiste, error: null } : { data: null, error: null }),
    auth: { admin: { createUser } },
    from: () => ({ upsert: upsertPerfil }),
  }),
}));
const resend = jest.fn(async () => ({ error: null }));
jest.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth: { resend } }) }));
const avisoExistente = jest.fn(async () => true);
// `after()` solo corre dentro de una petición real; aquí se ejecuta en el acto para poder
// comprobar que el correo sale (la ruta ya no lo espera antes de responder).
jest.mock('next/server', () => {
  const real = jest.requireActual('next/server');
  return { ...real, after: (tarea: () => unknown) => { void tarea(); } };
});
jest.mock('@/lib/auth/avisoCuentaExistente', () => ({ enviarAvisoCuentaExistente: (...a: unknown[]) => avisoExistente(...(a as [])) }));

import { paisDesdeNavegador, alfa2DeAlfa3 } from '@/lib/utils/paisNavegador';
import { calcularDV, sugerirSubdominio, sucursalEfectiva, datosParaAlta, ORGANIZACION_INICIAL, SUCURSAL_INICIAL, PLAN_INICIAL } from '@/components/auth/alta/tipos';
import { cuerpoRpcAlta, codigoPlan } from '@/lib/services/altaOrganizacionService';
import { guardarReferido, leerReferido } from '@/lib/auth/referido';
import { destinoTrasLogin } from '@/lib/auth/recuperacionSesion';
import { _resetRateLimits } from '@/lib/security/rateLimit';

const PAISES = ['AUS', 'BRA', 'CAN', 'CHL', 'COL', 'ESP', 'GBR', 'JPN', 'MEX', 'USA'];

beforeEach(() => {
  _resetRateLimits();
  correoExiste = false;
  createUser.mockClear();
  upsertPerfil.mockClear();
  resend.mockClear();
  avisoExistente.mockClear();
  // Have I Been Pwned: sin coincidencias.
  global.fetch = jest.fn(async () => new Response('ABCDEF:1\n')) as unknown as typeof fetch;
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('país según el navegador (antes «Colombia» fijo)', () => {
  test('la zona horaria manda; luego la región del idioma', () => {
    expect(paisDesdeNavegador(PAISES, { zonaHoraria: 'America/Bogota', idiomas: ['en-US'] })).toBe('COL');
    expect(paisDesdeNavegador(PAISES, { zonaHoraria: 'America/Mexico_City' })).toBe('MEX');
    expect(paisDesdeNavegador(PAISES, { zonaHoraria: 'Etc/UTC', idiomas: ['pt-BR', 'en'] })).toBe('BRA');
  });
  test('solo países del catálogo; si no se sabe, vacío (y el campo es obligatorio)', () => {
    expect(paisDesdeNavegador(PAISES, { zonaHoraria: 'America/Lima', idiomas: ['es-PE'] })).toBeNull();
    expect(paisDesdeNavegador(PAISES, {})).toBeNull();
  });
  test('alfa-3 → alfa-2 para el prefijo del teléfono', () => {
    expect(alfa2DeAlfa3('COL')).toBe('CO');
    expect(alfa2DeAlfa3('XXX')).toBeNull();
  });
});

describe('alta de organización: datos', () => {
  test('dígito de verificación del NIT (ejemplo público de la DIAN) y subdominio sugerido', () => {
    expect(calcularDV('800197268')).toBe('4');
    expect(sugerirSubdominio('Café de la Esquina S.A.S.')).toBe('cafedelaesquinasas');
    expect(sugerirSubdominio('Yo')).toBe('yoorg');
  });

  const org = {
    ...ORGANIZACION_INICIAL('hola@miempresa.com'),
    nombre: 'Mi empresa S.A.S.',
    tipoId: '2',
    telefono: '+57 3001234567',
    direccion: 'Calle 10 # 5-20',
    ubicacion: { paisCodigo: 'COL', paisNombre: 'Colombia', ciudad: 'Medellín', departamento: 'Antioquia', departamentoCodigo: '05', municipioId: 'muni-1' },
  };

  test('«misma ubicación» (marcada por defecto) copia país, ciudad, dirección y teléfono de la organización', () => {
    expect(SUCURSAL_INICIAL.mismaUbicacion).toBe(true);
    const s = sucursalEfectiva(org, { ...SUCURSAL_INICIAL, nombre: 'Principal' });
    expect(s).toMatchObject({ paisCodigo: 'COL', ciudad: 'Medellín', departamento: 'Antioquia', municipioId: 'muni-1', direccion: 'Calle 10 # 5-20', telefono: '+57 3001234567' });
  });

  test('sin «misma ubicación», la sucursal lleva la suya', () => {
    const s = sucursalEfectiva(org, {
      ...SUCURSAL_INICIAL,
      mismaUbicacion: false,
      direccion: 'Av. 1',
      ubicacion: { paisCodigo: 'MEX', paisNombre: 'México', ciudad: 'Guadalajara', departamento: 'Jalisco', departamentoCodigo: '', municipioId: '' },
    });
    expect(s).toMatchObject({ paisCodigo: 'MEX', ciudad: 'Guadalajara', direccion: 'Av. 1' });
  });

  test('un solo cuerpo para la RPC: plan por código del catálogo, no por id fijo', () => {
    expect(codigoPlan('business-yearly')).toBe('business');
    expect(codigoPlan('ultimate')).toBe('ultimate');
    expect(codigoPlan('lo-que-sea')).toBe('pro');
    const d = datosParaAlta(org, SUCURSAL_INICIAL, { ...PLAN_INICIAL, subscriptionPlan: 'business', billingPeriod: 'yearly' }, { zonaHoraria: 'America/Bogota', referido: 'VEND-001' });
    const cuerpo = cuerpoRpcAlta(d) as { plan_codigo: string; periodo: string; organizacion: Record<string, unknown>; sucursal: Record<string, unknown> };
    expect(cuerpo.plan_codigo).toBe('business');
    expect(cuerpo.periodo).toBe('yearly');
    expect(d.sinPrueba).toBe(true);
    expect(cuerpo).toMatchObject({ sin_prueba: true });
    expect(cuerpo.organizacion).toMatchObject({ nombre: 'Mi empresa S.A.S.', razon_social: 'Mi empresa S.A.S.', pais_codigo: 'COL', ciudad: 'Medellín' });
    expect(cuerpo.sucursal).toMatchObject({ pais_codigo: 'COL', ciudad: 'Medellín' });
    expect(d.referido).toBe('VEND-001');
  });
});

describe('referido del vendedor: sobrevive a la confirmación del correo', () => {
  test('se guarda 30 días y valida el formato', () => {
    const m = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) },
    });
    const ahora = 1_000_000;
    guardarReferido('VEND-001', ahora);
    expect(leerReferido(ahora + 1000)).toBe('VEND-001');
    expect(leerReferido(ahora + 31 * 24 * 3600 * 1000)).toBeNull();
    guardarReferido('<script>', ahora);
    expect(leerReferido(ahora)).toBe('VEND-001');
  });
});

describe('vuelta al alta tras el login', () => {
  test('/auth/signup/organizacion se admite como regreso; lo demás de /auth no', () => {
    expect(destinoTrasLogin('/auth/signup/organizacion')).toBe('/auth/signup/organizacion');
    expect(destinoTrasLogin('/auth/signup')).toBe('/app/inicio');
  });
});

describe('POST /api/auth/registro', () => {
  async function registrar(cuerpo: Record<string, unknown>, ip = '198.51.100.40') {
    const { POST } = await import('@/app/api/auth/registro/route');
    return POST(new Request('https://app.goadmin.io/api/auth/registro', {
      method: 'POST',
      headers: { 'x-forwarded-for': ip, origin: 'https://app.goadmin.io' },
      body: JSON.stringify(cuerpo),
    }));
  }
  const base = { nombre: 'Ana', apellido: 'Gómez', correo: 'ana@ejemplo.com', password: 'una frase bastante larga', idioma: 'es', terminos: true };

  test('cuenta nueva: SIN confirmar, con términos aceptados, y correo de confirmación al asistente', async () => {
    const res = await registrar(base);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const args = (createUser.mock.calls[0] as unknown[])[0] as { email_confirm: boolean; user_metadata: Record<string, unknown> };
    expect(args.email_confirm).toBe(false);
    expect(args.user_metadata.terms_accepted_at).toBeTruthy();
    expect(args.user_metadata).not.toHaveProperty('signup_data');
    const envio = (resend.mock.calls[0] as unknown[])[0] as { type: string; options: { emailRedirectTo: string } };
    expect(envio.type).toBe('signup');
    expect(envio.options.emailRedirectTo).toBe('https://app.goadmin.io/auth/signup/organizacion');
  });

  test('correo ya registrado: la MISMA respuesta, no se crea nada y le llega el aviso al dueño', async () => {
    correoExiste = true;
    const res = await registrar(base);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(createUser).not.toHaveBeenCalled();
    expect(avisoExistente).toHaveBeenCalledTimes(1);
  });

  test('sin aceptar Términos y Privacidad → 400', async () => {
    const res = await registrar({ ...base, terminos: false });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ codigo: 'terminos' });
  });

  test('política única en el servidor', async () => {
    expect(await (await registrar({ ...base, password: 'corta' })).json()).toMatchObject({ codigo: 'longitud' });
    expect(await (await registrar({ ...base, password: 'ana@ejemplo.com' })).json()).toMatchObject({ codigo: 'igual_al_correo' });
    expect(createUser).not.toHaveBeenCalled();
  });

  test('límite por correo destino', async () => {
    for (let i = 0; i < 3; i++) expect((await registrar(base, `203.0.113.${i + 10}`)).status).toBe(200);
    expect((await registrar(base, '203.0.113.99')).status).toBe(429);
  });
});
