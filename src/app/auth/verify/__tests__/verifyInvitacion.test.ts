/// <reference types="jest" />
/**
 * GO-sec (auditoría de acceso 2026-09-28, docs/design/AUTH-ACCESO-V2.md §4.1):
 * `/auth/verify` es pública. Con `type=invite`, un token cualquiera y el
 * correo de alguien con invitación pendiente, `verifyOtp` fallaba y la ruta
 * buscaba con la service role la invitación de ESE correo y redirigía a
 * `/auth/invite?invite_code=<código real>`. Con ese código se creaba la cuenta
 * con contraseña propia y se entraba a la organización: bastaba el correo.
 *
 * Además, con `type=magiclink` la respuesta distinguía «hay invitación»
 * (→ resent) de «no la hay» (→ failed): un oráculo de enumeración.
 *
 * Reglas que fija este archivo:
 *  - el código de invitación solo sale hacia el navegador cuando `verifyOtp`
 *    TUVO ÉXITO (el token del correo prueba que se controla el buzón);
 *  - con token fallido la respuesta es la misma exista o no la invitación;
 *  - el reenvío automático sigue limitado por IP y por correo.
 */

type Row = Record<string, unknown>;

const CODIGO_SECRETO = 'codigo-secreto-de-la-invitacion-0123456789abcdef';
const CORREO_VICTIMA = 'victima@ejemplo.com';

// --- Estado que cada test ajusta -------------------------------------------
let invitacionPendiente: Row | null;
let verifyOtpResultado: { data: { user: Row | null; session: Row | null }; error: { message: string } | null };
const signInWithOtp = jest.fn(async () => ({ error: null }));
const verifyOtp = jest.fn(async () => verifyOtpResultado);

/** Doble de PostgREST: toda consulta a `invitations` devuelve la pendiente. */
function builder(tabla: string) {
  const b: Record<string, unknown> = {};
  const self = () => b;
  for (const m of ['select', 'eq', 'or', 'gt', 'is', 'order', 'limit', 'update', 'in']) b[m] = jest.fn(self);
  b.maybeSingle = async () => ({
    data: tabla === 'invitations' ? invitacionPendiente : null,
    error: null,
  });
  b.then = (resolve: (v: unknown) => unknown) => resolve({ data: null, error: null });
  return b;
}

jest.mock('@/lib/supabase/admin', () => ({
  getSupabaseAdmin: () => ({ from: (t: string) => builder(t) }),
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { verifyOtp, signInWithOtp, signOut: async () => ({ error: null }) },
    from: (t: string) => builder(t),
  }),
}));

jest.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined, set: () => undefined }),
}));

jest.mock('@/app/auth/callback/route', () => ({
  completeSignupAfterEmailConfirmation: async () => ({ alreadyExisted: true }),
}));

import { NextRequest } from 'next/server';
import { GET } from '../route';
import { _resetRateLimits } from '@/lib/security/rateLimit';

let ipSeq = 0;
function peticion(query: string, ip?: string) {
  ipSeq += 1;
  return new NextRequest(`https://app.goadmin.io/auth/verify?${query}`, {
    headers: { 'x-forwarded-for': ip ?? `203.0.113.${ipSeq}` },
  });
}

function destino(res: Response): string {
  return res.headers.get('location') ?? '';
}

beforeEach(() => {
  _resetRateLimits();
  signInWithOtp.mockClear();
  verifyOtp.mockClear();
  invitacionPendiente = {
    id: 104,
    code: CODIGO_SECRETO,
    email: CORREO_VICTIMA,
    organization_id: 140,
    role_id: 4,
    status: 'pending',
    expires_at: new Date(Date.now() + 7 * 86400_000).toISOString(),
    organizations: { name: 'Organización Demo' },
  };
  verifyOtpResultado = { data: { user: null, session: null }, error: { message: 'Token has expired or is invalid' } };
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://ejemplo.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-de-prueba';
});

describe('/auth/verify · invitación con token inválido (§4.1)', () => {
  it('con solo el correo NO entrega el código de la invitación', async () => {
    const res = await GET(peticion(`type=invite&token=cualquiera&email=${encodeURIComponent(CORREO_VICTIMA)}`));

    expect(destino(res)).not.toContain(CODIGO_SECRETO);
    expect(destino(res)).not.toContain('invite_code');
    expect(destino(res)).not.toMatch(/\/auth\/invite\b/);
  });

  it('sin token no hay código ni invitación', async () => {
    const res = await GET(peticion(`type=invite&email=${encodeURIComponent(CORREO_VICTIMA)}`));

    expect(destino(res)).not.toContain(CODIGO_SECRETO);
    expect(destino(res)).toContain('/auth/login');
  });

  it('la respuesta es la misma exista o no la invitación (invite)', async () => {
    const q = `type=invite&token=cualquiera&email=${encodeURIComponent(CORREO_VICTIMA)}`;
    const conInvitacion = destino(await GET(peticion(q)));
    _resetRateLimits();
    invitacionPendiente = null;
    const sinInvitacion = destino(await GET(peticion(q)));

    expect(conInvitacion).toBe(sinInvitacion);
  });

  it('la respuesta es la misma exista o no la invitación (magiclink)', async () => {
    const q = `type=magiclink&token=cualquiera&email=${encodeURIComponent(CORREO_VICTIMA)}`;
    const conInvitacion = destino(await GET(peticion(q)));
    _resetRateLimits();
    invitacionPendiente = null;
    const sinInvitacion = destino(await GET(peticion(q)));

    expect(conInvitacion).toBe(sinInvitacion);
    expect(conInvitacion).not.toContain(CODIGO_SECRETO);
  });

  it('el reenvío automático manda el enlace AL CORREO invitado y no al navegador', async () => {
    const res = await GET(peticion(`type=invite&token=cualquiera&email=${encodeURIComponent(CORREO_VICTIMA)}`));

    expect(destino(res)).not.toContain(CODIGO_SECRETO);
    expect(signInWithOtp).toHaveBeenCalledTimes(1);
    const [arg] = signInWithOtp.mock.calls[0] as unknown as [{ email: string }];
    expect(arg.email).toBe(CORREO_VICTIMA);
  });

  it('el reenvío automático está limitado por correo aunque se rote de IP', async () => {
    const q = `type=invite&token=cualquiera&email=${encodeURIComponent(CORREO_VICTIMA)}`;
    for (let i = 0; i < 6; i++) await GET(peticion(q));

    expect(signInWithOtp.mock.calls.length).toBeLessThanOrEqual(3);
  });
});

describe('/auth/verify · flujo legítimo (token del correo válido)', () => {
  it('invite con token válido lleva al asistente con el código de la invitación vigente', async () => {
    verifyOtpResultado = {
      data: {
        user: { id: 'u-1', email: CORREO_VICTIMA, user_metadata: { invitation_code: 'codigo-viejo-rotado' } },
        session: { access_token: 'x' },
      },
      error: null,
    };

    const res = await GET(peticion('type=invite&token=token-bueno'));

    expect(destino(res)).toContain(`/auth/invite?invite_code=${CODIGO_SECRETO}`);
  });

  it('magiclink con token válido y sin invitación va a la app', async () => {
    invitacionPendiente = null;
    verifyOtpResultado = {
      data: { user: { id: 'u-1', email: CORREO_VICTIMA, user_metadata: {} }, session: { access_token: 'x' } },
      error: null,
    };

    const res = await GET(peticion('type=magiclink&token=token-bueno'));

    expect(destino(res)).toContain('/app/inicio');
  });
});
