/// <reference types="jest" />
/**
 * /api/auth/invite crea o reenvía invitaciones y manda correo con la service
 * role. Historia de agujeros que este archivo impide reabrir:
 *
 * 1. `organizationId`, `roleId` e `invitedBy` venían del body y se creían tal
 *    cual: cualquier usuario logueado podía invitar a cualquier correo a
 *    cualquier organización, con el rol que quisiera.
 * 2. La rama de "usuario huérfano" llamaba a `auth.admin.deleteUser()` sobre
 *    un usuario cuyo único filtro era `is_invitation`: un borrado de usuarios
 *    al alcance de cualquier sesión, y que además cruzaba tenants.
 * 3. (GO-sec 2026-09-28) El navegador del admin generaba el código con
 *    `Math.random()`, lo insertaba él mismo y la ruta devolvía `inviteUrl`
 *    con el código. Ahora el código lo genera el servidor, rota al reenviar y
 *    nunca vuelve en la respuesta: solo viaja en el correo al destinatario.
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

const HEX64 = /^[0-9a-f]{64}$/;

// --- Estado que cada test ajusta -------------------------------------------
let inviteRow: Row | null;
let pendingDuplicate: Row | null;
let profileRow: Row | null;
let membershipRow: Row | null;
let roleRow: Row | null;
let branchRow: Row | null;
let jobPositionRow: Row | null;
let existsInAuth: boolean;
/** Error de la base al escribir la fila (p. ej. el disparador de cupo, P0-4). */
let errorDeEscritura: (PostgrestError & { hint?: string }) | null;
let authUsers: Array<{ id: string; email: string; user_metadata: Row }>;
let selectSpy: jest.Mock;
const insertSpy = jest.fn();
const updateSpy = jest.fn();

const deleteUser = jest.fn(async () => ({ error: null }));

type InviteArgs = { redirectTo: string; data: Record<string, unknown> };
let inviteUserByEmailError: { message: string } | null;
const inviteUserByEmail = jest.fn(async () => ({ data: {}, error: inviteUserByEmailError }));
const signInWithOtp = jest.fn(async () => ({ error: null }));

/** Encadenamiento mínimo de PostgREST. */
interface Builder {
  select(...args: unknown[]): Builder;
  eq(...args: unknown[]): Builder;
  order(...args: unknown[]): Builder;
  limit(...args: unknown[]): Builder;
  insert(...args: unknown[]): Builder;
  update(...args: unknown[]): Builder;
  in(...args: unknown[]): Builder;
  maybeSingle(): Promise<{ data: Row | null; error: PostgrestError | null }>;
  single(): Promise<{ data: Row | null; error: PostgrestError | null }>;
  /** `await` directo de la consulta: lista (búsqueda de pendientes del mismo correo). */
  then<T>(res: (v: { data: Row[] | null; error: PostgrestError | null }) => T, rej?: (e: unknown) => T): Promise<T>;
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
      const filtros: Row = {};
      let insertado: Row | null = null;
      let actualizado: Row | null = null;

      const rowOf = (): Row | null => {
        if (table === 'invitations') {
          // La búsqueda de duplicados filtra por correo + organización.
          if ('email' in filtros && !('id' in filtros)) return pendingDuplicate;
          return inviteRow;
        }
        if (table === 'profiles') return profileRow;
        if (table === 'organization_members') return membershipRow;
        if (table === 'roles') return roleRow;
        if (table === 'branches') return branchRow;
        if (table === 'job_positions') return jobPositionRow;
        return null;
      };

      const resolver = async () => {
        if (error) return { data: null, error };
        if ((insertado || actualizado) && errorDeEscritura) return { data: null, error: errorDeEscritura };
        if (insertado) {
          return { data: { id: 500, ...insertado, organizations: { name: 'Organización Demo' } }, error: null };
        }
        const row = rowOf();
        const match = row && predicates.every((p) => p(row));
        if (actualizado) {
          if (!match || !row) return { data: null, error: null };
          Object.assign(row, actualizado);
          return { data: { id: row.id }, error: null };
        }
        return { data: match ? row : null, error: null };
      };

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
          filtros[col] = val;
          predicates.push((row) => String(row[col]) === String(val));
          return builder;
        },
        order: () => builder,
        limit: () => builder,
        insert(payload: Row) {
          insertSpy(table, payload);
          insertado = payload;
          return builder;
        },
        update(payload: Row) {
          updateSpy(table, payload);
          actualizado = payload;
          return builder;
        },
        in(col: string, vals: unknown[]) {
          predicates.push((row) => vals.map(String).includes(String(row[col])));
          return builder;
        },
        maybeSingle: resolver,
        single: resolver,
        then(res, rej) {
          const lista = async () => {
            if (error) return { data: null, error };
            const row = rowOf();
            const match = !!row && predicates.every((p) => p(row));
            if (actualizado) {
              if (match && row) Object.assign(row, actualizado);
              return { data: null, error: null };
            }
            return { data: match && row ? [row] : [], error: null };
          };
          return lista().then(res, rej);
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
  organizationName: 'Organización Demo',
  roleId: 2,
  roleName: 'Admin de organización',
  isSuperAdmin: false,
  memberId: 9,
};

type Ctx = typeof ADMIN_CTX;

/** Lo que devuelve (o lanza) la resolución de sesión + membresía. */
let contextoDeSesion: () => Ctx;
const getServerOrgContextFor = jest.fn(async () => contextoDeSesion());
const getServerOrgContext = jest.fn(async () => contextoDeSesion());

jest.mock('@/lib/utils/orgContext', () => {
  // La regla de admin se toma de verdad del módulo hoja, para no reimplantarla
  // en el mock y que el test siga a la implementación si cambia.
  const { isOrgAdminLike } =
    jest.requireActual<typeof import('@/lib/utils/orgAdmin')>('@/lib/utils/orgAdmin');
  return {
    OrgContextError: FakeOrgContextError,
    getServerOrgContextFor,
    getServerOrgContext,
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
const CODIGO_VIEJO = 'c0d160v1ej0000000000000000000000000000000000000000000000000000ab';

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

/** Reenvío, tal y como lo manda InvitationsTab. */
const REENVIO = { invitationId: 1, organizationId: ORG_ID, origin: ORIGIN };
/** Alta, tal y como la manda InvitationsTab. */
const ALTA = {
  email: 'Persona@Ejemplo.COM',
  roleId: 4,
  branchId: 10,
  jobPositionId: null,
  organizationId: ORG_ID,
  origin: ORIGIN,
};

/** Ningún correo salió por ninguna de las dos vías. */
function noSeMandoNingunCorreo() {
  expect(inviteUserByEmail).not.toHaveBeenCalled();
  expect(signInWithOtp).not.toHaveBeenCalled();
}

/** La respuesta nunca lleva el código ni un enlace con él. */
async function sinCodigoEnLaRespuesta(res: Response) {
  const texto = JSON.stringify(await res.clone().json());
  expect(texto).not.toMatch(/invite_code|inviteUrl/);
  expect(texto).not.toContain(CODIGO_VIEJO);
  expect(texto).not.toMatch(/[0-9a-f]{64}/);
}

beforeEach(() => {
  _resetRateLimits();
  deleteUser.mockClear();
  inviteUserByEmail.mockClear();
  signInWithOtp.mockClear();
  getServerOrgContextFor.mockClear();
  getServerOrgContext.mockClear();
  insertSpy.mockClear();
  updateSpy.mockClear();
  selectSpy = jest.fn();
  inviteUserByEmailError = null;

  inviteRow = {
    id: 1,
    code: CODIGO_VIEJO,
    email: 'persona@ejemplo.com',
    organization_id: ORG_ID,
    role_id: 7,
    status: 'pending',
    expires_at: new Date(Date.now() - 24 * 3600_000).toISOString(), // vencida: el reenvío la renueva
    created_at: new Date().toISOString(),
    organizations: { name: 'Organización Demo' },
  };
  pendingDuplicate = null;
  profileRow = null;
  membershipRow = null;
  roleRow = { id: 4 };
  branchRow = { id: 10, organization_id: ORG_ID, is_active: true };
  jobPositionRow = null;
  existsInAuth = false;
  errorDeEscritura = null;
  authUsers = [];
  contextoDeSesion = () => ADMIN_CTX;

  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://ejemplo.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-de-prueba';
});

// --- Reenvío: autorización -------------------------------------------------
describe('POST /api/auth/invite · reenvío · autorización', () => {
  it('sin sesión no manda invitación', async () => {
    contextoDeSesion = () => { throw new FakeOrgContextError('No hay sesión activa', 401, 'UNAUTHENTICATED'); };

    const res = await POST(req(REENVIO));

    expect(res.status).toBe(401);
    noSeMandoNingunCorreo();
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('un usuario de otra organización recibe la respuesta genérica', async () => {
    contextoDeSesion = () => { throw new FakeOrgContextError('No perteneces a esa organización', 403, 'ORG_FORBIDDEN'); };

    const res = await POST(req(REENVIO));

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: 'Invitación no válida o vencida' });
    noSeMandoNingunCorreo();
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('un miembro sin rol de admin recibe 403 y no manda correo', async () => {
    contextoDeSesion = () => ({ ...ADMIN_CTX, roleId: 7, roleName: 'Vendedor', isSuperAdmin: false });

    const res = await POST(req(REENVIO));

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({ code: 'ADMIN_REQUIRED' });
    noSeMandoNingunCorreo();
  });

  it('el admin reenvía: rota el código, renueva la vigencia y no devuelve el código', async () => {
    const res = await POST(req(REENVIO));

    expect(res.status).toBe(200);
    await sinCodigoEnLaRespuesta(res);
    await expect(res.json()).resolves.toEqual({ success: true, invitationId: 1 });

    const [, cambios] = llamada<[string, Row]>(updateSpy);
    expect(cambios.code).toMatch(HEX64);
    expect(cambios.code).not.toBe(CODIGO_VIEJO);
    expect(new Date(String(cambios.expires_at)).getTime()).toBeGreaterThan(Date.now() + 29 * 24 * 3600_000);

    const [, args] = llamada<[string, InviteArgs]>(inviteUserByEmail);
    expect(args.redirectTo).toBe(`https://app.goadmin.io/auth/invite?invite_code=${cambios.code}`);
  });

  it('la membresía se comprueba contra la organización de la invitación, no la del body', async () => {
    inviteRow!.organization_id = 999;

    await POST(req({ invitationId: 1, origin: ORIGIN }));

    expect(llamada<[number]>(getServerOrgContextFor)[0]).toBe(999);
  });

  it('un organizationId del body distinto al de la invitación es 403', async () => {
    const res = await POST(req({ ...REENVIO, organizationId: 777 }));

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: 'La organización no coincide con la invitación' });
    noSeMandoNingunCorreo();
  });
});

// --- Reenvío: la fila manda -------------------------------------------------
describe('POST /api/auth/invite · reenvío · la invitación manda sobre el body', () => {
  it('una invitación que no existe no manda correo', async () => {
    inviteRow = null;

    const res = await POST(req(REENVIO));

    expect(res.status).toBe(404);
    noSeMandoNingunCorreo();
    expect(getServerOrgContextFor).not.toHaveBeenCalled();
  });

  it.each(['revoked', 'used'])('una invitación %s no se revive', async (status) => {
    inviteRow!.status = status;

    const res = await POST(req(REENVIO));

    expect(res.status).toBe(404);
    noSeMandoNingunCorreo();
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('un invitationId que no es un entero positivo es 400', async () => {
    const res = await POST(req({ invitationId: 'abc', origin: ORIGIN }));

    expect(res.status).toBe(400);
    noSeMandoNingunCorreo();
  });

  it('el rol, la organización y el invitador salen de la invitación y la sesión; sin código en metadata', async () => {
    await POST(req({ ...REENVIO, roleId: 1, organizationName: 'Org Falsa', invitedBy: 'u-suplantado' }));

    expect(llamada<[string, InviteArgs]>(inviteUserByEmail)[1].data).toEqual({
      organization_id: ORG_ID,
      organization_name: 'Organización Demo',
      role_id: 7,
      is_invitation: true,
      invited_by: 'u-admin',
    });
  });

  it('no pide columnas que no existen en invitations (regresión 42703)', async () => {
    await POST(req(REENVIO));

    for (const [select] of selectSpy.mock.calls as Array<[string]>) {
      const columnas = splitTopLevel(select).filter((f) => !f.includes('('));
      expect(columnas.every((c) => INVITATIONS_COLUMNS.includes(c))).toBe(true);
    }
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

// --- Alta ---------------------------------------------------------------------
describe('POST /api/auth/invite · alta', () => {
  it('el admin crea la invitación: organización de la sesión, código del servidor, sin código en la respuesta', async () => {
    const res = await POST(req(ALTA));

    expect(res.status).toBe(200);
    await sinCodigoEnLaRespuesta(res);
    await expect(res.json()).resolves.toEqual({ success: true, invitationId: 500 });

    const [tabla, fila] = llamada<[string, Row]>(insertSpy);
    expect(tabla).toBe('invitations');
    expect(fila).toMatchObject({
      email: 'persona@ejemplo.com',
      role_id: 4,
      organization_id: ORG_ID,
      branch_id: 10,
      created_by: 'u-admin',
      status: 'pending',
    });
    expect(String(fila.code)).toMatch(HEX64);
    expect(inviteUserByEmail).toHaveBeenCalledTimes(1);
    expect(getServerOrgContext).toHaveBeenCalledTimes(1);
  });

  it('un organizationId del body distinto al de la sesión es 403 y no crea nada', async () => {
    const res = await POST(req({ ...ALTA, organizationId: 777 }));

    expect(res.status).toBe(403);
    expect(insertSpy).not.toHaveBeenCalled();
    noSeMandoNingunCorreo();
  });

  it('sin sesión es 401 y un miembro sin rol de admin 403', async () => {
    contextoDeSesion = () => { throw new FakeOrgContextError('No hay sesión activa', 401, 'UNAUTHENTICATED'); };
    expect((await POST(req(ALTA))).status).toBe(401);

    contextoDeSesion = () => ({ ...ADMIN_CTX, roleId: 7, isSuperAdmin: false });
    expect((await POST(req(ALTA))).status).toBe(403);

    expect(insertSpy).not.toHaveBeenCalled();
    noSeMandoNingunCorreo();
  });

  it('no se invita como Super Admin (rol 1)', async () => {
    const res = await POST(req({ ...ALTA, roleId: 1 }));

    expect(res.status).toBe(400);
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it('una sucursal que no es de la organización es 400', async () => {
    branchRow = { id: 10, organization_id: 999 };

    const res = await POST(req(ALTA));

    expect(res.status).toBe(400);
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it('una invitación pendiente para el mismo correo es 409 YA_INVITADO', async () => {
    pendingDuplicate = { id: 3, email: 'persona@ejemplo.com', organization_id: ORG_ID, status: 'pending' };

    const res = await POST(req(ALTA));

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({ code: 'YA_INVITADO' });
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it('una pendiente VENCIDA no bloquea: se marca expired y se crea la nueva (P1-5)', async () => {
    pendingDuplicate = {
      id: 3,
      email: 'persona@ejemplo.com',
      organization_id: ORG_ID,
      status: 'pending',
      expires_at: '2020-01-01T00:00:00Z',
    };

    const res = await POST(req(ALTA));

    expect(res.status).toBe(200);
    expect(updateSpy).toHaveBeenCalledWith('invitations', { status: 'expired' });
    expect(insertSpy).toHaveBeenCalledWith('invitations', expect.objectContaining({ status: 'pending' }));
  });

  it('una pendiente con vigencia en el futuro sigue siendo 409', async () => {
    pendingDuplicate = {
      id: 3,
      email: 'persona@ejemplo.com',
      organization_id: ORG_ID,
      status: 'pending',
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    };

    const res = await POST(req(ALTA));

    expect(res.status).toBe(409);
    expect(updateSpy).not.toHaveBeenCalledWith('invitations', { status: 'expired' });
  });

  it('un miembro activo de la organización es 409 YA_MIEMBRO', async () => {
    profileRow = { id: 'u-x', email: 'persona@ejemplo.com' };
    membershipRow = { id: 8, user_id: 'u-x', organization_id: ORG_ID, is_active: true };

    const res = await POST(req(ALTA));

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({ code: 'YA_MIEMBRO' });
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it('si el correo no sale: 502 con el id para reenviar, sin código', async () => {
    inviteUserByEmailError = { message: 'SMTP caído' };

    const res = await POST(req(ALTA));

    expect(res.status).toBe(502);
    await sinCodigoEnLaRespuesta(res);
    await expect(res.json()).resolves.toMatchObject({ code: 'CORREO_NO_ENVIADO', invitationId: 500 });
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

    const res = await POST(req(REENVIO));

    expect(llamada<[string]>(deleteUser)[0]).toBe('u-huerfano');
    expect(inviteUserByEmail).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
  });

  it('NO borra un huérfano de otra organización: cae al magic link', async () => {
    authUsers = [huerfano(999)];

    const res = await POST(req(REENVIO));

    expect(deleteUser).not.toHaveBeenCalled();
    expect(signInWithOtp).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
  });

  it('NO borra a un usuario que ya tiene perfil', async () => {
    authUsers = [huerfano(ORG_ID)];
    profileRow = { id: 'u-huerfano' };

    await POST(req(REENVIO));

    expect(deleteUser).not.toHaveBeenCalled();
    expect(signInWithOtp).toHaveBeenCalledTimes(1);
  });

  it('NO borra a un usuario que ya tiene membresía', async () => {
    authUsers = [huerfano(ORG_ID)];
    membershipRow = { id: 5, user_id: 'u-huerfano' };

    await POST(req(REENVIO));

    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('sin autorización no se llega siquiera a listar usuarios de auth', async () => {
    authUsers = [huerfano(ORG_ID)];
    contextoDeSesion = () => { throw new FakeOrgContextError('No perteneces a esa organización', 403, 'ORG_FORBIDDEN'); };

    await POST(req(REENVIO));

    expect(deleteUser).not.toHaveBeenCalled();
  });
});

// --- Rate limit ----------------------------------------------------------------
describe('POST /api/auth/invite · rate limit', () => {
  it('corta al 4º correo al mismo destinatario', async () => {
    for (let i = 0; i < 3; i++) {
      inviteRow!.status = 'pending';
      expect((await POST(req(REENVIO))).status).toBe(200);
    }
    expect(inviteUserByEmail).toHaveBeenCalledTimes(3);

    const bloqueado = await POST(req(REENVIO));

    expect(bloqueado.status).toBe(429);
    expect(Number(bloqueado.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect(inviteUserByEmail).toHaveBeenCalledTimes(3);
  });

  it('corta a la 31ª petición desde la misma IP', async () => {
    const ip = '198.51.100.250';
    inviteRow = null;
    for (let i = 0; i < 30; i++) {
      expect((await POST(req(REENVIO, { 'x-forwarded-for': ip }))).status).toBe(404);
    }

    const bloqueado = await POST(req(REENVIO, { 'x-forwarded-for': ip }));

    expect(bloqueado.status).toBe(429);
  });

  it('una sesión no autorizada no gasta la cubeta del destinatario', async () => {
    contextoDeSesion = () => { throw new FakeOrgContextError('No perteneces a esa organización', 403, 'ORG_FORBIDDEN'); };
    for (let i = 0; i < 5; i++) await POST(req(REENVIO));

    contextoDeSesion = () => ADMIN_CTX;
    const res = await POST(req(REENVIO));

    expect(res.status).toBe(200);
    expect(inviteUserByEmail).toHaveBeenCalledTimes(1);
  });
});

// --- Destino del enlace ----------------------------------------------------
describe('POST /api/auth/invite · origin', () => {
  it('ignora un origin ajeno y usa el de la petición', async () => {
    await POST(req({ ...REENVIO, origin: 'https://phishing.example' }, { origin: ORIGIN }));

    expect(llamada<[string, InviteArgs]>(inviteUserByEmail)[1].redirectTo).toMatch(
      /^https:\/\/app\.goadmin\.io\/auth\/invite\?invite_code=[0-9a-f]{64}$/
    );
  });
});

// --- Cupo del plan en la base (auditoría 2026-10, P0-4) y reenvío de vencidas (P1-5)
describe('POST /api/auth/invite · cupo del plan y vencidas', () => {
  const RECHAZO_CUPO = {
    code: 'P0001',
    hint: 'cupo_plan_usuarios',
    message: 'El plan permite 10 usuarios y ya están ocupados 10 (9 activos y 1 invitaciones pendientes). Compra usuarios adicionales, cambia de plan o revoca una invitación.',
  };

  it('alta fuera del cupo: 409 con el mensaje de la base y sin correo', async () => {
    errorDeEscritura = RECHAZO_CUPO;

    const res = await POST(req(ALTA));

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ error: RECHAZO_CUPO.message, code: 'CUPO_PLAN_USUARIOS' });
    noSeMandoNingunCorreo();
  });

  it('reenviar una vencida fuera del cupo: 409, sin correo', async () => {
    errorDeEscritura = RECHAZO_CUPO;

    const res = await POST(req(REENVIO));

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({ code: 'CUPO_PLAN_USUARIOS' });
    noSeMandoNingunCorreo();
  });

  it('otro error al crear sigue siendo 500 genérico', async () => {
    errorDeEscritura = { code: '23505', message: 'duplicate key value violates unique constraint' };

    const res = await POST(req(ALTA));

    expect(res.status).toBe(500);
    noSeMandoNingunCorreo();
  });

  it('una invitación ya marcada expired se puede reenviar: vuelve a pending con código y vigencia nuevos', async () => {
    inviteRow = { ...inviteRow!, status: 'expired' };

    const res = await POST(req(REENVIO));

    expect(res.status).toBe(200);
    const [, cambios] = llamada<[string, Row]>(updateSpy);
    expect(cambios).toMatchObject({ status: 'pending' });
    expect(cambios.code).not.toBe(CODIGO_VIEJO);
    expect(new Date(String(cambios.expires_at)).getTime()).toBeGreaterThan(Date.now());
    expect(inviteUserByEmail).toHaveBeenCalledTimes(1);
  });

  it('una usada o revocada no se reenvía', async () => {
    for (const status of ['used', 'revoked']) {
      inviteRow = { ...inviteRow!, status };
      const res = await POST(req(REENVIO));
      expect(res.status).toBe(404);
    }
    noSeMandoNingunCorreo();
  });
});
