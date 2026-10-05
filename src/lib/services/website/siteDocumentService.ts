/**
 * Servicio de documentos de sitio V2 (FASE-03 «siteDocumentService»): sitio, borrador,
 * publicación, historial, restauración, adopción y menú por sede.
 *
 * Solo servidor. Recibe el cliente de la SESIÓN (`ctx.supabase` de `withOrg`): las RPC
 * `ensure_site_draft`, `publish_site_revision`, `set_site_v2_adoption` y
 * `fn_website_copiar_menu_a_sede` vuelven a comprobar organización y permiso
 * (`website.sites.edit` / `website.sites.publish`) contra `auth.uid()`, y el guardado del
 * borrador pasa por la RLS y los privilegios por columna de `website_site_drafts`. La
 * organización la pone el route handler desde la sesión; aquí todas las consultas filtran por
 * ella (las tablas legacy tienen políticas `qual = true` de lectura pública).
 *
 * El documento se valida con el contrato (`validarDocumentoSitio`) antes de cada escritura y de
 * cada publicación: el SQL solo comprueba forma y versión (ETAPA-1, riesgos).
 *
 * Nada de esto escribe en `website_settings`, `website_pages`, `website_page_sections` ni en la
 * web pública: crear, guardar y publicar no cambian lo que ven los clientes; solo
 * `set_site_v2_adoption` lo hace, y es una acción explícita (ADR-002 D4).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  validarDocumentoSitio,
  VERSION_ESQUEMA_DOCUMENTO,
  type DocumentoSitio,
} from '@/lib/website/contrato/documentoSitio';
import {
  documentoSedeDesdeBase,
  importarMenuSuelto,
  importarSitioLegacy,
  reemplazarMenu,
  type EntradaImportacion,
  type FilaItemMenuLegacy,
  type FilaMenuLegacy,
  type FilaPaginaLegacy,
  type FilaSeccionLegacy,
} from '@/lib/website/v2/importadorLegacy';
import { COLUMNAS_IMPORTADAS } from '@/lib/website/v2/mapeoAjustes';
import type {
  BasePrincipal,
  BorradorSitio,
  CodigoErrorSitio,
  ResultadoCreacion,
  ResultadoGuardado,
  ResultadoPublicacion,
  RevisionResumen,
  SitioResumen,
} from '@/lib/website/v2/tipos';

export class ErrorSitio extends Error {
  constructor(
    public readonly code: CodigoErrorSitio,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ErrorSitio';
  }
}

interface ErrorPostgrest {
  code?: string;
  message?: string;
  details?: string | null;
}

/** Traduce el SQLSTATE de las RPC y triggers V2 a un código de la API. */
export function errorDesdePostgrest(error: ErrorPostgrest, contexto: string): ErrorSitio {
  const mensaje = error.message ?? '';
  switch (error.code) {
    case '42501':
      return new ErrorSitio('sin_permiso', 'No tienes permiso para esta acción en el sitio web.');
    case 'P0409':
      return new ErrorSitio('conflicto_version', 'Alguien guardó o publicó una versión más nueva del borrador.', error.details ?? undefined);
    case 'P0002':
      return mensaje.includes('menu')
        ? new ErrorSitio('menu_no_encontrado', 'El menú no existe en esta organización.')
        : new ErrorSitio('sitio_no_encontrado', 'El sitio no existe en esta organización.');
    case 'P0422':
      return mensaje.includes('sin_revision_publicada')
        ? new ErrorSitio('sin_revision_publicada', 'Publica una versión antes de activar V2.')
        : new ErrorSitio('documento_invalido', 'El documento del sitio no es válido.');
    case '22023':
    case '23514':
      return new ErrorSitio('peticion_invalida', 'La petición no es válida.', mensaje);
    default:
      console.error(`[siteDocumentService] ${contexto}`, { code: error.code, message: mensaje });
      return new ErrorSitio('error_interno', 'No se pudo completar la operación del sitio web.');
  }
}

// ─── Lecturas internas ────────────────────────────────────────────────────────────────────────

interface FilaEstado {
  id: string;
  branch_id: number | null;
  v2_adopted: boolean;
  v2_adopted_at: string | null;
  published_revision_id: string | null;
}

interface FilaBorrador {
  site_state_id: string;
  version: number;
  updated_at: string;
  document?: unknown;
  base_revision_id?: string | null;
}

const COLUMNAS_ESTADO = 'id, branch_id, v2_adopted, v2_adopted_at, published_revision_id';

async function estadoDeOrg(cliente: SupabaseClient, org: number, sitioId: string): Promise<FilaEstado> {
  const { data, error } = await cliente
    .from('website_site_states')
    .select(COLUMNAS_ESTADO)
    .eq('id', sitioId)
    .eq('organization_id', org)
    .maybeSingle();
  if (error) throw errorDesdePostgrest(error, 'estadoDeOrg');
  if (!data) throw new ErrorSitio('sitio_no_encontrado', 'El sitio no existe en esta organización.');
  return data as FilaEstado;
}

async function borradorDe(cliente: SupabaseClient, org: number, sitioId: string): Promise<FilaBorrador & { document: unknown }> {
  const { data, error } = await cliente
    .from('website_site_drafts')
    .select('site_state_id, version, updated_at, document, base_revision_id')
    .eq('site_state_id', sitioId)
    .eq('organization_id', org)
    .maybeSingle();
  if (error) throw errorDesdePostgrest(error, 'borradorDe');
  if (!data) throw new ErrorSitio('sitio_no_encontrado', 'El sitio no tiene borrador.');
  return data as FilaBorrador & { document: unknown };
}

async function fuenteDeRevisiones(
  cliente: SupabaseClient,
  org: number,
  ids: string[],
): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await cliente
    .from('website_site_revisions')
    .select('id, source_draft_version')
    .eq('organization_id', org)
    .in('id', ids);
  if (error) throw errorDesdePostgrest(error, 'fuenteDeRevisiones');
  return new Map(((data ?? []) as { id: string; source_draft_version: number }[]).map((r) => [r.id, r.source_draft_version]));
}

function resumen(estado: FilaEstado, borrador: FilaBorrador | undefined, fuentePublicada: number | undefined): SitioResumen {
  return {
    id: estado.id,
    branchId: estado.branch_id,
    v2Adoptado: estado.v2_adopted,
    v2AdoptadoEn: estado.v2_adopted_at,
    revisionPublicadaId: estado.published_revision_id,
    versionBorrador: borrador?.version ?? null,
    borradorActualizadoEn: borrador?.updated_at ?? null,
    cambiosSinPublicar: !estado.published_revision_id || fuentePublicada !== borrador?.version,
  };
}

/** Lee el estado legacy (sitio principal: `branch_id` NULL) que alimenta el importador. */
export async function leerLegacy(cliente: SupabaseClient, org: number): Promise<EntradaImportacion> {
  const [ajustes, paginas, menus] = await Promise.all([
    cliente
      .from('website_settings')
      .select(COLUMNAS_IMPORTADAS.join(', '))
      .eq('organization_id', org)
      .is('branch_id', null)
      .maybeSingle(),
    cliente
      .from('website_pages')
      .select('id, slug, title, page_type, is_published, meta_title, meta_description, og_image_url, show_in_header, show_in_footer, header_order, footer_order, parent_page_id, page_settings')
      .eq('organization_id', org)
      .is('branch_id', null),
    cliente
      .from('website_menus')
      .select('id, name, location, footer_column, footer_order, header_order, is_active, branch_id')
      .eq('organization_id', org)
      .is('branch_id', null),
  ]);
  for (const r of [ajustes, paginas, menus]) {
    if (r.error) throw errorDesdePostgrest(r.error, 'leerLegacy');
  }
  const filasPaginas = (paginas.data ?? []) as unknown as FilaPaginaLegacy[];
  const filasMenus = (menus.data ?? []) as unknown as FilaMenuLegacy[];

  const [secciones, items] = await Promise.all([
    filasPaginas.length === 0
      ? Promise.resolve({ data: [], error: null })
      : cliente
          .from('website_page_sections')
          .select('id, page_id, section_type, section_variant, content, settings, sort_order, is_visible')
          .eq('organization_id', org)
          .in('page_id', filasPaginas.map((p) => p.id)),
    filasMenus.length === 0
      ? Promise.resolve({ data: [], error: null })
      : cliente
          .from('website_menu_items')
          .select('id, menu_id, item_type, page_id, category_id, custom_label, custom_url, parent_item_id, display_order, is_active')
          .eq('organization_id', org)
          .in('menu_id', filasMenus.map((m) => m.id)),
  ]);
  if (secciones.error) throw errorDesdePostgrest(secciones.error, 'leerLegacy.secciones');
  if (items.error) throw errorDesdePostgrest(items.error, 'leerLegacy.items');

  return {
    ajustes: (ajustes.data ?? null) as Record<string, unknown> | null,
    paginas: filasPaginas,
    secciones: (secciones.data ?? []) as unknown as FilaSeccionLegacy[],
    menus: filasMenus,
    itemsMenu: (items.data ?? []) as unknown as FilaItemMenuLegacy[],
  };
}

async function importarPrincipalLegacy(cliente: SupabaseClient, org: number): Promise<{ documento: DocumentoSitio; avisos: string[] }> {
  const resultado = importarSitioLegacy(await leerLegacy(cliente, org));
  if (!resultado.ok) {
    throw new ErrorSitio('importacion_invalida', 'El sitio actual no se pudo convertir al formato V2.', resultado.errores);
  }
  return { documento: resultado.documento, avisos: resultado.avisos };
}

/**
 * Base de herencia de una sede: la revisión publicada del sitio principal si existe; si no, su
 * estado legacy (lo que hoy ve el público). Los cambios sin publicar del principal no llegan a
 * la sede hasta que se publiquen (Figma «Publicar Sede Norte»).
 */
export async function resolverBasePrincipal(cliente: SupabaseClient, org: number): Promise<BasePrincipal> {
  const { data: principal, error } = await cliente
    .from('website_site_states')
    .select(COLUMNAS_ESTADO)
    .eq('organization_id', org)
    .is('branch_id', null)
    .maybeSingle();
  if (error) throw errorDesdePostgrest(error, 'resolverBasePrincipal');
  const estado = principal as FilaEstado | null;

  if (estado?.published_revision_id) {
    const [{ data: revision, error: errRev }, { data: borrador }] = await Promise.all([
      cliente
        .from('website_site_revisions')
        .select('document, source_draft_version')
        .eq('id', estado.published_revision_id)
        .eq('organization_id', org)
        .maybeSingle(),
      cliente.from('website_site_drafts').select('version').eq('site_state_id', estado.id).eq('organization_id', org).maybeSingle(),
    ]);
    if (errRev) throw errorDesdePostgrest(errRev, 'resolverBasePrincipal.revision');
    const fila = revision as { document: unknown; source_draft_version: number } | null;
    const validacion = validarDocumentoSitio(fila?.document);
    if (fila && validacion.ok) {
      return {
        documento: validacion.documento,
        origen: 'revision',
        principalConCambiosSinPublicar: (borrador as { version: number } | null)?.version !== fila.source_draft_version,
      };
    }
  }

  const { documento } = await importarPrincipalLegacy(cliente, org);
  return { documento, origen: 'legacy', principalConCambiosSinPublicar: Boolean(estado) };
}

// ─── API del servicio ─────────────────────────────────────────────────────────────────────────

export async function listarSitios(cliente: SupabaseClient, org: number): Promise<SitioResumen[]> {
  const [estados, borradores] = await Promise.all([
    cliente.from('website_site_states').select(COLUMNAS_ESTADO).eq('organization_id', org),
    cliente.from('website_site_drafts').select('site_state_id, version, updated_at').eq('organization_id', org),
  ]);
  if (estados.error) throw errorDesdePostgrest(estados.error, 'listarSitios');
  if (borradores.error) throw errorDesdePostgrest(borradores.error, 'listarSitios.borradores');
  const filas = (estados.data ?? []) as FilaEstado[];
  const porSitio = new Map(((borradores.data ?? []) as FilaBorrador[]).map((b) => [b.site_state_id, b]));
  const fuentes = await fuenteDeRevisiones(
    cliente,
    org,
    filas.map((e) => e.published_revision_id).filter((id): id is string => Boolean(id)),
  );
  return filas.map((e) => resumen(e, porSitio.get(e.id), e.published_revision_id ? fuentes.get(e.published_revision_id) : undefined));
}

async function resumenDe(cliente: SupabaseClient, org: number, sitioId: string): Promise<SitioResumen> {
  const sitio = (await listarSitios(cliente, org)).find((s) => s.id === sitioId);
  if (!sitio) throw new ErrorSitio('sitio_no_encontrado', 'El sitio no existe en esta organización.');
  return sitio;
}

/**
 * Crea el sitio (principal o de sede) y su borrador inicial. Idempotente: si ya existe lo
 * devuelve sin tocar su borrador (`ensure_site_draft`).
 */
export async function crearSitio(cliente: SupabaseClient, org: number, branchId: number | null): Promise<ResultadoCreacion> {
  if (branchId !== null) {
    const { data, error } = await cliente.from('branches').select('id').eq('id', branchId).eq('organization_id', org).maybeSingle();
    if (error) throw errorDesdePostgrest(error, 'crearSitio.sucursal');
    if (!data) throw new ErrorSitio('sucursal_no_encontrada', 'La sucursal no existe en esta organización.');
  }

  const existentes = await listarSitios(cliente, org);
  const existente = existentes.find((s) => s.branchId === branchId);
  if (existente) return { sitio: existente, creado: false, avisos: [] };

  let documento: DocumentoSitio;
  let avisos: string[] = [];
  if (branchId === null) {
    ({ documento, avisos } = await importarPrincipalLegacy(cliente, org));
  } else {
    const base = await resolverBasePrincipal(cliente, org);
    documento = documentoSedeDesdeBase(base.documento);
  }
  const validacion = validarDocumentoSitio(documento);
  if (!validacion.ok) throw new ErrorSitio('importacion_invalida', 'El documento inicial no cumple el contrato.', validacion.errores);

  const { data, error } = await cliente.rpc('ensure_site_draft', {
    p_org: org,
    p_branch: branchId,
    p_document: validacion.documento,
    p_schema_version: VERSION_ESQUEMA_DOCUMENTO,
  });
  if (error) throw errorDesdePostgrest(error, 'crearSitio.ensure_site_draft');
  const respuesta = data as { site_id: string; creado: boolean };
  return { sitio: await resumenDe(cliente, org, respuesta.site_id), creado: respuesta.creado, avisos };
}

export async function obtenerBorrador(cliente: SupabaseClient, org: number, sitioId: string): Promise<BorradorSitio> {
  const estado = await estadoDeOrg(cliente, org, sitioId);
  const borrador = await borradorDe(cliente, org, sitioId);
  const validacion = validarDocumentoSitio(borrador.document);
  const fuentes = await fuenteDeRevisiones(cliente, org, estado.published_revision_id ? [estado.published_revision_id] : []);
  return {
    sitio: resumen(estado, borrador, estado.published_revision_id ? fuentes.get(estado.published_revision_id) : undefined),
    documento: (validacion.ok ? validacion.documento : borrador.document) as DocumentoSitio,
    version: borrador.version,
    actualizadoEn: borrador.updated_at,
    revisionBaseId: borrador.base_revision_id ?? null,
    basePrincipal: estado.branch_id === null ? null : await resolverBasePrincipal(cliente, org),
    erroresContrato: validacion.ok ? [] : validacion.errores,
  };
}

/**
 * Guarda el borrador con compare-and-swap: solo si su versión sigue siendo `versionEsperada`.
 * Otra pestaña o persona que guardó antes → `conflicto_version` (409), nunca pisa su trabajo.
 */
export async function guardarBorrador(
  cliente: SupabaseClient,
  org: number,
  sitioId: string,
  documento: unknown,
  versionEsperada: number,
): Promise<ResultadoGuardado> {
  if (!Number.isInteger(versionEsperada) || versionEsperada < 1) {
    throw new ErrorSitio('peticion_invalida', 'Falta la versión del borrador.');
  }
  const validacion = validarDocumentoSitio(documento);
  if (!validacion.ok) throw new ErrorSitio('documento_invalido', 'El documento no cumple el contrato.', validacion.errores);
  await estadoDeOrg(cliente, org, sitioId);

  const { data, error } = await cliente
    .from('website_site_drafts')
    .update({ document: validacion.documento, schema_version: VERSION_ESQUEMA_DOCUMENTO, version: versionEsperada + 1 })
    .eq('site_state_id', sitioId)
    .eq('organization_id', org)
    .eq('version', versionEsperada)
    .select('version, updated_at')
    .maybeSingle();
  if (error) throw errorDesdePostgrest(error, 'guardarBorrador');
  if (data) {
    const fila = data as { version: number; updated_at: string };
    return { version: fila.version, actualizadoEn: fila.updated_at };
  }

  // 0 filas: o la versión cambió (conflicto) o la RLS no deja escribir (sin permiso).
  const actual = await borradorDe(cliente, org, sitioId);
  if (actual.version !== versionEsperada) {
    throw new ErrorSitio('conflicto_version', 'Alguien guardó o publicó una versión más nueva del borrador.', {
      esperada: versionEsperada,
      actual: actual.version,
    });
  }
  throw new ErrorSitio('sin_permiso', 'No tienes permiso para editar este sitio web.');
}

export async function publicar(
  cliente: SupabaseClient,
  org: number,
  sitioId: string,
  versionEsperada: number,
  nota: string | null,
): Promise<ResultadoPublicacion> {
  if (!Number.isInteger(versionEsperada) || versionEsperada < 1) {
    throw new ErrorSitio('peticion_invalida', 'Falta la versión del borrador.');
  }
  if (nota !== null && nota.length > 500) throw new ErrorSitio('peticion_invalida', 'La nota admite hasta 500 caracteres.');
  await estadoDeOrg(cliente, org, sitioId);
  const borrador = await borradorDe(cliente, org, sitioId);
  if (borrador.version !== versionEsperada) {
    throw new ErrorSitio('conflicto_version', 'Alguien guardó una versión más nueva del borrador.', {
      esperada: versionEsperada,
      actual: borrador.version,
    });
  }
  const validacion = validarDocumentoSitio(borrador.document);
  if (!validacion.ok) throw new ErrorSitio('documento_invalido', 'El borrador no cumple el contrato.', validacion.errores);

  const { data, error } = await cliente.rpc('publish_site_revision', {
    p_site: sitioId,
    p_expected_version: versionEsperada,
    p_note: nota,
  });
  if (error) throw errorDesdePostgrest(error, 'publicar');
  const r = data as { revision_id: string; revision_number: number; published_at: string; idempotente: boolean };
  return { revisionId: r.revision_id, numero: r.revision_number, publicadaEn: r.published_at, idempotente: r.idempotente };
}

export async function listarRevisiones(
  cliente: SupabaseClient,
  org: number,
  sitioId: string,
  limite = 30,
): Promise<RevisionResumen[]> {
  const estado = await estadoDeOrg(cliente, org, sitioId);
  const { data, error } = await cliente
    .from('website_site_revisions')
    .select('id, revision_number, note, published_by, published_at, source_draft_version')
    .eq('site_state_id', sitioId)
    .eq('organization_id', org)
    .order('published_at', { ascending: false })
    .limit(Math.min(Math.max(limite, 1), 100));
  if (error) throw errorDesdePostgrest(error, 'listarRevisiones');
  const filas = (data ?? []) as {
    id: string;
    revision_number: number;
    note: string | null;
    published_by: string | null;
    published_at: string;
    source_draft_version: number;
  }[];

  // Autor visible: nombre del perfil si la RLS de profiles lo deja leer; si no, se omite.
  const autores = new Map<string, string>();
  const ids = Array.from(new Set(filas.map((f) => f.published_by).filter((id): id is string => Boolean(id))));
  if (ids.length > 0) {
    const { data: perfiles } = await cliente.from('profiles').select('id, first_name, last_name').in('id', ids);
    for (const p of (perfiles ?? []) as { id: string; first_name: string | null; last_name: string | null }[]) {
      const nombre = [p.first_name, p.last_name].filter(Boolean).join(' ').trim();
      if (nombre) autores.set(p.id, nombre);
    }
  }

  return filas.map((f) => ({
    id: f.id,
    numero: f.revision_number,
    nota: f.note,
    publicadaEn: f.published_at,
    publicadaPor: f.published_by,
    autor: f.published_by ? autores.get(f.published_by) ?? null : null,
    versionBorrador: f.source_draft_version,
    enLinea: f.id === estado.published_revision_id,
  }));
}

/** Restaurar = copiar la revisión al borrador como versión nueva. La revisión no cambia nunca. */
export async function restaurar(
  cliente: SupabaseClient,
  org: number,
  sitioId: string,
  revisionId: string,
  versionEsperada: number,
): Promise<ResultadoGuardado> {
  await estadoDeOrg(cliente, org, sitioId);
  const { data, error } = await cliente
    .from('website_site_revisions')
    .select('document')
    .eq('id', revisionId)
    .eq('site_state_id', sitioId)
    .eq('organization_id', org)
    .maybeSingle();
  if (error) throw errorDesdePostgrest(error, 'restaurar');
  if (!data) throw new ErrorSitio('revision_no_encontrada', 'La versión no existe en este sitio.');
  return guardarBorrador(cliente, org, sitioId, (data as { document: unknown }).document, versionEsperada);
}

/** Adopción explícita (D4): el único interruptor que cambia lo que sirve la web pública. */
export async function cambiarAdopcion(
  cliente: SupabaseClient,
  org: number,
  sitioId: string,
  adoptado: boolean,
): Promise<SitioResumen> {
  await estadoDeOrg(cliente, org, sitioId);
  const { error } = await cliente.rpc('set_site_v2_adoption', { p_site: sitioId, p_adopted: adoptado });
  if (error) throw errorDesdePostgrest(error, 'cambiarAdopcion');
  return resumenDe(cliente, org, sitioId);
}

/**
 * Lleva un menú de la biblioteca legacy al borrador.
 * - Sitio de sede con un menú del principal: `fn_website_copiar_menu_a_sede` crea (o devuelve)
 *   la copia propia de la sede y esa copia es la que entra al borrador; si el menú original era
 *   el del encabezado o del pie, el borrador pasa a apuntar a la copia (D3: copia, nunca
 *   referencia compartida).
 * - Menú del propio sitio: refresca su versión en el borrador.
 * Guarda con compare-and-swap.
 */
export async function llevarMenuAlBorrador(
  cliente: SupabaseClient,
  org: number,
  sitioId: string,
  menuId: string,
  versionEsperada: number,
): Promise<ResultadoGuardado & { menuId: string; copiado: boolean }> {
  const estado = await estadoDeOrg(cliente, org, sitioId);
  const leerMenu = async (id: string) => {
    const { data, error } = await cliente
      .from('website_menus')
      .select('id, name, location, footer_column, footer_order, header_order, is_active, branch_id')
      .eq('id', id)
      .eq('organization_id', org)
      .maybeSingle();
    if (error) throw errorDesdePostgrest(error, 'llevarMenuAlBorrador.menu');
    if (!data) throw new ErrorSitio('menu_no_encontrado', 'El menú no existe en esta organización.');
    return data as FilaMenuLegacy;
  };

  const origen = await leerMenu(menuId);
  const ramaMenu = origen.branch_id ?? null;
  let destino = origen;
  let copiado = false;
  if (estado.branch_id !== null && ramaMenu === null) {
    const { data, error } = await cliente.rpc('fn_website_copiar_menu_a_sede', { p_menu: menuId, p_branch: estado.branch_id });
    if (error) throw errorDesdePostgrest(error, 'llevarMenuAlBorrador.copiar');
    destino = await leerMenu(String(data));
    copiado = true;
  } else if (ramaMenu !== estado.branch_id) {
    throw new ErrorSitio('peticion_invalida', 'Ese menú pertenece a otra sede.');
  }

  const { data: items, error: errItems } = await cliente
    .from('website_menu_items')
    .select('id, menu_id, item_type, page_id, category_id, custom_label, custom_url, parent_item_id, display_order, is_active')
    .eq('menu_id', destino.id)
    .eq('organization_id', org);
  if (errItems) throw errorDesdePostgrest(errItems, 'llevarMenuAlBorrador.items');

  const borrador = await borradorDe(cliente, org, sitioId);
  const validacion = validarDocumentoSitio(borrador.document);
  if (!validacion.ok) throw new ErrorSitio('documento_invalido', 'El borrador no cumple el contrato.', validacion.errores);
  const { menu } = importarMenuSuelto(validacion.documento, destino, (items ?? []) as unknown as FilaItemMenuLegacy[]);
  let documento = reemplazarMenu(validacion.documento, menu);
  if (copiado) {
    if (documento.shell.header.menuPrincipalId === menuId) documento.shell.header.menuPrincipalId = destino.id;
    if (documento.shell.header.menuMegaId === menuId) documento.shell.header.menuMegaId = destino.id;
    documento.shell.footer.menuIds = documento.shell.footer.menuIds.map((id) => (id === menuId ? destino.id : id));
    // La copia sustituye al menú del principal: no quedan dos menús con el mismo contenido.
    documento = { ...documento, menus: documento.menus.filter((m) => m.id !== menuId || m.id === destino.id) };
  }
  const guardado = await guardarBorrador(cliente, org, sitioId, documento, versionEsperada);
  return { ...guardado, menuId: destino.id, copiado };
}
