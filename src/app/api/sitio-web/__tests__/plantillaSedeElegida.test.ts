/**
 * POST /api/sitio-web/sedes/<id>/plantilla con una plantilla ELEGIDA y GET
 * /api/sitio-web/plantillas/sedes (Figma «16 Sitio web» › «Plantillas por sede»).
 *
 * - La organización es la de la sesión (org 120 ficticia); una sucursal de otra organización → 403
 *   sin escribir nada. Una organización distinta en el body → 403 (puerta `withOrg`).
 * - `{ modo: 'plantilla', alcance: 'completa' }` pasa por `aplicarPlantillaCompleta` (instantánea +
 *   compare-and-swap) con el armado de sede: estilo propio de Velvet Lounge.
 * - `alcance: 'estilo'` y `modo: 'heredar_estilo'` pasan por `aplicarAlBorrador`.
 * - La plantilla se valida contra el catálogo y el giro antes de escribir.
 * - Sin plantilla elegida (`confirmado`) todo sigue como hoy: la RPC con la plantilla por defecto.
 */
import { validarDocumentoSitio, type DocumentoSitio } from '@/lib/website/contrato/documentoSitio';
import { plantillaPorId } from '@/lib/website/contrato/catalogoPlantillas';
import { CATALOGO_PLANTILLAS } from '@/lib/website/v2/plantillaCompleta';
import { documentoPlantillaSede } from '@/lib/website/v2/plantillaSede';

const ORG = 120;
const SEDE = 531;
const SEDE_AJENA = 999;

let n = 0;
const generar = () => `id-${++n}`;

function principal(): DocumentoSitio {
  const r = validarDocumentoSitio({
    schemaVersion: 1,
    identidad: { nombre: { mode: 'value', value: 'Hotel de prueba' } },
    tema: { colores: { primario: { mode: 'value', value: '#4A5568' } }, tipografia: {} },
    seo: {},
    contenido: {},
    shell: { header: { composicion: 'default', menuPrincipalId: null, menuMegaId: null, opciones: {} }, footer: { composicion: 'default', menuIds: [], opciones: {} } },
    menus: [],
    paginas: [{ id: 'p-home', slug: 'home', tipo: 'builtin', titulo: 'Inicio', publicada: true, secciones: [] }],
  });
  if (!r.ok) throw new Error('principal');
  return r.documento;
}
const BORRADOR_SEDE = documentoPlantillaSede(principal(), 'restaurant', generar) as DocumentoSitio;

// ── Supabase de la sesión ─────────────────────────────────────────────────────────────────────
const tablas: string[] = [];
function consulta(tabla: string) {
  const filtros: Record<string, unknown> = {};
  const q: Record<string, unknown> = {};
  const encadenar = () => q;
  for (const m of ['select', 'not', 'order', 'limit']) q[m] = jest.fn(encadenar);
  q.eq = jest.fn((c: string, v: unknown) => {
    filtros[c] = v;
    return q;
  });
  q.in = jest.fn((c: string, v: unknown) => {
    filtros[c] = v;
    return q;
  });
  const datos = (): unknown => {
    if (tabla === 'branches') {
      const sucursales = [{ id: SEDE, name: 'Sede restaurante', branch_type: 'restaurant', organization_id: ORG }];
      const deOrg = sucursales.filter((b) => b.organization_id === filtros.organization_id);
      if (Array.isArray(filtros.id)) return deOrg.filter((b) => (filtros.id as number[]).includes(b.id));
      return deOrg.find((b) => b.id === filtros.id) ?? null;
    }
    if (tabla === 'website_site_states') {
      const fila = { id: 's-531', branch_id: SEDE, published_revision_id: null, plantilla_tipo: 'restaurant', plantilla_version_borrador: 4 };
      return 'branch_id' in filtros ? fila : [fila];
    }
    if (tabla === 'website_site_drafts') {
      const tema = aplicado ? aplicado.tema : BORRADOR_SEDE.tema;
      return 'site_state_id' in filtros && typeof filtros.site_state_id === 'string' ? { version: 4 } : [{ site_state_id: 's-531', version: 4, tema }];
    }
    return null;
  };
  q.maybeSingle = jest.fn(async () => ({ data: datos(), error: null }));
  q.then = (r: (v: unknown) => unknown) => r({ data: datos(), error: null });
  return q;
}
const rpc = jest.fn();
const supabase = {
  rpc: (...a: unknown[]) => rpc(...a),
  from: jest.fn((tabla: string) => {
    tablas.push(tabla);
    return consulta(tabla);
  }),
};
let aplicado: DocumentoSitio | null = null;

jest.mock('@/lib/utils/orgContext', () => {
  const { OrgContextError: Err } = jest.requireActual('@/lib/utils/orgContextError');
  return {
    OrgContextError: Err,
    ORG_BODY_KEYS: ['organization_id', 'organizationId'],
    withOrg:
      (handler: (ctx: unknown, req: Request, p?: unknown) => Promise<Response>) =>
      async (req: Request, p?: unknown) => {
        try {
          return await handler({ organizationId: 120, userId: 'u-1', supabase }, req, p);
        } catch (e) {
          if (e instanceof Err) return new Response(JSON.stringify({ code: 'org' }), { status: (e as { statusCode: number }).statusCode });
          throw e;
        }
      },
    readOrgBody: async (ctx: { organizationId: number }, req: Request) => {
      if (req.method === 'GET') return null;
      const body = await req.json();
      if (body.organization_id && Number(body.organization_id) !== ctx.organizationId) throw new Err('Organización distinta', 403);
      return body;
    },
  };
});

// Escrituras del módulo: se comprueba que se llaman y con qué; su lógica tiene sus propias pruebas.
const aplicarPlantillaCompleta = jest.fn();
jest.mock('@/lib/services/website/plantillaCompletaService', () => ({
  aplicarPlantillaCompleta: (...a: unknown[]) => aplicarPlantillaCompleta(...a),
}));
const aplicarAlBorrador = jest.fn();
jest.mock('@/lib/services/website/paginasSitioService', () => ({
  aplicarAlBorrador: (...a: unknown[]) => aplicarAlBorrador(...a),
}));
const rpcPlantillaSede = jest.fn();
const documentoPlantillaDeSede = jest.fn();
jest.mock('@/lib/services/website/siteDocumentService', () => {
  const real = jest.requireActual('@/lib/services/website/siteDocumentService');
  return {
    ...real,
    rpcPlantillaSede: (...a: unknown[]) => rpcPlantillaSede(...a),
    documentoPlantillaDeSede: (...a: unknown[]) => documentoPlantillaDeSede(...a),
    crearSitio: jest.fn(),
  };
});

import { POST } from '../sedes/[branchId]/plantilla/route';
import { GET as GET_SEDES } from '../plantillas/sedes/route';

type Operar = (d: DocumentoSitio) => { ok: true; documento: DocumentoSitio };

function pedir(branchId: number, body: Record<string, unknown>) {
  const req = new Request(`http://localhost/api/sitio-web/sedes/${branchId}/plantilla`, { method: 'POST', body: JSON.stringify(body) });
  return POST(req as never, { params: Promise.resolve({ branchId: String(branchId) }) } as never);
}

beforeEach(() => {
  tablas.length = 0;
  aplicado = null;
  rpc.mockReset();
  aplicarPlantillaCompleta.mockReset();
  aplicarAlBorrador.mockReset();
  rpcPlantillaSede.mockReset();
  documentoPlantillaDeSede.mockReset();
  aplicarAlBorrador.mockImplementation(async (_ctx: unknown, _b: number, _v: number, operar: Operar) => {
    aplicado = operar(BORRADOR_SEDE).documento;
    return { sitioId: 's-531', version: 5, actualizadoEn: '2026-10-08T00:00:00Z' };
  });
});

describe('la sede debe ser de la organización de la sesión', () => {
  test('sede de otra organización → 403 y nada se escribe', async () => {
    for (const body of [
      { modo: 'plantilla', plantillaId: 'velvet_lounge', alcance: 'completa', version: 4 },
      { modo: 'plantilla', plantillaId: 'velvet_lounge', alcance: 'estilo', version: 4 },
      { modo: 'heredar_estilo', version: 4 },
    ]) {
      const r = await pedir(SEDE_AJENA, body);
      expect(r.status).toBe(403);
      expect((await r.json()).error.code).toBe('sin_permiso');
    }
    expect(aplicarPlantillaCompleta).not.toHaveBeenCalled();
    expect(aplicarAlBorrador).not.toHaveBeenCalled();
  });

  test('una organización distinta en el body → 403 de la puerta', async () => {
    const r = await pedir(SEDE, { modo: 'plantilla', plantillaId: 'velvet_lounge', alcance: 'estilo', version: 4, organization_id: 7 });
    expect(r.status).toBe(403);
    expect(aplicarAlBorrador).not.toHaveBeenCalled();
  });
});

describe('plantilla concreta en la sede', () => {
  test('«Plantilla completa» de Velvet Lounge: instantánea y CAS, con estilo propio de la sede', async () => {
    aplicarPlantillaCompleta.mockResolvedValue({
      sitioId: 's-531',
      version: 5,
      actualizadoEn: '2026-10-08T00:00:00Z',
      instantaneaId: 'inst-1',
      resumen: { paginas: 10, secciones: 40, ocultas: [], conservadas: 2 },
    });
    const r = await pedir(SEDE, { modo: 'plantilla', plantillaId: 'velvet_lounge', alcance: 'completa', version: 4 });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ accion: 'completa', branchId: SEDE, plantillaId: 'velvet_lounge', instantaneaId: 'inst-1', version: 5 });
    const [ctx, branchId, version, plantillaId, , armar] = aplicarPlantillaCompleta.mock.calls[0];
    expect((ctx as { organizationId: number }).organizationId).toBe(ORG);
    expect([branchId, version, plantillaId]).toEqual([SEDE, 4, 'velvet_lounge']);
    // El armado de sede: la plantilla completa con su estilo como propio.
    const velvet = plantillaPorId(CATALOGO_PLANTILLAS, 'velvet_lounge')!;
    const armado = (armar as (b: DocumentoSitio, p: typeof velvet, d: unknown, o: { generarId: () => string; extendidos: boolean }) => { documento: DocumentoSitio })(
      BORRADOR_SEDE,
      velvet,
      undefined,
      { generarId: generar, extendidos: false },
    ).documento;
    expect(armado.tema.colores.primario).toEqual({ mode: 'value', value: velvet.estilo.acento });
    expect(validarDocumentoSitio(armado).ok).toBe(true);
    expect(rpcPlantillaSede).not.toHaveBeenCalled();
  });

  test('«Solo estilo»: colores y letras propios, el contenido no cambia', async () => {
    const r = await pedir(SEDE, { modo: 'plantilla', plantillaId: 'velvet_lounge', alcance: 'estilo', version: 4 });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ accion: 'estilo', plantillaId: 'velvet_lounge', version: 5 });
    expect(aplicarAlBorrador.mock.calls[0].slice(1, 3)).toEqual([SEDE, 4]);
    expect(aplicado!.tema.tipografia.titulos).toEqual({ mode: 'value', value: 'Playfair Display' });
    expect(aplicado!.paginas).toEqual(BORRADOR_SEDE.paginas);
    expect(aplicarPlantillaCompleta).not.toHaveBeenCalled();
  });

  test('«Volver a heredar»: el tema vuelve a inherit', async () => {
    const r = await pedir(SEDE, { modo: 'heredar_estilo', version: 4 });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ accion: 'heredar', plantillaId: null });
    expect(aplicado!.tema.colores.primario).toEqual({ mode: 'inherit' });
  });

  test('validación: plantilla inexistente, completa de otro giro, cuerpo mal formado → 400 sin escribir', async () => {
    const otra = await pedir(SEDE, { modo: 'plantilla', plantillaId: 'hotel_luxury', alcance: 'completa', version: 4 });
    expect(otra.status).toBe(400);
    expect((await otra.json()).error.details).toEqual({ codigo: 'plantilla_otro_giro' });
    const noExiste = await pedir(SEDE, { modo: 'plantilla', plantillaId: 'no_existe', alcance: 'estilo', version: 4 });
    expect((await noExiste.json()).error.details).toEqual({ codigo: 'plantilla_no_existe' });
    expect((await pedir(SEDE, { modo: 'plantilla', plantillaId: 'velvet_lounge', alcance: 'todo' })).status).toBe(400);
    expect((await pedir(SEDE, { modo: 'plantilla', plantillaId: 'Velvet Lounge', alcance: 'estilo' })).status).toBe(400);
    expect(aplicarPlantillaCompleta).not.toHaveBeenCalled();
    expect(aplicarAlBorrador).not.toHaveBeenCalled();
  });

  test('el estilo de otro giro sí se puede usar como «Solo estilo»', async () => {
    const r = await pedir(SEDE, { modo: 'plantilla', plantillaId: 'hotel_luxury', alcance: 'estilo', version: 4 });
    expect(r.status).toBe(200);
    expect(aplicado!.tema.plantillaBase).toEqual({ mode: 'value', value: 'hotel_luxury' });
  });
});

describe('la sede sin plantilla elegida se comporta como hoy', () => {
  test('`confirmado` usa la RPC con la plantilla por defecto del giro', async () => {
    documentoPlantillaDeSede.mockResolvedValue(BORRADOR_SEDE);
    rpcPlantillaSede.mockResolvedValue({ accion: 'reemplazado', branchId: SEDE, tipo: 'restaurant', sitioId: 's-531', version: 5 });
    const r = await pedir(SEDE, { modo: 'confirmado', version: 4 });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ accion: 'reemplazado' });
    expect(rpcPlantillaSede.mock.calls[0].slice(1, 7)).toEqual([ORG, SEDE, 'restaurant', BORRADOR_SEDE, 'confirmado', 4]);
    expect(aplicarPlantillaCompleta).not.toHaveBeenCalled();
    expect(aplicarAlBorrador).not.toHaveBeenCalled();
  });
});

describe('GET /api/sitio-web/plantillas/sedes', () => {
  test('sedes con sitio: giro de la pestaña, herencia y plantilla en uso', async () => {
    const r = await GET_SEDES(new Request('http://localhost/api/sitio-web/plantillas/sedes') as never, undefined as never);
    expect(r.status).toBe(200);
    expect((await r.json()).sedes).toEqual([
      { branchId: SEDE, nombre: 'Sede restaurante', tipo: 'restaurant', giro: 'restaurante', sitioId: 's-531', version: 4, estiloPropio: false, plantillaEnUsoId: null },
    ]);
  });

  test('con estilo propio de Velvet Lounge la marca dice cuál', async () => {
    await pedir(SEDE, { modo: 'plantilla', plantillaId: 'velvet_lounge', alcance: 'estilo', version: 4 });
    const r = await GET_SEDES(new Request('http://localhost/api/sitio-web/plantillas/sedes') as never, undefined as never);
    expect((await r.json()).sedes[0]).toMatchObject({ estiloPropio: true, plantillaEnUsoId: 'velvet_lounge' });
  });
});
