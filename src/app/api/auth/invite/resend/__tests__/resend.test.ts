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
 *
 * Y las dos de seguridad de la ruta (que es pública y manda correo):
 *
 * 3. No había rate limit: cada petición disparaba un signInWithOtp, así que
 *    servía para bombardear un buzón o agotar la cuota de envío.
 * 4. La respuesta distinguía los casos (404 sin invitación, 200 con ella), lo
 *    que permitía enumerar qué correos tienen invitación pendiente.
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
/** Simula un fallo de la consulta (PostgREST caído, permisos, etc.). */
let errorBD: PostgrestError | null;

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
          if (errorBD) return { data: null, error: errorBD };
          if (error) return { data: null, error };
          const match = inviteRow && predicates.every((p) => p(inviteRow as Row));
          return { data: match ? inviteRow : null, error: null };
        },
      };
      return builder;
    },
  };
}

/** Argumento tipado para poder inspeccionar `mock.calls[n][0]` sin `any`. */
type OtpArgs = {
  email: string;
  options: { emailRedirectTo: string; data: Record<string, unknown> };
};

const signInWithOtp = jest.fn(async (_args: OtpArgs) => ({ error: null }));

jest.mock('@/lib/supabase/admin', () => ({
  getSupabaseAdmin: () => makeAdmin(),
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { signInWithOtp } }),
}));

import { POST } from '../route';
import { _resetRateLimits } from '@/lib/security/rateLimit';

const ORIGIN = 'https://app.goadmin.io';

/**
 * La ruta usa request.json() y los headers (IP para el rate limit, origin para
 * validar el destino del magic link). Cada test parte de una IP distinta salvo
 * que quiera compartir cubeta a propósito.
 */
function req(body: unknown, headers: Record<string, string> = {}) {
  const all: Record<string, string> = { origin: ORIGIN, host: 'app.goadmin.io', ...headers };
  return {
    json: async () => body,
    headers: { get: (k: string) => all[k.toLowerCase()] ?? null },
  } as unknown as Request;
}

/** El mensaje único que devuelve la ruta para todos los desenlaces. */
const MENSAJE_UNIFORME = 'Si existe una invitación pendiente, te enviamos el enlace.';

/** Respuesta indistinguible: 200 + success + el mismo mensaje, sin `error`. */
async function esperarRespuestaUniforme(res: Response) {
  expect(res.status).toBe(200);
  await expect(res.json()).resolves.toEqual({ success: true, message: MENSAJE_UNIFORME });
}

let ipSeq = 0;
/** IP nueva por test para que las cubetas del rate limit no se solapen. */
function ipUnica() {
  ipSeq += 1;
  return `203.0.113.${ipSeq}`;
}

const BODY = { email: 'Persona@Ejemplo.COM', origin: ORIGIN };
const EN_UNA_SEMANA = new Date(Date.now() + 7 * 24 * 3600_000).toISOString();
const HACE_UN_DIA = new Date(Date.now() - 24 * 3600_000).toISOString();

beforeEach(() => {
  _resetRateLimits();
  errorBD = null;
  signInWithOtp.mockClear();
  selectSpy = jest.fn();
  inviteRow = {
    code: 'abc123',
    organization_id: 142,
    role_id: 4,
    email: 'persona@ejemplo.com',
    status: 'pending',
    expires_at: EN_UNA_SEMANA,
    organizations: { name: 'Organización Demo' },
  };
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://ejemplo.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-de-prueba';
});

describe('POST /api/auth/invite/resend', () => {
  it('no pide columnas que no existen en invitations (regresión 42703)', async () => {
    const res = await POST(req(BODY));

    await esperarRespuestaUniforme(res);

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
          organization_name: 'Organización Demo',
        },
      },
    });
  });

  // --- Vencimiento -------------------------------------------------------
  it('NO reenvía una invitación pendiente pero vencida', async () => {
    inviteRow!.expires_at = HACE_UN_DIA;

    const res = await POST(req(BODY));

    await esperarRespuestaUniforme(res);
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it('trata expires_at IS NULL como "no vence" y sí reenvía', async () => {
    inviteRow!.expires_at = null;

    const res = await POST(req(BODY));

    await esperarRespuestaUniforme(res);
    expect(signInWithOtp).toHaveBeenCalledTimes(1);
  });

  // --- Nombre de la organización ----------------------------------------
  it('acepta el embed como array (to-many) sin perder el nombre', async () => {
    inviteRow!.organizations = [{ name: 'Otra Organización' }];

    await POST(req(BODY));

    expect(signInWithOtp.mock.calls[0][0].options.data.organization_name).toBe('Otra Organización');
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
  it('no reenvía nada si no hay invitación pendiente', async () => {
    inviteRow = null;

    const res = await POST(req(BODY));

    await esperarRespuestaUniforme(res);
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it('responde 400 si faltan email u origin', async () => {
    const res = await POST(req({ email: '', origin: '' }));

    expect(res.status).toBe(400);
    expect(signInWithOtp).not.toHaveBeenCalled();
  });
});

// --- Enumeración de correos ---------------------------------------------
describe('POST /api/auth/invite/resend · respuesta uniforme', () => {
  /**
   * El atacante no puede distinguir por el cuerpo, el código ni las claves de
   * la respuesta si el correo tiene invitación pendiente. Antes: 404 vs 200.
   */
  it('devuelve exactamente lo mismo con invitación, sin ella, vencida, aceptada o con la BD caída', async () => {
    const respuestas: Array<{ status: number; body: unknown }> = [];

    const escenarios: Array<() => void> = [
      () => {}, // invitación vigente
      () => { inviteRow = null; }, // sin invitación
      () => { inviteRow!.expires_at = HACE_UN_DIA; }, // vencida
      () => { inviteRow!.status = 'accepted'; }, // ya aceptada
    ];

    for (const escenario of escenarios) {
      _resetRateLimits();
      inviteRow = {
        code: 'abc123',
        organization_id: 142,
        role_id: 4,
        email: 'persona@ejemplo.com',
        status: 'pending',
        expires_at: EN_UNA_SEMANA,
        organizations: { name: 'Organización Demo' },
      };
      escenario();

      const res = await POST(req(BODY, { 'x-forwarded-for': ipUnica() }));
      respuestas.push({ status: res.status, body: await res.json() });
    }

    // Fallo de la consulta: tampoco puede delatarse con un 500 distinto.
    _resetRateLimits();
    errorBD = { code: 'XX000', message: 'db is down' };
    const resError = await POST(req(BODY, { 'x-forwarded-for': ipUnica() }));
    respuestas.push({ status: resError.status, body: await resError.json() });

    for (const r of respuestas) {
      expect(r).toEqual(respuestas[0]);
      expect(r.status).toBe(200);
      expect(r.body).toEqual({ success: true, message: MENSAJE_UNIFORME });
    }
  });

  it('un correo con formato inválido responde igual que uno válido sin invitación', async () => {
    inviteRow = null;
    const conFormato = await POST(req(BODY, { 'x-forwarded-for': ipUnica() }));
    const sinFormato = await POST(
      req({ email: 'no-es-un-correo', origin: ORIGIN }, { 'x-forwarded-for': ipUnica() })
    );

    expect({ status: sinFormato.status, body: await sinFormato.json() }).toEqual({
      status: conFormato.status,
      body: await conFormato.json(),
    });
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it('el body mal formado sí devuelve 400 (no revela nada del destinatario)', async () => {
    const roto = {
      json: async () => { throw new SyntaxError('Unexpected token'); },
      headers: { get: () => null },
    } as unknown as Request;

    const res = await POST(roto);

    expect(res.status).toBe(400);
    expect(signInWithOtp).not.toHaveBeenCalled();
  });
});

// --- Rate limit -----------------------------------------------------------
describe('POST /api/auth/invite/resend · rate limit', () => {
  it('corta a la 4ª petición al mismo correo: 3 envíos y luego 429', async () => {
    // IP distinta en cada intento: el límite que salta es el del correo.
    for (let i = 0; i < 3; i++) {
      const res = await POST(req(BODY, { 'x-forwarded-for': ipUnica() }));
      await esperarRespuestaUniforme(res);
    }
    expect(signInWithOtp).toHaveBeenCalledTimes(3);

    const bloqueado = await POST(req(BODY, { 'x-forwarded-for': ipUnica() }));

    expect(bloqueado.status).toBe(429);
    await expect(bloqueado.json()).resolves.toMatchObject({
      error: 'Demasiados intentos. Intenta de nuevo en unos minutos.',
    });
    // Lo importante: el 429 NO manda otro correo.
    expect(signInWithOtp).toHaveBeenCalledTimes(3);
  });

  it('corta a la 6ª petición desde la misma IP aunque cambie el destinatario', async () => {
    const ip = ipUnica();

    for (let i = 0; i < 5; i++) {
      inviteRow!.email = `victima${i}@ejemplo.com`;
      const res = await POST(
        req({ email: `victima${i}@ejemplo.com`, origin: ORIGIN }, { 'x-forwarded-for': ip })
      );
      await esperarRespuestaUniforme(res);
    }
    expect(signInWithOtp).toHaveBeenCalledTimes(5);

    inviteRow!.email = 'victima5@ejemplo.com';
    const bloqueado = await POST(
      req({ email: 'victima5@ejemplo.com', origin: ORIGIN }, { 'x-forwarded-for': ip })
    );

    expect(bloqueado.status).toBe(429);
    expect(signInWithOtp).toHaveBeenCalledTimes(5);
  });

  it('el 429 trae Retry-After en segundos', async () => {
    const ip = ipUnica();
    for (let i = 0; i < 3; i++) await POST(req(BODY, { 'x-forwarded-for': ip }));

    const bloqueado = await POST(req(BODY, { 'x-forwarded-for': ip }));

    const retryAfter = Number(bloqueado.headers.get('Retry-After'));
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(15 * 60);
  });

  it('el rate limit no distingue si el correo tiene invitación o no', async () => {
    // Si solo se limitaran los correos existentes, el 429 sería en sí mismo
    // un oráculo de enumeración.
    inviteRow = null;
    const ip = ipUnica();
    for (let i = 0; i < 3; i++) await POST(req(BODY, { 'x-forwarded-for': ip }));

    const bloqueado = await POST(req(BODY, { 'x-forwarded-for': ip }));

    expect(bloqueado.status).toBe(429);
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it('cuenta el correo normalizado: cambiar mayúsculas no reinicia la cubeta', async () => {
    for (let i = 0; i < 3; i++) {
      await POST(
        req({ email: 'Persona@Ejemplo.COM', origin: ORIGIN }, { 'x-forwarded-for': ipUnica() })
      );
    }

    const bloqueado = await POST(
      req({ email: ' PERSONA@ejemplo.com ', origin: ORIGIN }, { 'x-forwarded-for': ipUnica() })
    );

    expect(bloqueado.status).toBe(429);
    expect(signInWithOtp).toHaveBeenCalledTimes(3);
  });
});

// --- Destino del magic link ----------------------------------------------
describe('POST /api/auth/invite/resend · origin', () => {
  it('ignora un origin ajeno y usa el de la petición', async () => {
    await POST(
      req(
        { email: BODY.email, origin: 'https://phishing.example' },
        { 'x-forwarded-for': ipUnica(), origin: ORIGIN }
      )
    );

    expect(signInWithOtp.mock.calls[0][0].options.emailRedirectTo).toBe(
      'https://app.goadmin.io/auth/invite?invite_code=abc123'
    );
  });

  it('reconstruye el origin desde x-forwarded-host si no viene el header origin', async () => {
    await POST(
      req(
        { email: BODY.email, origin: 'https://phishing.example' },
        {
          'x-forwarded-for': ipUnica(),
          'x-forwarded-host': 'app.goadmin.io',
          'x-forwarded-proto': 'https',
        }
      )
    );

    expect(signInWithOtp.mock.calls[0][0].options.emailRedirectTo).toBe(
      'https://app.goadmin.io/auth/invite?invite_code=abc123'
    );
  });
});
