// ============================================================
// /api/membresias/** — sesión, organización y permisos (reglas duras 5 y 6).
//
//   - sin sesión: 401 y no se toca el servicio;
//   - sin memberships.view (o el permiso de la acción): 403 «sin_permiso»;
//   - una membresía de OTRA organización: 404 (no se revela que existe);
//   - una organización ajena en la query o el body: 403 sin tocar la base;
//   - las acciones llegan al servicio con la organización de la SESIÓN.
// El servicio (`membresias.server`) se sustituye: aquí se prueba el cableado de las rutas. La guarda
// de la base (fn_membresias_int_exigir + RLS) se probó en seco con el MCP (docs/design/MEMBRESIAS-FASE-1-2.md §10).
// ============================================================

const ORG_SESION = 120;
const ORG_AJENA = 999;

const guion = {
  sesion: true,
  permisos: { ver: true, planes: false, congelar: true, cancelar: false, checkin: true, clases: false, dispositivos: false },
  llamadas: [] as Array<{ fn: string; org: number; args: unknown[] }>,
};

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
          const ctx = { userId: 'u-1', organizationId: ORG_SESION, roleId: 5, isSuperAdmin: false, supabase: {} };
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
  const registrar = (fn: string) => async (ctx: { organizationId: number }, ...args: unknown[]) => {
    guion.llamadas.push({ fn, org: ctx.organizationId, args });
    return { ok: true };
  };
  return {
    ErrorMembresiasServidor,
    exigir: async (_ctx: unknown, accion: keyof typeof guion.permisos) => {
      if (!guion.permisos[accion]) throw new ErrorMembresiasServidor('sin_permiso', 403);
      return guion.permisos;
    },
    permisosMembresias: async () => guion.permisos,
    listarMembresias: registrar('listarMembresias'),
    resumenMembresias: registrar('resumenMembresias'),
    listarMiembros: registrar('listarMiembros'),
    listarPlanes: registrar('listarPlanes'),
    listarPagos: registrar('listarPagos'),
    detallePlan: registrar('detallePlan'),
    // Solo la membresía 7 es de la organización de la sesión.
    detalleMembresia: async (ctx: { organizationId: number }, id: number) => {
      guion.llamadas.push({ fn: 'detalleMembresia', org: ctx.organizationId, args: [id] });
      if (id !== 7) throw new ErrorMembresiasServidor('membresia_no_encontrada', 404);
      return { membresia: { id } };
    },
    congelarMembresia: async (ctx: { organizationId: number }, id: number, datos: unknown) => {
      if (!guion.permisos.congelar) throw new ErrorMembresiasServidor('sin_permiso', 403);
      guion.llamadas.push({ fn: 'congelarMembresia', org: ctx.organizationId, args: [id, datos] });
      if (id !== 7) throw new ErrorMembresiasServidor('membresia_no_encontrada', 404);
      return { membership_id: id };
    },
    descongelarMembresia: registrar('descongelarMembresia'),
    cancelarMembresia: async (ctx: { organizationId: number }, id: number, motivo: string) => {
      if (!guion.permisos.cancelar) throw new ErrorMembresiasServidor('sin_permiso', 403);
      guion.llamadas.push({ fn: 'cancelarMembresia', org: ctx.organizationId, args: [id, motivo] });
      return { membership_id: id };
    },
    registrarEntrada: registrar('registrarEntrada'),
    buscarParaEntrada: registrar('buscarParaEntrada'),
  };
});

import { GET as getListado } from '@/app/api/membresias/membresias/route';
import { GET as getDetalle } from '@/app/api/membresias/membresias/[id]/route';
import { POST as postCongelar } from '@/app/api/membresias/membresias/[id]/congelar/route';
import { POST as postCancelar } from '@/app/api/membresias/membresias/[id]/cancelar/route';
import { GET as getResumen } from '@/app/api/membresias/resumen/route';
import { POST as postCheckin } from '@/app/api/membresias/checkin/route';

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

function jsonReq(url: string, body: unknown): Request {
  return new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

beforeEach(() => {
  guion.sesion = true;
  guion.permisos = { ver: true, planes: false, congelar: true, cancelar: false, checkin: true, clases: false, dispositivos: false };
  guion.llamadas = [];
});

describe('sesión', () => {
  it('sin sesión: 401 y el servicio no se llama', async () => {
    guion.sesion = false;
    const r = await getListado(new Request('http://x/api/membresias/membresias'), params(''));
    expect(r.status).toBe(401);
    expect(guion.llamadas).toHaveLength(0);
  });
});

describe('permisos resueltos en el servidor', () => {
  it('sin memberships.view: 403 sin_permiso en listado, detalle y resumen', async () => {
    guion.permisos.ver = false;
    for (const r of [
      await getListado(new Request('http://x/api/membresias/membresias'), params('')),
      await getDetalle(new Request('http://x/api/membresias/membresias/7'), params('7')),
      await getResumen(new Request('http://x/api/membresias/resumen'), params('')),
    ]) {
      expect(r.status).toBe(403);
      expect((await r.json()).codigo).toBe('sin_permiso');
    }
    expect(guion.llamadas).toHaveLength(0);
  });

  it('cancelar sin memberships.cancel: 403', async () => {
    const r = await postCancelar(jsonReq('http://x/api/membresias/membresias/7/cancelar', { motivo: 'Se muda' }), params('7'));
    expect(r.status).toBe(403);
    expect(guion.llamadas.find((l) => l.fn === 'cancelarMembresia')).toBeUndefined();
  });

  it('cancelar exige motivo (DialogoMotivo): 400 motivo_requerido', async () => {
    guion.permisos.cancelar = true;
    const r = await postCancelar(jsonReq('http://x/api/membresias/membresias/7/cancelar', { motivo: ' ' }), params('7'));
    expect(r.status).toBe(400);
    expect((await r.json()).codigo).toBe('motivo_requerido');
  });
});

describe('otra organización', () => {
  it('detalle de una membresía de otra organización: 404', async () => {
    const r = await getDetalle(new Request('http://x/api/membresias/membresias/8'), params('8'));
    expect(r.status).toBe(404);
    expect((await r.json()).codigo).toBe('membresia_no_encontrada');
  });

  it('congelar una membresía de otra organización: 404 (la acción usa la org de la sesión)', async () => {
    const r = await postCongelar(
      jsonReq('http://x/api/membresias/membresias/8/congelar', { desde: '2026-10-01', hasta: '2026-10-05' }),
      params('8'),
    );
    expect(r.status).toBe(404);
    expect(guion.llamadas.every((l) => l.org === ORG_SESION)).toBe(true);
  });

  it('organization_id ajena en la query: 403 sin tocar el servicio', async () => {
    const r = await getListado(new Request(`http://x/api/membresias/membresias?organization_id=${ORG_AJENA}`), params(''));
    expect(r.status).toBe(403);
    expect(guion.llamadas).toHaveLength(0);
  });

  it('organization_id ajena en el body del check-in: 403 sin registrar la entrada', async () => {
    const r = await postCheckin(
      jsonReq('http://x/api/membresias/checkin', {
        organization_id: ORG_AJENA,
        clienteId: '11111111-2222-4333-8444-555555555555',
        sucursalId: 79,
      }),
      params(''),
    );
    expect(r.status).toBe(403);
    expect(guion.llamadas.find((l) => l.fn === 'registrarEntrada')).toBeUndefined();
  });

  it('check-in válido: el servicio recibe la organización de la sesión', async () => {
    const r = await postCheckin(
      jsonReq('http://x/api/membresias/checkin', { clienteId: '11111111-2222-4333-8444-555555555555', sucursalId: 79, metodo: 'manual' }),
      params(''),
    );
    expect(r.status).toBe(200);
    expect(guion.llamadas.find((l) => l.fn === 'registrarEntrada')?.org).toBe(ORG_SESION);
  });
});

describe('validación de entrada', () => {
  it('id no numérico: 404 sin llamar al servicio', async () => {
    const r = await getDetalle(new Request('http://x/api/membresias/membresias/abc'), params('abc'));
    expect(r.status).toBe(404);
    expect(guion.llamadas).toHaveLength(0);
  });

  it('congelar con fechas mal formadas: 400', async () => {
    const r = await postCongelar(jsonReq('http://x/api/membresias/membresias/7/congelar', { desde: '1/10/2026', hasta: 'x' }), params('7'));
    expect(r.status).toBe(400);
  });

  it('check-in con método que la base rechaza: 400', async () => {
    const r = await postCheckin(
      jsonReq('http://x/api/membresias/checkin', { clienteId: '11111111-2222-4333-8444-555555555555', sucursalId: 79, metodo: 'biometric' }),
      params(''),
    );
    expect(r.status).toBe(400);
  });
});
