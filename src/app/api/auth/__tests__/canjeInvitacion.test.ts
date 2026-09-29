/// <reference types="jest" />
/**
 * GO-sec (auditoría de acceso 2026-09-28, docs/design/AUTH-ACCESO-V2.md §4.1):
 * el código de una invitación es la credencial que convierte a quien lo tiene
 * en miembro de la organización. Este archivo fija el canje:
 *
 *  - `/api/auth/invite/context` y `/api/auth/accept-invitation` responden lo
 *    MISMO (404) sin código, con uno mal formado, inexistente, usado,
 *    revocado o vencido: no son un oráculo de códigos;
 *  - la cuenta se crea SIEMPRE con el correo de la invitación del código; un
 *    correo distinto en el body se rechaza igual que un código inválido;
 *  - el contexto no devuelve el código;
 *  - `/api/auth/invite/pendiente` (con sesión) manda el enlace al buzón y no
 *    devuelve el código;
 *  - el flujo legítimo (enlace del correo) sigue creando la cuenta y canjeando.
 */

type Invitacion = {
  id: number;
  email: string;
  code: string;
  status: string;
  role_id: number;
  organization_id: number;
  expires_at: string | null;
  organization_name: string;
  role_name: string;
};

const EN_UNA_SEMANA = new Date(Date.now() + 7 * 86400_000).toISOString();
const AYER = new Date(Date.now() - 86400_000).toISOString();

const COD_A = 'a'.repeat(64);
const COD_B = 'b'.repeat(64);

let invitaciones: Invitacion[];
let estadoCuenta: 'nueva' | 'huerfana' | 'existente';
const createUser = jest.fn(async (args: { email: string }) => ({ data: { user: { id: `u-${args.email}` } }, error: null }));
const updateUserById = jest.fn(async () => ({ error: null }));
const acceptAtomic = jest.fn();
const signInWithOtp = jest.fn(async () => ({ error: null }));
let usuarioSesion: { id: string; email: string } | null;

/** Emula `validate_invitation_by_code`: igualdad exacta, pending y sin vencer. */
function validar(codigo: string): Invitacion[] {
  return invitaciones.filter(
    (i) => i.code === codigo && i.status === 'pending' && (!i.expires_at || new Date(i.expires_at) > new Date())
  );
}

function builderInvitaciones() {
  const filtros: Record<string, unknown> = {};
  const b = {
    select: () => b,
    eq: (c: string, v: unknown) => { filtros[c] = v; return b; },
    or: () => b,
    order: () => b,
    limit: () => b,
    maybeSingle: async () => {
      const fila = invitaciones.find(
        (i) => i.email === filtros.email && i.status === 'pending' && (!i.expires_at || new Date(i.expires_at) > new Date())
      );
      return { data: fila ? { ...fila, organizations: { name: fila.organization_name } } : null, error: null };
    },
  };
  return b;
}

jest.mock('@/lib/supabase/admin', () => ({
  getSupabaseAdmin: () => ({
    rpc: async (fn: string, args: Record<string, unknown>) => {
      if (fn === 'validate_invitation_by_code') return { data: validar(String(args.invitation_code)), error: null };
      if (fn === 'accept_invitation_atomic') {
        acceptAtomic(args);
        const inv = validar(String(args.p_invite_code))[0];
        if (!inv) return { data: null, error: { message: 'La invitacion no existe, ya fue utilizada o expiro.' } };
        inv.status = 'used';
        return { data: { ok: true }, error: null };
      }
      return { data: null, error: null };
    },
    from: () => builderInvitaciones(),
    auth: { admin: { createUser, updateUserById } },
  }),
}));

jest.mock('@/lib/auth/cuentaInvitacion', () => ({
  estadoCuentaInvitacion: async () => ({ estado: estadoCuenta, usuario: estadoCuenta === 'huerfana' ? { id: 'u-huerfano', user_metadata: { invitation_code: 'x' } } : null }),
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { signInWithOtp } }),
}));

jest.mock('@/lib/supabase/server-user', () => ({
  getServerUserClient: async () => ({
    auth: { getUser: async () => ({ data: { user: usuarioSesion }, error: usuarioSesion ? null : { message: 'sin sesión' } }) },
  }),
}));

import { NextRequest } from 'next/server';
import { GET as contexto } from '../invite/context/route';
import { POST as aceptar } from '../accept-invitation/route';
import { POST as pendiente } from '../invite/pendiente/route';
import { _resetRateLimits } from '@/lib/security/rateLimit';
import { codigosIguales, enmascararCorreo, generarCodigoInvitacion } from '@/lib/auth/invitaciones';

let ipSeq = 0;
function ip() {
  ipSeq += 1;
  return `192.0.2.${ipSeq % 250}`;
}

function getContexto(code?: string) {
  const q = code === undefined ? '' : `?code=${encodeURIComponent(code)}`;
  return contexto(new NextRequest(`https://app.goadmin.io/api/auth/invite/context${q}`, { headers: { 'x-forwarded-for': ip() } }));
}

function postAceptar(body: Record<string, unknown>) {
  return aceptar(new Request('https://app.goadmin.io/api/auth/accept-invitation', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip() },
    body: JSON.stringify(body),
  }));
}

const DATOS = { password: 'Clave-segura-123', firstName: 'Ana', lastName: 'Ruiz', phone: '3000000000' };

beforeEach(() => {
  _resetRateLimits();
  createUser.mockClear();
  updateUserById.mockClear();
  acceptAtomic.mockClear();
  signInWithOtp.mockClear();
  estadoCuenta = 'nueva';
  usuarioSesion = null;
  invitaciones = [
    { id: 1, email: 'ana@ejemplo.com', code: COD_A, status: 'pending', role_id: 4, organization_id: 140, expires_at: EN_UNA_SEMANA, organization_name: 'Org Demo', role_name: 'Empleado' },
    { id: 2, email: 'beto@ejemplo.com', code: COD_B, status: 'pending', role_id: 2, organization_id: 142, expires_at: EN_UNA_SEMANA, organization_name: 'Otra Org', role_name: 'Admin' },
  ];
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://ejemplo.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-de-prueba';
});

describe('utilidades del código', () => {
  it('genera 256 bits en hexadecimal, distintos cada vez', () => {
    const a = generarCodigoInvitacion();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(generarCodigoInvitacion()).not.toBe(a);
  });

  it('compara en tiempo constante y distingue longitudes', () => {
    expect(codigosIguales(COD_A, COD_A)).toBe(true);
    expect(codigosIguales(COD_A, COD_B)).toBe(false);
    expect(codigosIguales(COD_A, COD_A.slice(0, 10))).toBe(false);
  });

  it('enmascara el correo', () => {
    expect(enmascararCorreo('ana@ejemplo.com')).toBe('an•••@ejemplo.com');
  });
});

describe('/api/auth/invite/context', () => {
  it('con el código del correo devuelve organización, rol y estado, SIN el código', async () => {
    const res = await getContexto(COD_A);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.invitation).toMatchObject({ email: 'ana@ejemplo.com', organization_id: 140, role_name: 'Empleado' });
    expect(JSON.stringify(json)).not.toContain(COD_A);
    expect(json.account_state).toBe('nueva');
  });

  it('sin código, mal formado, inexistente, usado, revocado o vencido: el mismo 404', async () => {
    invitaciones[1].status = 'used';
    invitaciones.push({ ...invitaciones[0], id: 3, code: 'c'.repeat(64), status: 'revoked' });
    invitaciones.push({ ...invitaciones[0], id: 4, code: 'd'.repeat(64), expires_at: AYER });

    const casos = [undefined, '', 'x', "' or 1=1 --", 'e'.repeat(64), COD_B, 'c'.repeat(64), 'd'.repeat(64)];
    const cuerpos = new Set<string>();
    for (const c of casos) {
      const res = await getContexto(c);
      expect(res.status).toBe(404);
      cuerpos.add(JSON.stringify(await res.json()));
    }
    expect(cuerpos.size).toBe(1);
  });
});

describe('/api/auth/accept-invitation', () => {
  it('flujo legítimo: crea la cuenta con el correo de la invitación y la canjea', async () => {
    const res = await postAceptar({ inviteCode: COD_A, email: 'ANA@ejemplo.com ', ...DATOS });

    expect(res.status).toBe(200);
    expect(createUser).toHaveBeenCalledTimes(1);
    expect(createUser.mock.calls[0][0]).toMatchObject({ email: 'ana@ejemplo.com', email_confirm: true });
    expect(JSON.stringify(createUser.mock.calls[0][0])).not.toContain(COD_A);
    expect(acceptAtomic).toHaveBeenCalledWith(expect.objectContaining({ p_invite_code: COD_A, p_user_id: 'u-ana@ejemplo.com' }));
    expect(invitaciones[0].status).toBe('used');
  });

  it('sin token: 404 y no se crea nada', async () => {
    const res = await postAceptar({ email: 'ana@ejemplo.com', ...DATOS });
    expect(res.status).toBe(404);
    expect(createUser).not.toHaveBeenCalled();
  });

  it('token de OTRA invitación con el correo de esta: 404 y no se crea nada', async () => {
    const res = await postAceptar({ inviteCode: COD_B, email: 'ana@ejemplo.com', ...DATOS });
    expect(res.status).toBe(404);
    expect(createUser).not.toHaveBeenCalled();
    expect(acceptAtomic).not.toHaveBeenCalled();
  });

  it('correo distinto al invitado: el mismo 404 que un código inválido', async () => {
    const malCorreo = await postAceptar({ inviteCode: COD_A, email: 'intruso@ejemplo.com', ...DATOS });
    const malCodigo = await postAceptar({ inviteCode: 'f'.repeat(64), email: 'ana@ejemplo.com', ...DATOS });

    expect(malCorreo.status).toBe(404);
    expect(await malCorreo.json()).toEqual(await malCodigo.json());
    expect(createUser).not.toHaveBeenCalled();
  });

  it('token vencido o ya usado: 404', async () => {
    invitaciones[0].expires_at = AYER;
    expect((await postAceptar({ inviteCode: COD_A, ...DATOS })).status).toBe(404);

    invitaciones[0].expires_at = EN_UNA_SEMANA;
    invitaciones[0].status = 'used';
    expect((await postAceptar({ inviteCode: COD_A, ...DATOS })).status).toBe(404);
    expect(createUser).not.toHaveBeenCalled();
  });

  it('un solo uso: el segundo canje del mismo código es 404', async () => {
    expect((await postAceptar({ inviteCode: COD_A, ...DATOS })).status).toBe(200);
    expect((await postAceptar({ inviteCode: COD_A, ...DATOS })).status).toBe(404);
    expect(createUser).toHaveBeenCalledTimes(1);
  });

  it('cuenta existente: 409 y nunca se toca su contraseña', async () => {
    estadoCuenta = 'existente';
    const res = await postAceptar({ inviteCode: COD_A, ...DATOS });
    expect(res.status).toBe(409);
    expect(updateUserById).not.toHaveBeenCalled();
    expect(createUser).not.toHaveBeenCalled();
  });

  it('límite de intentos por IP', async () => {
    const mismaIp = '198.18.0.1';
    const intento = () => aceptar(new Request('https://app.goadmin.io/api/auth/accept-invitation', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': mismaIp },
      body: JSON.stringify({ inviteCode: 'f'.repeat(64), ...DATOS }),
    }));
    for (let i = 0; i < 10; i++) expect((await intento()).status).toBe(404);
    expect((await intento()).status).toBe(429);
  });
});

describe('/api/auth/invite/pendiente', () => {
  function postPendiente() {
    return pendiente(new Request('https://app.goadmin.io/api/auth/invite/pendiente', {
      method: 'POST',
      headers: { origin: 'https://app.goadmin.io', 'x-forwarded-for': ip() },
    }));
  }

  it('sin sesión: 401', async () => {
    expect((await postPendiente()).status).toBe(401);
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it('con invitación: manda el enlace AL CORREO de la sesión y no devuelve el código', async () => {
    usuarioSesion = { id: 'u-1', email: 'ana@ejemplo.com' };
    const res = await postPendiente();
    const texto = await res.text();

    expect(res.status).toBe(200);
    expect(JSON.parse(texto)).toEqual({ enlaceEnviado: true });
    expect(texto).not.toContain(COD_A);
    const [arg] = signInWithOtp.mock.calls[0] as unknown as [{ email: string }];
    expect(arg.email).toBe('ana@ejemplo.com');
  });

  it('sin invitación: no manda nada', async () => {
    usuarioSesion = { id: 'u-2', email: 'nadie@ejemplo.com' };
    await expect((await postPendiente()).json()).resolves.toEqual({ enlaceEnviado: false });
    expect(signInWithOtp).not.toHaveBeenCalled();
  });
});
