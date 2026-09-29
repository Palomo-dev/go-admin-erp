// ============================================================
// Fase 3 de membresías (§12): rutas nuevas — sesión, organización y permisos.
//
//   GET /api/membresias/exportar                    (CSV en el servidor)
//   GET /api/membresias/membresias/[id]/enlace-pago (¿se puede ofrecer el enlace de pago?)
//
//   - sin sesión: 401 y no se lee nada;
//   - sin memberships.view: 403 «sin_permiso» y no se lee nada;
//   - organización ajena en la query: 403 sin tocar la base;
//   - membresía de OTRA organización: 404 (no se revela);
//   - todo se lee con la organización de la SESIÓN.
// `exportar.server` y `enlacePago.server` corren de verdad; se sustituyen las lecturas de
// `membresias.server` y el cliente de Supabase (filtros `eq` aplicados sobre filas en memoria).
// ============================================================

const ORG_SESION = 120;
const ORG_AJENA = 999;

type Fila = Record<string, unknown>;

const guion = {
  sesion: true,
  ver: true,
  llamadas: [] as Array<{ fn: string; org: number; args: unknown[] }>,
  consultas: [] as Array<{ tabla: string; filtros: Array<[string, unknown]> }>,
  tablas: {} as Record<string, Fila[]>,
};

/** Supabase mínimo: from(t).select().eq().in()… → filas de `guion.tablas[t]` que cumplen los `eq`. */
function supabaseFalso() {
  return {
    from(tabla: string) {
      const filtros: Array<[string, unknown]> = [];
      guion.consultas.push({ tabla, filtros });
      const filas = () => (guion.tablas[tabla] ?? []).filter((f) => filtros.every(([c, v]) => f[c] === v));
      const b: Record<string, unknown> = {
        select: () => b,
        eq: (c: string, v: unknown) => {
          filtros.push([c, v]);
          return b;
        },
        in: () => b,
        maybeSingle: async () => ({ data: filas()[0] ?? null, error: null }),
        then: (ok: (r: { data: Fila[]; error: null }) => unknown) => Promise.resolve({ data: filas(), error: null }).then(ok),
      };
      return b;
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
          const ctx = { userId: 'u-1', organizationId: ORG_SESION, roleId: 5, isSuperAdmin: false, supabase: supabaseFalso() };
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
  const fila = (id: number) => ({
    id,
    estado: 'active',
    estadoVisual: 'activa',
    dias: 10,
    desde: '2026-09-01T15:00:00Z',
    hasta: '2026-10-01T04:59:59Z',
    graceUntil: null,
    codigo: `MEM-${id}`,
    origen: 'pos',
    cliente: { id: 'c', nombre: 'Miembro', documento: '1', email: null, telefono: null, avatarUrl: null },
    plan: { id: 2, nombre: 'Mensual', productId: 1 },
    saleId: null,
    invoiceId: null,
    branchId: null,
  });
  return {
    ErrorMembresiasServidor,
    exigir: async (_ctx: unknown, accion: string) => {
      if (accion !== 'ver' || !guion.ver) throw new ErrorMembresiasServidor('sin_permiso', 403);
      return {};
    },
    zonaDe: async () => 'America/Bogota',
    // 130 membresías: la exportación recorre 2 páginas de 100.
    listarMembresias: async (ctx: { organizationId: number }, filtros: { pagina: number; porPagina: number }) => {
      guion.llamadas.push({ fn: 'listarMembresias', org: ctx.organizationId, args: [filtros] });
      const desde = (filtros.pagina - 1) * filtros.porPagina;
      const ids = Array.from({ length: Math.max(0, Math.min(filtros.porPagina, 130 - desde)) }, (_, i) => desde + i + 1);
      return { filas: ids.map(fila), total: 130 };
    },
    listarMiembros: async (ctx: { organizationId: number }, filtros: unknown) => {
      guion.llamadas.push({ fn: 'listarMiembros', org: ctx.organizationId, args: [filtros] });
      return { filas: [], total: 0 };
    },
    listarPagos: async (ctx: { organizationId: number }, filtros: unknown) => {
      guion.llamadas.push({ fn: 'listarPagos', org: ctx.organizationId, args: [filtros] });
      return { filas: [], total: 0 };
    },
  };
});

jest.mock('@/lib/services/monedaOrganizacion', () => ({
  resolveOrgCurrency: async () => ({ code: 'COP' }),
}));

import { GET as getExportar } from '@/app/api/membresias/exportar/route';
import { GET as getEnlace } from '@/app/api/membresias/membresias/[id]/enlace-pago/route';

function params(id = '') {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  guion.sesion = true;
  guion.ver = true;
  guion.llamadas = [];
  guion.consultas = [];
  guion.tablas = {
    memberships: [
      { id: 7, organization_id: ORG_SESION, status: 'active' },
      { id: 8, organization_id: ORG_AJENA, status: 'active' },
    ],
    integration_connections: [
      { id: 'a', organization_id: ORG_AJENA, status: 'connected', integration_connectors: { code: 'stripe_payments' } },
    ],
  };
});

describe('GET /api/membresias/exportar', () => {
  it('sin sesión: 401 y no se lee nada', async () => {
    guion.sesion = false;
    const r = await getExportar(new Request('http://x/api/membresias/exportar?tipo=membresias'), params());
    expect(r.status).toBe(401);
    expect(guion.llamadas).toHaveLength(0);
  });

  it('sin memberships.view: 403 sin_permiso y no se lee nada', async () => {
    guion.ver = false;
    const r = await getExportar(new Request('http://x/api/membresias/exportar?tipo=pagos'), params());
    expect(r.status).toBe(403);
    expect((await r.json()).codigo).toBe('sin_permiso');
    expect(guion.llamadas).toHaveLength(0);
  });

  it('organization_id ajena en la query: 403 sin tocar la base', async () => {
    const r = await getExportar(new Request(`http://x/api/membresias/exportar?tipo=membresias&organization_id=${ORG_AJENA}`), params());
    expect(r.status).toBe(403);
    expect(guion.llamadas).toHaveLength(0);
  });

  it('tipo desconocido: 400', async () => {
    const r = await getExportar(new Request('http://x/api/membresias/exportar?tipo=clientes'), params());
    expect(r.status).toBe(400);
  });

  it('CSV con los filtros de la pantalla, todas las páginas y la organización de la sesión', async () => {
    const r = await getExportar(
      new Request('http://x/api/membresias/exportar?tipo=membresias&idioma=en&q=ana&estado=renovacion_pendiente&plan=2&cliente=nope'),
      params(),
    );
    expect(r.status).toBe(200);
    expect(r.headers.get('Content-Type')).toContain('text/csv');
    expect(r.headers.get('Content-Disposition')).toMatch(/attachment; filename="memberships_\d{4}-\d{2}-\d{2}\.csv"/);
    expect(r.headers.get('X-Exportacion-Filas')).toBe('130');
    expect(r.headers.get('Cache-Control')).toContain('no-store');
    const texto = await r.text();
    expect(texto.slice(1).split('\r\n')).toHaveLength(131); // encabezado + 130
    expect(texto).toContain('Member;ID number;Plan');
    const llamadas = guion.llamadas.filter((l) => l.fn === 'listarMembresias');
    expect(llamadas).toHaveLength(2);
    expect(llamadas.every((l) => l.org === ORG_SESION)).toBe(true);
    expect(llamadas[0].args[0]).toMatchObject({ q: 'ana', estado: 'renovacion_pendiente', planId: 2, clienteId: undefined, soloFilas: true });
  });

  it('pagos: el rango de días se valida (formato inválido se ignora)', async () => {
    await getExportar(new Request('http://x/api/membresias/exportar?tipo=pagos&desde=2026-09-01&hasta=ayer'), params());
    expect(guion.llamadas[0].args[0]).toMatchObject({ desde: '2026-09-01', hasta: undefined, soloFilas: true });
  });
});

describe('GET /api/membresias/membresias/[id]/enlace-pago', () => {
  it('sin sesión: 401', async () => {
    guion.sesion = false;
    const r = await getEnlace(new Request('http://x/api/membresias/membresias/7/enlace-pago'), params('7'));
    expect(r.status).toBe(401);
    expect(guion.consultas).toHaveLength(0);
  });

  it('sin memberships.view: 403 sin leer la membresía', async () => {
    guion.ver = false;
    const r = await getEnlace(new Request('http://x/api/membresias/membresias/7/enlace-pago'), params('7'));
    expect(r.status).toBe(403);
    expect(guion.consultas).toHaveLength(0);
  });

  it('membresía de otra organización: 404 (no se revela) y sin leer pasarelas', async () => {
    const r = await getEnlace(new Request('http://x/api/membresias/membresias/8/enlace-pago'), params('8'));
    expect(r.status).toBe(404);
    expect((await r.json()).codigo).toBe('membresia_no_encontrada');
    expect(guion.consultas.map((c) => c.tabla)).toEqual(['memberships']);
    expect(guion.consultas[0].filtros).toContainEqual(['organization_id', ORG_SESION]);
  });

  it('id no numérico: 404 sin leer nada', async () => {
    const r = await getEnlace(new Request('http://x/api/membresias/membresias/abc/enlace-pago'), params('abc'));
    expect(r.status).toBe(404);
    expect(guion.consultas).toHaveLength(0);
  });

  it('la pasarela de OTRA organización no cuenta: sin_pasarela', async () => {
    const r = await getEnlace(new Request('http://x/api/membresias/membresias/7/enlace-pago'), params('7'));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ disponible: false, motivo: 'sin_pasarela', pasarelas: [] });
    const conexiones = guion.consultas.find((c) => c.tabla === 'integration_connections');
    expect(conexiones?.filtros).toContainEqual(['organization_id', ORG_SESION]);
  });

  it('con pasarela propia conectada: sigue deshabilitado porque su cobro no activa la membresía', async () => {
    guion.tablas.integration_connections.push({
      id: 'b',
      organization_id: ORG_SESION,
      status: 'connected',
      integration_connectors: { code: 'wompi_co' },
    });
    const r = await getEnlace(new Request('http://x/api/membresias/membresias/7/enlace-pago'), params('7'));
    expect(await r.json()).toEqual({ disponible: false, motivo: 'pago_no_activa_membresia', pasarelas: ['wompi_co'] });
  });
});
