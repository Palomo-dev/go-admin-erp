/**
 * siteDocumentService con un cliente de Supabase en memoria. Comprueba que:
 * - todas las consultas filtran por la organización recibida (sitio de otra org → 404);
 * - el guardado es compare-and-swap (versión vieja → conflicto_version, nunca pisa);
 * - el documento se valida con el contrato antes de escribir y de publicar (422);
 * - crear importa legacy (principal) o hereda (sede) y llama a ensure_site_draft;
 * - restaurar copia la revisión al borrador y nunca la edita;
 * - los SQLSTATE de las RPC se traducen a códigos de la API.
 * Organizaciones ficticias 120 y 999. No se toca la base.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { VERSION_ESQUEMA_DOCUMENTO, type DocumentoSitio } from '@/lib/website/contrato/documentoSitio';
import {
  ErrorSitio,
  cambiarAdopcion,
  crearSitio,
  errorDesdePostgrest,
  guardarBorrador,
  listarRevisiones,
  llevarMenuAlBorrador,
  obtenerBorrador,
  publicar,
  restaurar,
} from '../siteDocumentService';

type Fila = Record<string, unknown>;
type Tablas = Record<string, Fila[]>;

const SITIO = '11111111-1111-4111-8111-111111111111';
const SITIO_AJENO = '22222222-2222-4222-8222-222222222222';
const SEDE = '33333333-3333-4333-8333-333333333333';
const REV = '44444444-4444-4444-8444-444444444444';
const MENU = '55555555-5555-4555-8555-555555555555';
const MENU_COPIA = '66666666-6666-4666-8666-666666666666';
const PAGINA = '77777777-7777-4777-8777-777777777777';

function documento(titulo = 'Inicio'): DocumentoSitio {
  return {
    schemaVersion: VERSION_ESQUEMA_DOCUMENTO,
    identidad: {},
    tema: { colores: { primario: { mode: 'value', value: '#123456' } }, tipografia: {} },
    seo: {},
    contenido: {},
    shell: {
      header: { composicion: 'default', menuPrincipalId: MENU, opciones: {} },
      footer: { composicion: 'default', menuIds: [], opciones: {} },
    },
    menus: [{ id: MENU, nombre: 'Principal', items: [] }],
    paginas: [{ id: PAGINA, slug: 'home', tipo: 'home', titulo, publicada: true, secciones: [] }],
  };
}

/** Cliente fake: filtros eq/is/in, update con filtros (CAS) y RPC configurables. */
function clienteFake(tablas: Tablas, rpc: (fn: string, args: Fila) => { data?: unknown; error?: Fila | null } = () => ({ data: null })) {
  const llamadas: { tabla: string; op: string; filtros: [string, string, unknown][]; valores?: Fila }[] = [];
  const rpcs: { fn: string; args: Fila }[] = [];

  const consulta = (tabla: string) => {
    const filtros: [string, string, unknown][] = [];
    let op = 'select';
    let valores: Fila | undefined;
    let limite: number | null = null;
    const coincide = (f: Fila) =>
      filtros.every(([tipo, col, v]) =>
        tipo === 'eq' ? f[col] === v : tipo === 'is' ? (f[col] ?? null) === v : (v as unknown[]).includes(f[col]),
      );
    const ejecutar = () => {
      llamadas.push({ tabla, op, filtros: [...filtros], valores });
      const filas = (tablas[tabla] ?? []).filter(coincide);
      if (op === 'update') {
        filas.forEach((f) => Object.assign(f, valores, { updated_at: '2026-10-05T12:00:00Z' }));
      }
      return limite === null ? filas : filas.slice(0, limite);
    };
    const api = {
      select: () => api,
      update: (v: Fila) => {
        op = 'update';
        valores = v;
        return api;
      },
      eq: (c: string, v: unknown) => (filtros.push(['eq', c, v]), api),
      is: (c: string, v: unknown) => (filtros.push(['is', c, v]), api),
      in: (c: string, v: unknown[]) => (filtros.push(['in', c, v]), api),
      order: () => api,
      limit: (n: number) => ((limite = n), api),
      maybeSingle: async () => ({ data: ejecutar()[0] ?? null, error: null }),
      then: (ok: (r: { data: Fila[]; error: null }) => void) => ok({ data: ejecutar(), error: null }),
    };
    return api;
  };

  const cliente = {
    from: (tabla: string) => consulta(tabla),
    rpc: async (fn: string, args: Fila) => {
      rpcs.push({ fn, args });
      const r = rpc(fn, args);
      return { data: r.data ?? null, error: r.error ?? null };
    },
  } as unknown as SupabaseClient;
  return { cliente, llamadas, rpcs };
}

function tablasBase(): Tablas {
  return {
    website_site_states: [
      { id: SITIO, organization_id: 120, branch_id: null, v2_adopted: false, v2_adopted_at: null, published_revision_id: REV },
      { id: SITIO_AJENO, organization_id: 999, branch_id: null, v2_adopted: false, v2_adopted_at: null, published_revision_id: null },
    ],
    website_site_drafts: [
      { site_state_id: SITIO, organization_id: 120, version: 3, updated_at: '2026-10-05T10:00:00Z', document: documento(), base_revision_id: REV },
      { site_state_id: SITIO_AJENO, organization_id: 999, version: 1, updated_at: '2026-10-05T10:00:00Z', document: documento('Ajeno') },
    ],
    website_site_revisions: [
      { id: REV, site_state_id: SITIO, organization_id: 120, revision_number: 1, note: 'Primera', published_by: null, published_at: '2026-10-01T10:00:00Z', source_draft_version: 2, document: documento('Publicada') },
    ],
    branches: [{ id: 7, organization_id: 120 }, { id: 8, organization_id: 999 }],
    website_settings: [{ organization_id: 120, branch_id: null, primary_color: '#abcdef', header_style: 'default', header_menu_id: MENU }],
    website_pages: [
      { id: PAGINA, organization_id: 120, branch_id: null, slug: 'home', title: 'Inicio', page_type: 'home', is_published: true, show_in_header: true, show_in_footer: false, header_order: 0, footer_order: 0, parent_page_id: null, meta_title: null, meta_description: null, og_image_url: null },
    ],
    website_page_sections: [],
    website_menus: [
      { id: MENU, organization_id: 120, branch_id: null, name: 'Principal', location: 'header', footer_column: null, footer_order: 0, header_order: 0, is_active: true },
      { id: MENU_COPIA, organization_id: 120, branch_id: 7, name: 'Principal', location: 'header', footer_column: null, footer_order: 0, header_order: 0, is_active: true },
    ],
    website_menu_items: [
      { id: '88888888-8888-4888-8888-888888888888', organization_id: 120, menu_id: MENU_COPIA, item_type: 'page', page_id: PAGINA, category_id: null, custom_label: 'Inicio sede', custom_url: null, parent_item_id: null, display_order: 0, is_active: true },
    ],
    profiles: [],
  };
}

async function codigoDe(promesa: Promise<unknown>): Promise<string> {
  try {
    await promesa;
    return 'sin_error';
  } catch (e) {
    return e instanceof ErrorSitio ? e.code : `otro:${String(e)}`;
  }
}

describe('aislamiento por organización', () => {
  test('un sitio de otra organización es 404 en todas las operaciones y no se escribe nada', async () => {
    const t = tablasBase();
    const { cliente, rpcs } = clienteFake(t);
    expect(await codigoDe(obtenerBorrador(cliente, 120, SITIO_AJENO))).toBe('sitio_no_encontrado');
    expect(await codigoDe(guardarBorrador(cliente, 120, SITIO_AJENO, documento('X'), 1))).toBe('sitio_no_encontrado');
    expect(await codigoDe(publicar(cliente, 120, SITIO_AJENO, 1, null))).toBe('sitio_no_encontrado');
    expect(await codigoDe(cambiarAdopcion(cliente, 120, SITIO_AJENO, true))).toBe('sitio_no_encontrado');
    expect(await codigoDe(restaurar(cliente, 120, SITIO_AJENO, REV, 1))).toBe('sitio_no_encontrado');
    expect(rpcs).toHaveLength(0);
    expect((t.website_site_drafts[1].document as DocumentoSitio).paginas[0].titulo).toBe('Ajeno');
  });

  test('toda consulta lleva el filtro de la organización de la sesión', async () => {
    const { cliente, llamadas } = clienteFake(tablasBase());
    await obtenerBorrador(cliente, 120, SITIO);
    await listarRevisiones(cliente, 120, SITIO);
    const sinOrg = llamadas.filter(
      (l) => l.tabla !== 'profiles' && !l.filtros.some(([tipo, col, v]) => tipo === 'eq' && col === 'organization_id' && v === 120),
    );
    expect(sinOrg).toEqual([]);
  });
});

describe('guardarBorrador', () => {
  test('compare-and-swap: sube la versión en uno', async () => {
    const t = tablasBase();
    const { cliente } = clienteFake(t);
    const r = await guardarBorrador(cliente, 120, SITIO, documento('Nuevo'), 3);
    expect(r.version).toBe(4);
    expect((t.website_site_drafts[0].document as DocumentoSitio).paginas[0].titulo).toBe('Nuevo');
  });

  test('versión vieja → conflicto_version con la versión actual, sin escribir', async () => {
    const t = tablasBase();
    const { cliente } = clienteFake(t);
    try {
      await guardarBorrador(cliente, 120, SITIO, documento('Pisaría'), 2);
      throw new Error('debía fallar');
    } catch (e) {
      expect(e).toBeInstanceOf(ErrorSitio);
      expect((e as ErrorSitio).code).toBe('conflicto_version');
      expect((e as ErrorSitio).details).toEqual({ esperada: 2, actual: 3 });
    }
    expect((t.website_site_drafts[0].document as DocumentoSitio).paginas[0].titulo).toBe('Inicio');
  });

  test('documento que no cumple el contrato → documento_invalido, sin consultar', async () => {
    const { cliente, llamadas } = clienteFake(tablasBase());
    const malo = { ...documento(), tema: { colores: { primario: { mode: 'value', value: 'rojo' } } } };
    expect(await codigoDe(guardarBorrador(cliente, 120, SITIO, malo, 3))).toBe('documento_invalido');
    expect(llamadas).toHaveLength(0);
  });
});

describe('publicar', () => {
  test('llama a publish_site_revision con la versión esperada y la nota', async () => {
    const { cliente, rpcs } = clienteFake(tablasBase(), () => ({
      data: { revision_id: REV, revision_number: 2, published_at: '2026-10-05T12:00:00Z', idempotente: false },
    }));
    const r = await publicar(cliente, 120, SITIO, 3, 'Carta de temporada');
    expect(rpcs).toEqual([{ fn: 'publish_site_revision', args: { p_site: SITIO, p_expected_version: 3, p_note: 'Carta de temporada' } }]);
    expect(r).toEqual({ revisionId: REV, numero: 2, publicadaEn: '2026-10-05T12:00:00Z', idempotente: false, sedesActualizadas: 0 });
  });

  test('versión distinta a la del borrador → conflicto antes de llamar a la RPC', async () => {
    const { cliente, rpcs } = clienteFake(tablasBase());
    expect(await codigoDe(publicar(cliente, 120, SITIO, 2, null))).toBe('conflicto_version');
    expect(rpcs).toHaveLength(0);
  });

  test('borrador inválido en la base → 422 y no se publica', async () => {
    const t = tablasBase();
    t.website_site_drafts[0].document = { schemaVersion: 1 };
    const { cliente, rpcs } = clienteFake(t);
    expect(await codigoDe(publicar(cliente, 120, SITIO, 3, null))).toBe('documento_invalido');
    expect(rpcs).toHaveLength(0);
  });

  test('sin permiso en la RPC (42501) → sin_permiso', async () => {
    const { cliente } = clienteFake(tablasBase(), () => ({ error: { code: '42501', message: 'sin_permiso' } }));
    expect(await codigoDe(publicar(cliente, 120, SITIO, 3, null))).toBe('sin_permiso');
  });
});

describe('restaurar', () => {
  test('copia la revisión al borrador como versión nueva; la revisión no cambia', async () => {
    const t = tablasBase();
    const { cliente, llamadas } = clienteFake(t);
    const r = await restaurar(cliente, 120, SITIO, REV, 3);
    expect(r.version).toBe(4);
    expect((t.website_site_drafts[0].document as DocumentoSitio).paginas[0].titulo).toBe('Publicada');
    expect(llamadas.filter((l) => l.op === 'update').map((l) => l.tabla)).toEqual(['website_site_drafts']);
  });

  test('revisión de otro sitio → revision_no_encontrada', async () => {
    const { cliente } = clienteFake(tablasBase());
    expect(await codigoDe(restaurar(cliente, 120, SITIO, '99999999-9999-4999-8999-999999999999', 3))).toBe('revision_no_encontrada');
  });
});

describe('crearSitio', () => {
  test('principal ya existente → idempotente, sin RPC', async () => {
    const { cliente, rpcs } = clienteFake(tablasBase());
    const r = await crearSitio(cliente, 120, null);
    expect(r.creado).toBe(false);
    expect(rpcs).toHaveLength(0);
  });

  test('principal nuevo: importa legacy y llama a ensure_site_draft con la organización de la sesión', async () => {
    const t = tablasBase();
    t.website_site_states = [];
    t.website_site_drafts = [];
    const { cliente, rpcs } = clienteFake(t, (fn, args) => {
      t.website_site_states.push({ id: SITIO, organization_id: args.p_org, branch_id: null, v2_adopted: false, v2_adopted_at: null, published_revision_id: null });
      t.website_site_drafts.push({ site_state_id: SITIO, organization_id: args.p_org, version: 1, updated_at: 'x' });
      return { data: { site_id: SITIO, creado: true, version: 1 } };
    });
    const r = await crearSitio(cliente, 120, null);
    expect(r.creado).toBe(true);
    expect(rpcs[0].fn).toBe('ensure_site_draft');
    expect(rpcs[0].args.p_org).toBe(120);
    expect(rpcs[0].args.p_branch).toBeNull();
    const doc = rpcs[0].args.p_document as DocumentoSitio;
    expect(doc.tema.colores.primario).toEqual({ mode: 'value', value: '#abcdef' });
    expect(doc.paginas.map((p) => p.id)).toEqual([PAGINA]);
  });

  test('sede: hereda de la revisión publicada del principal', async () => {
    const t = tablasBase();
    const { cliente, rpcs } = clienteFake(t, (fn, args) => {
      t.website_site_states.push({ id: SEDE, organization_id: 120, branch_id: args.p_branch, v2_adopted: false, v2_adopted_at: null, published_revision_id: null });
      return { data: { site_id: SEDE, creado: true, version: 1 } };
    });
    await crearSitio(cliente, 120, 7);
    const doc = rpcs[0].args.p_document as DocumentoSitio;
    expect(rpcs[0].args.p_branch).toBe(7);
    expect(doc.tema.colores.primario).toEqual({ mode: 'inherit' });
    expect(doc.paginas[0].titulo).toBe('Publicada');
  });

  test('sucursal de otra organización → sucursal_no_encontrada, sin RPC', async () => {
    const { cliente, rpcs } = clienteFake(tablasBase());
    expect(await codigoDe(crearSitio(cliente, 120, 8))).toBe('sucursal_no_encontrada');
    expect(rpcs).toHaveLength(0);
  });
});

describe('obtenerBorrador', () => {
  test('sede: incluye la base del principal (revisión publicada) y avisa de cambios sin publicar', async () => {
    const t = tablasBase();
    t.website_site_states.push({ id: SEDE, organization_id: 120, branch_id: 7, v2_adopted: false, v2_adopted_at: null, published_revision_id: null });
    t.website_site_drafts.push({ site_state_id: SEDE, organization_id: 120, version: 1, updated_at: 'x', document: documento('Sede') });
    const { cliente } = clienteFake(t);
    const b = await obtenerBorrador(cliente, 120, SEDE);
    expect(b.basePrincipal?.origen).toBe('revision');
    expect(b.basePrincipal?.principalConCambiosSinPublicar).toBe(true); // borrador v3, publicada desde v2
    expect(b.sitio.branchId).toBe(7);
    expect(b.erroresContrato).toEqual([]);
  });
});

describe('llevarMenuAlBorrador', () => {
  test('sede + menú del principal: copia con fn_website_copiar_menu_a_sede y apunta el encabezado a la copia', async () => {
    const t = tablasBase();
    t.website_site_states.push({ id: SEDE, organization_id: 120, branch_id: 7, v2_adopted: false, v2_adopted_at: null, published_revision_id: null });
    t.website_site_drafts.push({ site_state_id: SEDE, organization_id: 120, version: 1, updated_at: 'x', document: documento('Sede') });
    const { cliente, rpcs } = clienteFake(t, () => ({ data: MENU_COPIA }));
    const r = await llevarMenuAlBorrador(cliente, 120, SEDE, MENU, 1);
    expect(rpcs).toEqual([{ fn: 'fn_website_copiar_menu_a_sede', args: { p_menu: MENU, p_branch: 7 } }]);
    expect(r).toMatchObject({ menuId: MENU_COPIA, copiado: true, version: 2 });
    const doc = t.website_site_drafts[2].document as DocumentoSitio;
    expect(doc.shell.header.menuPrincipalId).toBe(MENU_COPIA);
    expect(doc.menus.map((m) => m.id)).toEqual([MENU_COPIA]);
    expect(doc.menus[0].items[0]).toMatchObject({ etiqueta: 'Inicio sede', paginaId: PAGINA });
  });

  test('principal + menú de una sede → peticion_invalida', async () => {
    const { cliente } = clienteFake(tablasBase());
    expect(await codigoDe(llevarMenuAlBorrador(cliente, 120, SITIO, MENU_COPIA, 3))).toBe('peticion_invalida');
  });
});

describe('errorDesdePostgrest', () => {
  test.each([
    ['42501', '', 'sin_permiso'],
    ['P0409', 'conflicto_version', 'conflicto_version'],
    ['P0002', 'sitio_no_encontrado', 'sitio_no_encontrado'],
    ['P0002', 'menu_no_encontrado', 'menu_no_encontrado'],
    ['P0422', 'sin_revision_publicada', 'sin_revision_publicada'],
    ['P0422', 'documento_invalido', 'documento_invalido'],
    ['22023', 'nota_invalida', 'peticion_invalida'],
  ])('%s %s → %s', (code, message, esperado) => {
    expect(errorDesdePostgrest({ code, message }, 'test').code).toBe(esperado);
  });

  test('desconocido → error_interno sin filtrar el mensaje', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const e = errorDesdePostgrest({ code: 'XX000', message: 'detalle interno' }, 'test');
    expect(e.code).toBe('error_interno');
    expect(e.message).not.toContain('detalle interno');
    spy.mockRestore();
  });
});
