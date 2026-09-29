// ============================================================
// §13 — rutas nuevas de Membresías: sesión, organización y permisos (reglas duras 5 y 6).
//
//   POST /api/membresias/reservas/[id]/entrada   (memberships.checkin)
//   POST /api/membresias/importar/clases         (memberships.classes.manage)
//   POST /api/membresias/importar/reservas       (memberships.classes.manage)
//
//   - sin sesión: 401 y no se toca la base;
//   - sin el permiso: 403 «sin_permiso» sin llamar la RPC;
//   - una reserva de OTRA organización: 404 (se busca con la organización de la sesión);
//   - una organización ajena en el body o la query: 403 sin tocar la base;
//   - las RPC reciben la organización de la SESIÓN.
// Se usa el servicio real (operacionClases.server) con un cliente Supabase simulado: se prueba el
// cableado hasta la RPC. Las reglas de la base se probaron en seco con el MCP (§13).
// ============================================================

const ORG_SESION = 120;
const ORG_AJENA = 999;
const RESERVA_PROPIA = 7;

const guion = {
  sesion: true,
  permisos: { ver: true, planes: false, congelar: false, cancelar: false, checkin: true, clases: true, dispositivos: false } as Record<string, boolean>,
  errorRpc: null as { message: string; code: string } | null,
  lecturas: [] as Array<{ tabla: string; filtros: Record<string, unknown> }>,
  rpcs: [] as Array<{ fn: string; args: Record<string, unknown> }>,
};

function supabaseSimulado() {
  return {
    from(tabla: string) {
      const filtros: Record<string, unknown> = {};
      const q = {
        select: () => q,
        eq: (col: string, val: unknown) => {
          filtros[col] = val;
          return q;
        },
        maybeSingle: async () => {
          guion.lecturas.push({ tabla, filtros: { ...filtros } });
          // Solo la reserva 7 existe y es de la organización de la sesión (RLS + filtro explícito).
          const propia = filtros.id === RESERVA_PROPIA && filtros.organization_id === ORG_SESION;
          return {
            data: propia ? { id: RESERVA_PROPIA, customer_id: '11111111-2222-4333-8444-555555555555', gym_classes: { branch_id: 79, organization_id: ORG_SESION } } : null,
            error: null,
          };
        },
      };
      return q;
    },
    async rpc(fn: string, args: Record<string, unknown>) {
      guion.rpcs.push({ fn, args });
      if (guion.errorRpc) return { data: null, error: guion.errorRpc };
      if (fn === 'fn_membresia_registrar_checkin') {
        return { data: { permitido: true, checkin_id: 5, repetida: false, reserva: { id: RESERVA_PROPIA, estado: 'checked_in' }, membresia: null }, error: null };
      }
      return { data: { ok: true, importadas: 0, validas: 1, con_error: 0, solo_validar: true, filas: [{ fila: 2, errores: [], inicio: null }] }, error: null };
    },
  };
}

jest.mock('@/lib/utils/orgContext', () => {
  const { OrgContextError } = jest.requireActual<typeof import('@/lib/utils/orgContextError')>('@/lib/utils/orgContextError');
  const jsonError = (status: number, code: string, message?: string) =>
    new Response(JSON.stringify({ error: message ?? code, code }), { status, headers: { 'Content-Type': 'application/json' } });
  return {
    OrgContextError,
    jsonError,
    withOrg:
      (handler: (ctx: unknown, req: Request, rp: unknown) => Promise<Response>) =>
      async (req: Request, rp: unknown) => {
        try {
          if (!guion.sesion) throw new OrgContextError('No hay sesión activa', 401, 'UNAUTHENTICATED');
          const ctx = { userId: 'u-1', organizationId: ORG_SESION, roleId: 5, isSuperAdmin: false, supabase: supabaseSimulado() };
          return await handler(ctx, req, rp);
        } catch (err) {
          if (err instanceof OrgContextError) return jsonError(err.statusCode, err.code, err.message);
          throw err;
        }
      },
  };
});

jest.mock('@/lib/services/membresias/membresias.server', () => {
  class ErrorMembresiasServidor extends Error {
    constructor(public readonly codigo: string, public readonly estado: number = 400) {
      super(codigo);
    }
  }
  return {
    ErrorMembresiasServidor,
    // Permisos resueltos en el servidor (en producción: get_user_permission_codes).
    exigir: async (_ctx: unknown, accion: string) => {
      if (!guion.permisos[accion]) throw new ErrorMembresiasServidor('sin_permiso', 403);
      return guion.permisos;
    },
  };
});

import { POST as postEntrada } from '@/app/api/membresias/reservas/[id]/entrada/route';
import { POST as postImportarClases } from '@/app/api/membresias/importar/clases/route';
import { POST as postImportarReservas } from '@/app/api/membresias/importar/reservas/route';

const params = (id = '') => ({ params: Promise.resolve({ id }) });
const jsonReq = (url: string, body: unknown) =>
  new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

const FILA_CLASE = { fila: 2, titulo: 'Yoga', instructor: 'a@b.co', fecha: '2026-10-05', hora: '07:00', duracion: 60, capacidad: 15 };
const FILA_RESERVA = { fila: 2, documento: '1020304', clase: 'Yoga', fecha: '2026-10-05', hora: '07:00' };

beforeEach(() => {
  guion.sesion = true;
  guion.permisos = { ver: true, planes: false, congelar: false, cancelar: false, checkin: true, clases: true, dispositivos: false };
  guion.errorRpc = null;
  guion.lecturas = [];
  guion.rpcs = [];
});

describe('sesión', () => {
  it('sin sesión: 401 en las tres rutas y la base no se toca', async () => {
    guion.sesion = false;
    const rs = [
      await postEntrada(jsonReq('http://x/api/membresias/reservas/7/entrada', {}), params('7')),
      await postImportarClases(jsonReq('http://x/api/membresias/importar/clases', { filas: [FILA_CLASE] }), params()),
      await postImportarReservas(jsonReq('http://x/api/membresias/importar/reservas', { filas: [FILA_RESERVA] }), params()),
    ];
    expect(rs.map((r) => r.status)).toEqual([401, 401, 401]);
    expect(guion.rpcs).toHaveLength(0);
    expect(guion.lecturas).toHaveLength(0);
  });
});

describe('permisos resueltos en el servidor', () => {
  it('entrada sin memberships.checkin: 403 sin leer la reserva ni llamar la RPC', async () => {
    guion.permisos.checkin = false;
    const r = await postEntrada(jsonReq('http://x/api/membresias/reservas/7/entrada', {}), params('7'));
    expect(r.status).toBe(403);
    expect((await r.json()).codigo).toBe('sin_permiso');
    expect(guion.lecturas).toHaveLength(0);
    expect(guion.rpcs).toHaveLength(0);
  });

  it('importar sin memberships.classes.manage: 403 en clases y reservas', async () => {
    guion.permisos.clases = false;
    for (const r of [
      await postImportarClases(jsonReq('http://x/api/membresias/importar/clases', { filas: [FILA_CLASE], soloValidar: true }), params()),
      await postImportarReservas(jsonReq('http://x/api/membresias/importar/reservas', { filas: [FILA_RESERVA] }), params()),
    ]) {
      expect(r.status).toBe(403);
      expect((await r.json()).codigo).toBe('sin_permiso');
    }
    expect(guion.rpcs).toHaveLength(0);
  });

  it('la guarda de la base también niega (42501): 403', async () => {
    guion.errorRpc = { message: 'sin_permiso', code: '42501' };
    const r = await postImportarClases(jsonReq('http://x/api/membresias/importar/clases', { filas: [FILA_CLASE] }), params());
    expect(r.status).toBe(403);
  });
});

describe('otra organización', () => {
  it('reserva de otra organización (o de una sede sin acceso): 404 sin llamar la RPC', async () => {
    const r = await postEntrada(jsonReq('http://x/api/membresias/reservas/8/entrada', {}), params('8'));
    expect(r.status).toBe(404);
    expect((await r.json()).codigo).toBe('reserva_no_encontrada');
    expect(guion.lecturas[0]).toMatchObject({ tabla: 'class_reservations', filtros: { organization_id: ORG_SESION, id: 8 } });
    expect(guion.rpcs).toHaveLength(0);
  });

  it('id no numérico: 404 sin tocar la base', async () => {
    const r = await postEntrada(jsonReq('http://x/api/membresias/reservas/abc/entrada', {}), params('abc'));
    expect(r.status).toBe(404);
    expect(guion.lecturas).toHaveLength(0);
  });

  it('organization_id ajena en el body: 403 sin tocar la base', async () => {
    const rs = [
      await postEntrada(jsonReq('http://x/api/membresias/reservas/7/entrada', { organization_id: ORG_AJENA }), params('7')),
      await postImportarClases(jsonReq('http://x/api/membresias/importar/clases', { organization_id: ORG_AJENA, filas: [FILA_CLASE] }), params()),
      await postImportarReservas(jsonReq('http://x/api/membresias/importar/reservas', { organizationId: ORG_AJENA, filas: [FILA_RESERVA] }), params()),
    ];
    expect(rs.map((r) => r.status)).toEqual([403, 403, 403]);
    expect(guion.rpcs).toHaveLength(0);
  });

  it('organization_id ajena en la query: 403', async () => {
    const r = await postImportarReservas(jsonReq(`http://x/api/membresias/importar/reservas?organization_id=${ORG_AJENA}`, { filas: [FILA_RESERVA] }), params());
    expect(r.status).toBe(403);
    expect(guion.rpcs).toHaveLength(0);
  });
});

describe('camino válido: la organización es la de la sesión', () => {
  it('entrada: la RPC recibe la reserva, el miembro y la sede de la clase', async () => {
    const r = await postEntrada(jsonReq('http://x/api/membresias/reservas/7/entrada', {}), params('7'));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ permitido: true, repetida: false, reserva: { id: 7, estado: 'checked_in' } });
    expect(guion.rpcs[0]).toEqual({
      fn: 'fn_membresia_registrar_checkin',
      args: {
        p_organization_id: ORG_SESION,
        p_customer_id: '11111111-2222-4333-8444-555555555555',
        p_branch_id: 79,
        p_method: 'manual',
        p_membership_id: null,
        p_class_reservation_id: 7,
      },
    });
  });

  it('entrada rechazada por una regla de la reserva: 422 con su código', async () => {
    guion.errorRpc = { message: 'reserva_cancelada', code: '22023' };
    const r = await postEntrada(jsonReq('http://x/api/membresias/reservas/7/entrada', {}), params('7'));
    expect(r.status).toBe(422);
    expect((await r.json()).codigo).toBe('reserva_cancelada');
  });

  it('importar: vista previa (soloValidar) y la organización de la sesión', async () => {
    const r = await postImportarClases(jsonReq('http://x/api/membresias/importar/clases', { filas: [FILA_CLASE], soloValidar: true }), params());
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, validas: 1, conError: 0, soloValidar: true });
    expect(guion.rpcs[0]).toMatchObject({ fn: 'fn_membresias_importar_clases', args: { p_organization_id: ORG_SESION, p_solo_validar: true } });
    const r2 = await postImportarReservas(jsonReq('http://x/api/membresias/importar/reservas', { filas: [FILA_RESERVA] }), params());
    expect(r2.status).toBe(200);
    expect(guion.rpcs[1]).toMatchObject({ fn: 'fn_membresias_importar_reservas', args: { p_organization_id: ORG_SESION, p_solo_validar: false } });
  });
});

describe('validación del cuerpo', () => {
  it('sin filas, más de 500, campos desconocidos o método inválido: 400', async () => {
    const muchas = Array.from({ length: 501 }, (_, i) => ({ ...FILA_CLASE, fila: i + 2 }));
    const rs = [
      await postImportarClases(jsonReq('http://x/api/membresias/importar/clases', { filas: [] }), params()),
      await postImportarClases(jsonReq('http://x/api/membresias/importar/clases', { filas: muchas }), params()),
      await postImportarReservas(jsonReq('http://x/api/membresias/importar/reservas', { filas: [{ ...FILA_RESERVA, customer_id: 'x' }] }), params()),
      await postEntrada(jsonReq('http://x/api/membresias/reservas/7/entrada', { metodo: 'biometric' }), params('7')),
    ];
    expect(rs.map((r) => r.status)).toEqual([400, 400, 400, 400]);
    expect(guion.rpcs).toHaveLength(0);
  });
});
