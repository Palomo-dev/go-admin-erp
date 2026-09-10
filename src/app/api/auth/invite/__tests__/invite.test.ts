/// <reference types="jest" />
/**
 * /api/auth/invite manda correo con la service role. Lo único que la protegía
 * era el middleware, que solo exige que haya cookie de sesión, así que:
 *
 * 1. `organizationId`, `roleId` e `invitedBy` venían del body y se creían tal
 *    cual: cualquier usuario logueado de cualquier organización podía invitar
 *    a cualquier correo a cualquier organización, con el rol que quisiera.
 * 2. `invitationCode` tampoco se contrastaba contra `invitations`, así que el
 *    correo destino lo elegía el atacante.
 * 3. La rama de "usuario huérfano" llamaba a `auth.admin.deleteUser()` sobre
 *    un usuario de auth.users cuyo único filtro era `is_invitation` en la
 *    metadata: un borrado de usuarios al alcance de cualquier sesión, y que
 *    además cruzaba tenants.
 *
 * Ahora la organización, el destinatario y el rol salen de la fila de
 * `invitations`, y quien llama tiene que ser admin activo de ESA organización.
 *
 * El doble de Supabase valida el `select()` contra el esquema real de
 * `invitations` (12 columnas, verificadas en information_schema) para que el
 * test falle igual que producción si se pide una columna que no existe.
 */

// Columnas reales de public.invitations.
const INVITATIONS_COLUMNS = [
  'id', 'organization_id', 'email', 'code', 'role_id', 'created_by',
  'created_at', 'expires_at', 'used_at', 'status', 'branch_id', 'job_position_id',
];

type Row = Record<string, unknown>;
type PostgrestError = { code: string; message: string };

/** Argumentos de una llamada al doble, con el tipo que declara la ruta. */
function llamada<T extends unknown[]>(mock: jest.Mock, n = 0): T {
  return mock.mock.calls[n] as unknown as T;
}

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

// --- Estado que cada test ajusta -------------------------------------------
let inviteRow: Row | null;
let profileRow: Row | null;
let membershipRow: Row | null;
let existsInAuth: boolean;
let authUsers: Array<{ id: string; email: string; user_metadata: Row }>;
let selectSpy: jest.Mock;

const deleteUser = jest.fn(async () => ({ error: null }));

type InviteArgs = { redirectTo: string; data: Record<string, unknown> };
const inviteUserByEmail = jest.fn(async () => ({ data: {}, error: null }));
const signInWithOtp = jest.fn(async () => ({ error: null }));

/** Encadenamiento mínimo de PostgREST. */
interface Builder {
  // Métodos (no propiedades) para que el doble pueda declarar firmas más
  // estrechas que `unknown[]` sin pelearse con strictFunctionTypes.
  select(...args: unknown[]): Builder;
  eq(...args: unknown[]): Builder;
  order(...args: unknown[]): Builder;
  limit(...args: unknown[]): Builder;
  maybeSingle(): Promise<{ data: Row | null; error: PostgrestError | null }>;
}

/** Doble mínimo de PostgREST: valida columnas de `invitations` y aplica los `.eq()`. */
function makeAdmin() {
  return {
    rpc: async () => ({ data: existsInAuth, error: null }),
    auth: {
      admin: {
        listUsers: async () => ({ data: { users: authUsers }, error: null }),
        deleteUser,
        inviteUserByEmail,
      },
    },
    from(table: string) {
      let error: PostgrestError | null = null;
      const predicates: Array<(row: Row) => boolean> = [];
      const rowOf = (): Row | null =>
        table === 'invitations' ? inviteRow
          : table === 'profiles' ? profileRow
            : table === 'organization_members' ? membershipRow
              : null;

      const builder: Builder = {
        select(select: string) {
          if (table === 'invitations') {
            selectSpy(select);
            for (const field of splitTopLevel(select)) {
              if (field.includes('(')) continue; // embed (relación), no columna
              if (!INVITATIONS_COLUMNS.includes(field)) {
                error = { code: '42703', message: `column ${table}.${field} does not exist` };
              }
            }
          }
          return builder;
        },
        eq(col: string, val: unknown) {
          predicates.push((row) => String(row[col]) === String(val));
          return builder;
        },
        order: () => builder,
        limit: () => builder,
        maybeSingle: async () => {
          if (error) return { data: null, error };
          const row = rowOf();
          const match = row && predicates.every((p) => p(row));
          return { data: match ? row : null, error: null };
        },
      };
      return builder;
    },
  };
}

jest.mock('@/lib/supabase/admin', () => ({
  getSupabaseAdmin: () => makeAdmin(),
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { signInWithOtp } }),
}));

/** Réplica de OrgContextError: la ruta la distingue con `instanceof`. */
class FakeOrgContextError extends Error {
  statusCode: number;
  code: string;
  constructor(message: string, statusCode: number, code?: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code ?? (statusCode === 401 ? 'UNAUTHENTICATED' : statusCode === 403 ? 'FORBIDDEN' : 'BAD_REQUEST');
  }
}

const ORG_ID = 142;
const ADMIN_CTX = {
  userId: 'u-admin',
  userEmail: 'admin@ejemplo.com',
  organizationId: ORG_ID,
  organizationName: 'Space Cocktails',
  roleId: 2,
  roleName: 'Admin de organización',
  isSuperAdmin: false,
  memberId: 9,
};

type Ctx = typeof ADMIN_CTX;

/** Lo que devuelve (o lanza) la resolución de sesión + membresía. */
let contextoDeSesion: () => Ctx;
const getServerOrgContextFor = jest.fn(async () => contextoDeSesion());

jest.mock('@/lib/utils/orgContext', () => {
  // La regla de admin se toma de verdad del módulo hoja, para no reimplantarla
  // en el mock y que el test siga a la implementación si cambia.
  const { isOrgAdminLike } =
    jest.requireActual<typeof import('@/lib/utils/orgAdmin')>('@/lib/utils/orgAdmin');
  return {
    OrgContextError: FakeOrgContextError,
    getServerOrgContextFor,
    requireOrgAdmin: (ctx: Ctx) => {
      if (!isOrgAdminLike(ctx)) {
        throw new FakeOrgContextError(
          'Requiere rol de administrador de la organización', 403, 'ADMIN_REQUIRED'
        );
      }
    },
  };
});

import { POST } from '../route';
import { _resetRateLimits } from '@/lib/security/rateLimit';

const ORIGIN = 'https://app.goadmin.io';
const EN_UNA_SEMANA = new Date(Date.now() + 7 * 24 * 3600_000).toISOString();
const HACE_UN_DIA = new Date(Date.now() - 24 * 3600_000).toISOString();

let ipSeq = 0;
/** IP nueva por petición para que las cubetas del rate limit no se solapen. */
function ipUnica() {
  ipSeq += 1;
  return `198.51.100.${ipSeq}`;
}

function req(body: unknown, headers: Record<string, string> = {}) {
  const all: Record<string, string> = {
    origin: ORIGIN,
    host: 'app.goadmin.io',
    'x-forwarded-for': ipUnica(),
    ...headers,
  };
  return {
    json: async () => body,
    headers: { get: (k: string) => all[k.toLowerCase()] ?? null },
  } as unknown as Request;
}

/** Body tal y como lo manda InvitationsTab. */
const BODY = {
  email: 'Persona@Ejemplo.COM',
  organizationId: ORG_ID,
  organizationName: 'Space Cocktails',
  roleId: 4,
  invitationCode: 'abc123',
  invitedBy: 'u-admin',
  origin: ORIGIN,
};

/** Ningún correo salió por ninguna de las dos vías. */
function noSeMandoNingunCorreo() {
  expect(inviteUserByEmail).not.toHaveBeenCalled();
  expect(signInWithOtp).not.toHaveBeenCalled();
}

beforeEach(() => {
  _resetRateLimits();
  deleteUser.mockClear();
  inviteUserByEmail.mockClear();
  signInWithOtp.mockClear();
  getServerOrgContextFor.mockClear();
  selectSpy = jest.fn();

  inviteRow = {
    id: 1,
    code: 'abc123',
    email: 'persona@ejemplo.com',
    organization_id: ORG_ID,
    role_id: 7,
    status: 'pending',
    expires_at: EN_UNA_SEMANA,
    created_at: new Date().toISOString(),
    organizations: { name: 'Space Cocktails' },
  };
  profileRow = null;
  membershipRow = null;
  existsInAuth = false;
  authUsers = [];
  contextoDeSesion = () => ADMIN_CTX;

  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://ejemplo.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-de-prueba';
});

// --- Autorización ----------------------------------------------------------
describe('POST /api/auth/invite · autorización', () => {
  it('sin sesión no manda invitación', async () => {
    contextoDeSesion = () => { throw new FakeOrgContextError('No hay sesión activa', 401, 'UNAUTHENTICATED'); };

    const res = await POST(req(BODY));

    expect(res.status).toBe(401);
    noSeMandoNingunCorreo();
  });

  it('un usuario de otra organización no puede invitar a esta (era el agujero)', async () => {
    contextoDeSesion = () => { throw new FakeOrgContextError('No perteneces a esa organización', 403, 'ORG_FORBIDDEN'); };

    const res = await POST(req(BODY));

    // Respuesta genérica: no se le confirma que el código de invitación existe.
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: 'Invitación no válida o vencida' });
    noSeMandoNingunCorreo();
  });

  it('un miembro sin rol de admin recibe 403 y no manda correo', async () => {
    contextoDeSesion = () => ({ ...ADMIN_CTX, roleId: 7, roleName: 'Vendedor', isSuperAdmin: false });

    const res = await POST(req(BODY));

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({ code: 'ADMIN_REQUIRED' });
    noSeMandoNingunCorreo();
  });

  it('el admin de la organización de la invitación sí invita', async () => {
    const res = await POST(req(BODY));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      success: true,
      inviteUrl: 'https://app.goadmin.io/auth/invite?invite_code=abc123',
    });
    expect(inviteUserByEmail).toHaveBeenCalledTimes(1);
  });

  it('la membresía se comprueba contra la organización de la invitación, no la del body', async () => {
    inviteRow!.organization_id = 999;

    await POST(req({ ...BODY, organizationId: 999 }));

    expect(llamada<[number]>(getServerOrgContextFor)[0]).toBe(999);
  });

  it('un organizationId del body distinto al de la invitación es 403', async () => {
    const res = await POST(req({ ...BODY, organizationId: 777 }));

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({
      error: 'La organización no coincide con la invitación',
    });
    noSeMandoNingunCorreo();
  });
});

// --- La invitación es la fuente de verdad ----------------------------------
describe('POST /api/auth/invite · la invitación manda sobre el body', () => {
  it('un código que no existe no manda correo', async () => {
    inviteRow = null;

    const res = await POST(req(BODY));

    expect(res.status).toBe(404);
    noSeMandoNingunCorreo();
    expect(getServerOrgContextFor).not.toHaveBeenCalled();
  });

  it('una invitación vencida no se revive (status pending no basta)', async () => {
    inviteRow!.expires_at = HACE_UN_DIA;

    const res = await POST(req(BODY));

    expect(res.status).toBe(404);
    noSeMandoNingunCorreo();
  });

  it('una invitación revocada no manda correo', async () => {
    inviteRow!.status = 'revoked';

    const res = await POST(req(BODY));

    expect(res.status).toBe(404);
    noSeMandoNingunCorreo();
  });

  it('no se puede invitar a un correo distinto al de la invitación', async () => {
    const res = await POST(req({ ...BODY, email: 'victima@otra-empresa.com' }));

    expect(res.status).toBe(404);
    noSeMandoNingunCorreo();
  });

  it('el rol, la organización y el invitador salen de la invitación y la sesión', async () => {
    // El body pide rol 1 (Super Admin), otro nombre de org y otro invitador.
    await POST(req({ ...BODY, roleId: 1, organizationName: 'Org Falsa', invitedBy: 'u-suplantado' }));

    expect(llamada<[string, InviteArgs]>(inviteUserByEmail)[1].data).toEqual({
      organization_id: ORG_ID,
      organization_name: 'Space Cocktails',
      role_id: 7,
      invitation_code: 'abc123',
      is_invitation: true,
      invited_by: 'u-admin',
    });
  });

  it('no pide columnas que no existen en invitations (regresión 42703)', async () => {
    await POST(req(BODY));

    const columnas = splitTopLevel(selectSpy.mock.calls[0][0] as string)
      .filter((f) => !f.includes('('));
    expect(columnas.every((c) => INVITATIONS_COLUMNS.includes(c))).toBe(true);
  });

  it('un body sin JSON válido es 400 y no consulta nada', async () => {
    const roto = {
      json: async () => { throw new SyntaxError('Unexpected token'); },
      headers: { get: () => null },
    } as unknown as Request;

    const res = await POST(roto);

    expect(res.status).toBe(400);
    noSeMandoNingunCorreo();
  });
});

// --- Borrado de usuarios huérfanos -----------------------------------------
describe('POST /api/auth/invite · borrado de usuario huérfano', () => {
  const huerfano = (orgId: number) => ({
    id: 'u-huerfano',
    email: 'persona@ejemplo.com',
    user_metadata: { is_invitation: true, organization_id: orgId },
  });

  beforeEach(() => {
    existsInAuth = true;
  });

  it('borra y re-invita al huérfano de la propia organización', async () => {
    authUsers = [huerfano(ORG_ID)];

    const res = await POST(req(BODY));

    expect(llamada<[string]>(deleteUser)[0]).toBe('u-huerfano');
    expect(inviteUserByEmail).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
  });

  it('NO borra un huérfano de otra organización: cae al magic link', async () => {
    authUsers = [huerfano(999)];

    const res = await POST(req(BODY));

    expect(deleteUser).not.toHaveBeenCalled();
    expect(signInWithOtp).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
  });

  it('NO borra a un usuario que ya tiene perfil', async () => {
    authUsers = [huerfano(ORG_ID)];
    profileRow = { id: 'u-huerfano' };

    await POST(req(BODY));

    expect(deleteUser).not.toHaveBeenCalled();
    expect(signInWithOtp).toHaveBeenCalledTimes(1);
  });

  it('NO borra a un usuario que ya tiene membresía', async () => {
    authUsers = [huerfano(ORG_ID)];
    membershipRow = { id: 5, user_id: 'u-huerfano' };

    await POST(req(BODY));

    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('sin autorización no se llega siquiera a listar usuarios de auth', async () => {
    authUsers = [huerfano(ORG_ID)];
    contextoDeSesion = () => { throw new FakeOrgContextError('No perteneces a esa organización', 403, 'ORG_FORBIDDEN'); };

    await POST(req(BODY));

    expect(deleteUser).not.toHaveBeenCalled();
  });
});

// --- Rate limit (no se deshace lo de b403a98e) -----------------------------
describe('POST /api/auth/invite · rate limit', () => {
  it('corta al 4º correo al mismo destinatario', async () => {
    for (let i = 0; i < 3; i++) {
      expect((await POST(req(BODY))).status).toBe(200);
    }
    expect(inviteUserByEmail).toHaveBeenCalledTimes(3);

    const bloqueado = await POST(req(BODY));

    expect(bloqueado.status).toBe(429);
    expect(Number(bloqueado.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect(inviteUserByEmail).toHaveBeenCalledTimes(3);
  });

  it('corta a la 31ª petición desde la misma IP', async () => {
    const ip = '198.51.100.250';
    // Códigos inexistentes: no mandan correo, pero sí gastan cubeta de IP.
    inviteRow = null;
    for (let i = 0; i < 30; i++) {
      expect((await POST(req(BODY, { 'x-forwarded-for': ip }))).status).toBe(404);
    }

    const bloqueado = await POST(req(BODY, { 'x-forwarded-for': ip }));

    expect(bloqueado.status).toBe(429);
  });

  it('una sesión no autorizada no gasta la cubeta del destinatario', async () => {
    // Si el límite por correo se aplicara antes de autorizar, cualquiera podría
    // dejar sin invitaciones a una dirección legítima.
    contextoDeSesion = () => { throw new FakeOrgContextError('No perteneces a esa organización', 403, 'ORG_FORBIDDEN'); };
    for (let i = 0; i < 5; i++) await POST(req(BODY));

    contextoDeSesion = () => ADMIN_CTX;
    const res = await POST(req(BODY));

    expect(res.status).toBe(200);
    expect(inviteUserByEmail).toHaveBeenCalledTimes(1);
  });
});

// --- Destino del enlace ----------------------------------------------------
describe('POST /api/auth/invite · origin', () => {
  it('ignora un origin ajeno y usa el de la petición', async () => {
    await POST(req({ ...BODY, origin: 'https://phishing.example' }, { origin: ORIGIN }));

    expect(llamada<[string, InviteArgs]>(inviteUserByEmail)[1].redirectTo).toBe(
      'https://app.goadmin.io/auth/invite?invite_code=abc123'
    );
  });
});
