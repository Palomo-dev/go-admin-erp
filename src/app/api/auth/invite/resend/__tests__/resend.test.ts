/// <reference types="jest" />
/**
 * Regresiones del reenvío del magic link:
 *
 * 1. El select pedía `invitations.organization_name`, columna que NO existe.
 *    PostgREST respondía 42703, la ruta devolvía 500 y el usuario nunca
 *    recibía el enlace.
 * 2. Se filtraba solo por `status = 'pending'`, pero una invitación caducada
 *    conserva ese estado: pedir el reenvío revivía una invitación vencida con
 *    un magic link nuevo y válido.
 *
 * El doble de Supabase valida el `select()` contra el esquema real de
 * `invitations` (12 columnas, verificadas en information_schema) y además
 * EVALÚA los filtros `.eq()` y `.or()` sobre la fila, para que el test falle
 * igual que producción en vez de pasar por un mock complaciente.
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

type Row = Record<string, any>;
type Predicate = (row: Row) => boolean;

/** Evalúa un término de PostgREST del tipo `columna.operador.valor`. */
function evalTerm(term: string, row: Row): boolean {
  const first = term.indexOf('.');
  const second = term.indexOf('.', first + 1);
  const col = term.slice(0, first);
  const op = term.slice(first + 1, second);
  const raw = term.slice(second + 1);
  const value = row[col];

  switch (op) {
    case 'is':
      return raw === 'null' ? value == null : value === (raw === 'true');
    case 'gt':
      return value != null && new Date(value).getTime() > new Date(raw).getTime();
    case 'lt':
      return value != null && new Date(value).getTime() < new Date(raw).getTime();
    case 'eq':
      return String(value) === raw;
    default:
      throw new Error(`Operador no soportado en el doble: ${op}`);
  }
}

type PostgrestError = { code: string; message: string };

let inviteRow: Row | null;
let selectSpy: jest.Mock;

/** Doble mínimo de PostgREST: valida columnas y aplica los filtros. */
function makeAdmin() {
  return {
    from(table: string) {
      let error: PostgrestError | null = null;
      const predicates: Predicate[] = [];

      const builder: any = {
        select(select: string) {
          selectSpy(select);
          for (const field of splitTopLevel(select)) {
            if (field.includes('(')) continue; // embed (relación), no columna
            if (table === 'invitations' && !INVITATIONS_COLUMNS.includes(field)) {
              error = { code: '42703', message: `column ${table}.${field} does not exist` };
            }
          }
          return builder;
        },
        eq(col: string, val: unknown) {
          predicates.push((row) => String(row[col]) === String(val));
          return builder;
        },
        // PostgREST une los términos de `.or()` con OR, y el conjunto con AND.
        or(expr: string) {
          predicates.push((row) => splitTopLevel(expr).some((t) => evalTerm(t, row)));
          return builder;
        },
        order: () => builder,
        limit: () => builder,
        maybeSingle: async () => {
          if (error) return { data: null, error };
          const match = inviteRow && predicates.every((p) => p(inviteRow as Row));
          return { data: match ? inviteRow : null, error: null };
        },
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
const EN_UNA_SEMANA = new Date(Date.now() + 7 * 24 * 3600_000).toISOString();
const HACE_UN_DIA = new Date(Date.now() - 24 * 3600_000).toISOString();

beforeEach(() => {
  signInWithOtp.mockClear();
  selectSpy = jest.fn();
  inviteRow = {
    code: 'abc123',
    organization_id: 142,
    role_id: 4,
    email: 'persona@ejemplo.com',
    status: 'pending',
    expires_at: EN_UNA_SEMANA,
    organizations: { name: 'Space Cocktails' },
  };
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://ejemplo.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-de-prueba';
});

describe('POST /api/auth/invite/resend', () => {
  it('no pide columnas que no existen en invitations (regresión 42703)', async () => {
    const res = await POST(req(BODY));

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

  // --- Vencimiento -------------------------------------------------------
  it('NO reenvía una invitación pendiente pero vencida: 404', async () => {
    inviteRow!.expires_at = HACE_UN_DIA;

    const res = await POST(req(BODY));

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({
      error: 'No hay invitaciones pendientes para este correo',
    });
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it('trata expires_at IS NULL como "no vence" y sí reenvía', async () => {
    inviteRow!.expires_at = null;

    const res = await POST(req(BODY));

    expect(res.status).toBe(200);
    expect(signInWithOtp).toHaveBeenCalledTimes(1);
  });

  // --- Nombre de la organización ----------------------------------------
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

  // --- Casos de borde ----------------------------------------------------
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
