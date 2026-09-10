/// <reference types="jest" />
/**
 * Regresión: el reenvío del magic link pedía `invitations.organization_name`,
 * columna que NO existe en esa tabla. PostgREST respondía 42703 y la ruta
 * devolvía 500, así que el usuario nunca recibía el enlace.
 *
 * El doble de Supabase de aquí valida el `select()` contra el esquema real de
 * `invitations` (verificado en information_schema), de modo que si alguien
 * vuelve a pedir una columna inexistente el test falla igual que producción,
 * en vez de pasar por un mock complaciente.
 */

// Columnas reales de public.invitations.
const INVITATIONS_COLUMNS = [
  'id', 'organization_id', 'email', 'code', 'role_id', 'created_by',
  'created_at', 'expires_at', 'used_at', 'status', 'branch_id', 'job_position_id',
];

/** Separa un select de PostgREST por comas de primer nivel (respeta paréntesis). */
function splitTopLevel(select: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of select) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { parts.push(current); current = ''; continue; }
    current += ch;
  }
  if (current.trim()) parts.push(current);
  return parts.map((p) => p.trim()).filter(Boolean);
}

type PostgrestError = { code: string; message: string };

let inviteRow: Record<string, unknown> | null;
let selectSpy: jest.Mock;

/** Doble mínimo de PostgREST que falla con 42703 ante columnas inexistentes. */
function makeAdmin() {
  return {
    from(table: string) {
      let error: PostgrestError | null = null;
      const builder: any = {
        select(select: string) {
          selectSpy(select);
          for (const field of splitTopLevel(select)) {
            if (field.includes('(')) continue; // embed (relación), no columna
            if (table === 'invitations' && !INVITATIONS_COLUMNS.includes(field)) {
              error = {
                code: '42703',
                message: `column ${table}.${field} does not exist`,
              };
            }
          }
          return builder;
        },
        eq: () => builder,
        order: () => builder,
        limit: () => builder,
        maybeSingle: async () =>
          error ? { data: null, error } : { data: inviteRow, error: null },
      };
      return builder;
    },
  };
}

const signInWithOtp = jest.fn(async () => ({ error: null }));

jest.mock('@/lib/supabase/admin', () => ({
  getSupabaseAdmin: () => makeAdmin(),
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { signInWithOtp } }),
}));

import { POST } from '../route';

/** La ruta solo usa request.json(). */
function req(body: unknown) {
  return { json: async () => body } as unknown as Request;
}

const BODY = { email: 'Persona@Ejemplo.COM', origin: 'https://app.goadmin.io' };

beforeEach(() => {
  signInWithOtp.mockClear();
  selectSpy = jest.fn();
  inviteRow = {
    code: 'abc123',
    organization_id: 142,
    role_id: 4,
    organizations: { name: 'Space Cocktails' },
  };
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://ejemplo.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-de-prueba';
});

describe('POST /api/auth/invite/resend', () => {
  it('no pide columnas que no existen en invitations (regresión 42703)', async () => {
    const res = await POST(req(BODY));

    // El fallo original: 500 porque el select pedía organization_name.
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ success: true });

    const select = selectSpy.mock.calls[0][0] as string;
    const columnas = splitTopLevel(select).filter((f) => !f.includes('('));
    expect(columnas.every((c) => INVITATIONS_COLUMNS.includes(c))).toBe(true);
    expect(columnas).not.toContain('organization_name');
  });

  it('toma el nombre de la organización del join y reenvía el magic link', async () => {
    await POST(req(BODY));

    expect(signInWithOtp).toHaveBeenCalledTimes(1);
    expect(signInWithOtp.mock.calls[0][0]).toMatchObject({
      email: 'persona@ejemplo.com', // normalizado
      options: {
        emailRedirectTo: 'https://app.goadmin.io/auth/invite?invite_code=abc123',
        data: {
          invitation_code: 'abc123',
          organization_id: 142,
          organization_name: 'Space Cocktails',
        },
      },
    });
  });

  it('acepta el embed como array (to-many) sin perder el nombre', async () => {
    inviteRow!.organizations = [{ name: 'Vivor Eats' }];

    await POST(req(BODY));

    expect(signInWithOtp.mock.calls[0][0].options.data.organization_name).toBe('Vivor Eats');
  });

  it('cae al texto por defecto si el join no trae nombre, en ambas formas', async () => {
    inviteRow!.organizations = [{}];
    await POST(req(BODY));
    expect(signInWithOtp.mock.calls[0][0].options.data.organization_name).toBe('la organización');

    signInWithOtp.mockClear();
    inviteRow!.organizations = null;
    await POST(req(BODY));
    expect(signInWithOtp.mock.calls[0][0].options.data.organization_name).toBe('la organización');
  });

  it('responde 404 si no hay invitación pendiente', async () => {
    inviteRow = null;

    const res = await POST(req(BODY));

    expect(res.status).toBe(404);
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it('responde 400 si faltan email u origin', async () => {
    const res = await POST(req({ email: '', origin: '' }));

    expect(res.status).toBe(400);
    expect(signInWithOtp).not.toHaveBeenCalled();
  });
});
