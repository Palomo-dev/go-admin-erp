/**
 * «Carta» en el servidor (Figma B/13). Lectura y escritura con el cliente de la
 * SESIÓN (RLS: miembros leen; escribe quien tiene `website.sites.edit`) y la
 * organización del contexto. Las escrituras de varias tablas van por RPC
 * transaccional (`crear_carta`, `guardar_carta`, `reordenar_cartas`); la
 * vigencia, por `get_public_menu` (la misma RPC del sitio público).
 *
 * Mientras la migración 20261008150100 no esté aplicada, la lista devuelve la
 * carta IMPLÍCITA que el sitio muestra hoy (todas las categorías, todo el día,
 * todas las sedes) con `disponible: false`, y la pestaña «Por sede» del detalle
 * sigue funcionando sobre `website_branch_products` (`guardarCartaYSedes`).
 */
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { permisosSitio } from '@/lib/services/website/paginasSitioService';
import { direccionDelSitio } from '@/components/sitio-web/seoanalitica/seo.server';
import { importePrecioVigente } from '@/lib/pos/precioVigente';
import { urlQrMesa } from '@/lib/pos/mesas/qrMesa';
import { wallTimeToInstant } from '@/lib/utils/dateCore';
import { getOrganizationTimezone } from '@/lib/services/organizationTimezoneService';
import { resolveOrgCurrency } from '@/lib/services/monedaOrganizacion';
import { escrituraCartaSedeSchema } from '@/lib/services/website/cartaSede';
import { prepararFilasCartaSede, type FilaCartaSede } from '@/lib/services/website/cartaSedeService';
import {
  ID_CARTA_PRINCIPAL_IMPLICITA,
  horarioDeJson,
  horarioTodoElDia,
  ordenarProductos,
  parcheGuardarCarta,
  tipoEtiqueta,
  type CartaPublica,
  type CartaResumen,
  type CategoriaCarta,
  type DetalleCarta,
  type EtiquetaProductoCarta,
  type GuardarCarta,
  type IconoCarta,
  type OpcionCarta,
  type RespuestaCartas,
  type RespuestaQr,
  type RespuestaVistaPrevia,
  type SedeCarta,
  type VigenteSede,
} from './carta';

export type CtxCarta = Pick<ServerOrgContext, 'organizationId' | 'userId' | 'supabase'>;

export class ErrorCarta extends Error {
  constructor(
    public readonly codigo: 'sin_permiso' | 'peticion_invalida' | 'pendiente_migracion' | 'no_encontrada' | 'no_restaurante',
    public readonly status: number,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = 'ErrorCarta';
  }
}

/** Tabla, columna o función que aún no existe (migración pendiente). */
const SIN_OBJETO = new Set(['42P01', 'PGRST205', '42703', 'PGRST204', '42883', 'PGRST202']);
const faltaObjeto = (e: unknown) => SIN_OBJETO.has(((e as { code?: string } | null)?.code ?? '') as string);
const TROZO = 200;

function trozos<T>(lista: readonly T[]): T[][] {
  const salida: T[][] = [];
  for (let i = 0; i < lista.length; i += TROZO) salida.push(lista.slice(i, i + TROZO));
  return salida;
}

function errorDe(error: { code?: string; message?: string } | null): never {
  if (error?.code === '42501') throw new ErrorCarta('sin_permiso', 403, 'No tienes permiso para editar la carta.');
  if (error?.code === 'P0002') throw new ErrorCarta('no_encontrada', 404, 'No encontramos esa carta.');
  if (error?.code === '22023' || error?.code === '23514' || error?.code === '23505') throw new ErrorCarta('peticion_invalida', 400, 'Revisa los datos de la carta.');
  if (faltaObjeto(error)) throw new ErrorCarta('pendiente_migracion', 409, 'Las cartas por horario se activan con una actualización pendiente.');
  throw error;
}

async function sedesActivas(ctx: CtxCarta): Promise<SedeCarta[]> {
  const { data, error } = await ctx.supabase
    .from('branches')
    .select('id, name')
    .eq('organization_id', ctx.organizationId)
    .eq('is_active', true)
    .order('is_main', { ascending: false })
    .order('name');
  if (error) throw error;
  return ((data ?? []) as { id: number; name: string }[]).map((b) => ({ id: b.id, nombre: b.name }));
}

/** Restaurante por giro de la organización o por alguna sede de tipo restaurante (B/13-07 nota 6). */
export async function esRestaurante(ctx: CtxCarta): Promise<boolean> {
  const [org, sedes] = await Promise.all([
    ctx.supabase.from('organizations').select('type_id').eq('id', ctx.organizationId).maybeSingle(),
    ctx.supabase.from('branches').select('id').eq('organization_id', ctx.organizationId).eq('branch_type', 'restaurant').limit(1),
  ]);
  if (org.error) throw org.error;
  if (sedes.error) throw sedes.error;
  return (org.data as { type_id?: number | null } | null)?.type_id === 1 || (sedes.data ?? []).length > 0;
}

/** Moneda base de la organización: la regla única de `resolveOrgCurrency` (sin moneda fija). */
async function monedaBase(ctx: CtxCarta): Promise<string> {
  return (await resolveOrgCurrency(ctx.supabase, ctx.organizationId)).code;
}

interface FilaCarta {
  id: string;
  name: string;
  icon: string | null;
  schedule: unknown;
  branch_ids: number[] | null;
  pdf_url: string | null;
  sort_order: number;
  is_active: boolean;
}

interface FilaCategoria {
  id: number;
  name: string;
  parent_id: number | null;
  display_order: number | null;
  is_active: boolean | null;
}

async function categoriasRaiz(ctx: CtxCarta): Promise<FilaCategoria[]> {
  const { data, error } = await ctx.supabase
    .from('categories')
    .select('id, name, parent_id, display_order, is_active')
    .eq('organization_id', ctx.organizationId)
    .is('parent_id', null)
    .order('display_order', { ascending: true, nullsFirst: false })
    .order('name');
  if (error) throw error;
  return ((data ?? []) as FilaCategoria[]).filter((c) => c.is_active !== false);
}

/** Productos activos (sin variantes hijas) por categoría: solo id, nombre y categoría. */
async function productosPorCategoria(ctx: CtxCarta, categorias: readonly number[]): Promise<Map<number, { id: number; name: string; tag_id: number | null }[]>> {
  const mapa = new Map<number, { id: number; name: string; tag_id: number | null }[]>();
  for (const trozo of trozos(categorias)) {
    const { data, error } = await ctx.supabase
      .from('products')
      .select('id, name, category_id, tag_id')
      .eq('organization_id', ctx.organizationId)
      .eq('status', 'active')
      .is('parent_product_id', null)
      .in('category_id', trozo);
    if (error) throw error;
    for (const p of (data ?? []) as { id: number; name: string; category_id: number; tag_id: number | null }[]) {
      const lista = mapa.get(p.category_id) ?? [];
      lista.push({ id: p.id, name: p.name, tag_id: p.tag_id });
      mapa.set(p.category_id, lista);
    }
  }
  return mapa;
}

/** Cartas vigentes AHORA por sede, con la RPC del sitio público (una sola regla de vigencia). */
async function vigentesAhora(ctx: CtxCarta, sedes: readonly SedeCarta[]): Promise<{ ahora: { dia: number; hora: string } | null; porSede: VigenteSede[]; ids: Map<string, number[]> }> {
  const ids = new Map<string, number[]>();
  const porSede: VigenteSede[] = [];
  let ahora: { dia: number; hora: string } | null = null;
  const instante = new Date().toISOString();
  const respuestas = await Promise.all(
    sedes.map((s) => ctx.supabase.rpc('get_public_menu', { p_org: ctx.organizationId, p_branch: s.id, p_at: instante })),
  );
  respuestas.forEach((r, i) => {
    if (r.error) return;
    const d = r.data as { dia: number; hora: string; cartas: { id: string; nombre: string }[] };
    ahora = ahora ?? { dia: d.dia, hora: d.hora };
    porSede.push({ sedeId: sedes[i].id, sede: sedes[i].nombre, cartas: d.cartas.map((c) => c.nombre) });
    for (const c of d.cartas) ids.set(c.id, [...(ids.get(c.id) ?? []), sedes[i].id]);
  });
  return { ahora, porSede, ids };
}

/** GET /api/sitio-web/carta: lista de cartas con conteos y vigencia. */
export async function listarCartas(ctx: CtxCarta): Promise<RespuestaCartas> {
  const [permisos, restaurante, sedes, direccion] = await Promise.all([permisosSitio(ctx), esRestaurante(ctx), sedesActivas(ctx), direccionDelSitio(ctx)]);
  const base = { permisos: { editar: permisos.editar }, esRestaurante: restaurante, host: direccion.host, sedes };

  const cartasRes = await ctx.supabase
    .from('restaurant_menus')
    .select('id, name, icon, schedule, branch_ids, pdf_url, sort_order, is_active, restaurant_menu_sections(category_id), restaurant_menu_items(product_id, is_hidden)')
    .eq('organization_id', ctx.organizationId)
    .order('sort_order')
    .order('created_at');

  if (cartasRes.error) {
    if (!faltaObjeto(cartasRes.error)) throw cartasRes.error;
    // Sin la migración: la carta que el sitio muestra hoy, con todas las categorías.
    const raiz = await categoriasRaiz(ctx);
    const productos = await productosPorCategoria(ctx, raiz.map((c) => c.id));
    const implicita: CartaResumen = {
      id: ID_CARTA_PRINCIPAL_IMPLICITA,
      nombre: 'Carta principal',
      icono: 'principal',
      horario: horarioTodoElDia(),
      sedes: null,
      pdfUrl: null,
      activa: true,
      categorias: raiz.length,
      productos: [...productos.values()].reduce((n, l) => n + l.length, 0),
      vigenteEn: sedes.map((s) => s.id),
      implicita: true,
    };
    return { ...base, disponible: false, cartas: raiz.length > 0 ? [implicita] : [], ahora: null, vigentes: [] };
  }

  type FilaConHijos = FilaCarta & { restaurant_menu_sections: { category_id: number }[] | null; restaurant_menu_items: { product_id: number; is_hidden: boolean }[] | null };
  const filas = (cartasRes.data ?? []) as unknown as FilaConHijos[];
  const todasCategorias = [...new Set(filas.flatMap((f) => (f.restaurant_menu_sections ?? []).map((s) => s.category_id)))];
  const [productos, vigencia] = await Promise.all([productosPorCategoria(ctx, todasCategorias), vigentesAhora(ctx, sedes)]);

  const cartas: CartaResumen[] = filas.map((f) => {
    const cats = (f.restaurant_menu_sections ?? []).map((s) => s.category_id);
    const ocultos = new Set((f.restaurant_menu_items ?? []).filter((i) => i.is_hidden).map((i) => i.product_id));
    const nProductos = cats.reduce((n, c) => n + (productos.get(c) ?? []).filter((p) => !ocultos.has(p.id)).length, 0);
    return {
      id: f.id,
      nombre: f.name,
      icono: (f.icon as IconoCarta | null) ?? null,
      horario: horarioDeJson(f.schedule),
      sedes: f.branch_ids,
      pdfUrl: f.pdf_url,
      activa: f.is_active,
      categorias: cats.length,
      productos: nProductos,
      vigenteEn: vigencia.ahora ? vigencia.ids.get(f.id) ?? [] : null,
    };
  });
  return { ...base, disponible: true, cartas, ahora: vigencia.ahora, vigentes: vigencia.porSede };
}

export async function crearCarta(
  ctx: CtxCarta,
  datos: { nombre: string; icono?: IconoCarta | null; duplicarDe?: string | null; todasLasCategorias?: boolean },
): Promise<string> {
  const { data, error } = await ctx.supabase.rpc('crear_carta', {
    p_org: ctx.organizationId,
    p_nombre: datos.nombre,
    p_icono: datos.icono ?? null,
    p_duplicar_de: datos.duplicarDe ?? null,
    p_todas_las_categorias: datos.todasLasCategorias ?? true,
  });
  if (error) errorDe(error);
  return data as string;
}

export async function reordenarCartas(ctx: CtxCarta, ids: string[]): Promise<void> {
  const { error } = await ctx.supabase.rpc('reordenar_cartas', { p_org: ctx.organizationId, p_ids: ids });
  if (error) errorDe(error);
}

export async function eliminarCarta(ctx: CtxCarta, id: string): Promise<void> {
  const permisos = await permisosSitio(ctx);
  if (!permisos.editar) throw new ErrorCarta('sin_permiso', 403, 'No tienes permiso para editar la carta.');
  const { data, error } = await ctx.supabase.from('restaurant_menus').delete().eq('id', id).eq('organization_id', ctx.organizationId).select('id');
  if (error) errorDe(error);
  if (!data || data.length === 0) throw new ErrorCarta('no_encontrada', 404, 'No encontramos esa carta.');
}

/** Etiquetas de dieta/alérgeno por producto (`product_tags.kind`; sin la columna, ninguna). */
async function etiquetasDe(ctx: CtxCarta, lista: readonly { id: number; tag_id: number | null }[]): Promise<Map<number, EtiquetaProductoCarta[]>> {
  const productos = lista.map((p) => p.id);
  const mapa = new Map<number, EtiquetaProductoCarta[]>();
  if (productos.length === 0) return mapa;
  const tags = await ctx.supabase.from('product_tags').select('id, name, kind').eq('organization_id', ctx.organizationId).not('kind', 'is', null);
  if (tags.error) {
    if (faltaObjeto(tags.error)) return mapa;
    throw tags.error;
  }
  const porId = new Map<number, EtiquetaProductoCarta>();
  for (const t of (tags.data ?? []) as { id: number; name: string; kind: string | null }[]) {
    const tipo = tipoEtiqueta(t.kind);
    if (tipo) porId.set(t.id, { nombre: t.name, tipo });
  }
  if (porId.size === 0) return mapa;
  // Etiqueta principal del producto (`products.tag_id`) y las de `product_tag_relations`, como get_public_menu.
  for (const p of lista) {
    const e = p.tag_id !== null ? porId.get(p.tag_id) : undefined;
    if (e) mapa.set(p.id, [e]);
  }
  for (const trozo of trozos(productos)) {
    const { data, error } = await ctx.supabase.from('product_tag_relations').select('product_id, tag_id').in('product_id', trozo).in('tag_id', [...porId.keys()]);
    if (error) throw error;
    for (const r of (data ?? []) as { product_id: number; tag_id: number }[]) {
      const e = porId.get(r.tag_id);
      const actuales = mapa.get(r.product_id) ?? [];
      if (e && !actuales.includes(e)) mapa.set(r.product_id, [...actuales, e]);
    }
  }
  return mapa;
}

async function preciosGenerales(ctx: CtxCarta, productos: readonly number[]): Promise<Map<number, number | null>> {
  const filas = new Map<number, { price: number | string | null; effective_from: string | null; effective_to: string | null }[]>();
  const ahora = new Date();
  for (const trozo of trozos(productos)) {
    const { data, error } = await ctx.supabase
      .from('product_prices')
      .select('product_id, price, effective_from, effective_to')
      .in('product_id', trozo)
      .lte('effective_from', ahora.toISOString());
    if (error) throw error;
    for (const f of (data ?? []) as { product_id: number; price: number | string | null; effective_from: string | null; effective_to: string | null }[]) {
      filas.set(f.product_id, [...(filas.get(f.product_id) ?? []), f]);
    }
  }
  const salida = new Map<number, number | null>();
  for (const id of productos) salida.set(id, importePrecioVigente(filas.get(id), ahora));
  return salida;
}

/**
 * Variantes (productos hijos activos) y grupos de extras (`product_modifier_groups`
 * con sus `product_modifiers` activos) de los productos de la carta, para la
 * pestaña «Variantes y extras». Mismas tablas y columnas que ya leen el POS
 * (`posService`) y `ProductModifiersService`. Si una de las dos no está, la
 * pestaña simplemente no la lista.
 */
async function opcionesDeProductos(
  ctx: CtxCarta,
  productos: readonly number[],
): Promise<{ variantes: Map<number, { id: number; nombre: string }[]>; extras: Map<number, { id: number; nombre: string; opciones: number }[]> }> {
  const variantes = new Map<number, { id: number; nombre: string }[]>();
  const extras = new Map<number, { id: number; nombre: string; opciones: number }[]>();
  for (const trozo of trozos(productos)) {
    const [v, m] = await Promise.all([
      ctx.supabase
        .from('products')
        .select('id, name, parent_product_id')
        .eq('organization_id', ctx.organizationId)
        .eq('status', 'active')
        .in('parent_product_id', trozo)
        .order('name'),
      ctx.supabase
        .from('product_modifier_groups')
        .select('id, product_id, name, display_order, product_modifiers(id, is_active)')
        .eq('organization_id', ctx.organizationId)
        .in('product_id', trozo)
        .order('display_order'),
    ]);
    if (v.error && !faltaObjeto(v.error)) throw v.error;
    if (m.error && !faltaObjeto(m.error)) throw m.error;
    for (const f of (v.data ?? []) as { id: number; name: string; parent_product_id: number }[]) {
      variantes.set(f.parent_product_id, [...(variantes.get(f.parent_product_id) ?? []), { id: f.id, nombre: f.name }]);
    }
    for (const g of (m.data ?? []) as unknown as { id: number; product_id: number; name: string; product_modifiers: { id: number; is_active: boolean | null }[] | null }[]) {
      const opciones = (g.product_modifiers ?? []).filter((x) => x.is_active !== false).length;
      extras.set(g.product_id, [...(extras.get(g.product_id) ?? []), { id: g.id, nombre: g.name, opciones }]);
    }
  }
  return { variantes, extras };
}

/**
 * Variantes y extras ocultos por producto en esta carta (columnas de la
 * migración 20261008150200). `null` si la migración aún no está aplicada.
 */
async function ocultosDeCarta(ctx: CtxCarta, menuId: string): Promise<Map<number, { variantes: number[]; extras: number[] }> | null> {
  const { data, error } = await ctx.supabase
    .from('restaurant_menu_items')
    .select('product_id, hidden_variant_ids, hidden_modifier_group_ids')
    .eq('organization_id', ctx.organizationId)
    .eq('menu_id', menuId);
  if (error) {
    if (faltaObjeto(error)) return null;
    throw error;
  }
  return new Map(
    ((data ?? []) as { product_id: number; hidden_variant_ids: number[] | null; hidden_modifier_group_ids: number[] | null }[]).map((f) => [
      f.product_id,
      { variantes: f.hidden_variant_ids ?? [], extras: f.hidden_modifier_group_ids ?? [] },
    ]),
  );
}

function opcionesCon(lista: readonly { id: number; nombre: string; opciones?: number }[] | undefined, ocultas: readonly number[] | undefined): OpcionCarta[] | undefined {
  if (!lista || lista.length === 0) return undefined;
  const set = new Set(ocultas ?? []);
  return lista.map((o) => ({ ...o, oculta: set.has(o.id) }));
}

/** GET /api/sitio-web/carta/[menuId]: la carta con sus categorías, productos y excepciones. */
export async function detalleCarta(ctx: CtxCarta, id: string): Promise<DetalleCarta> {
  const [permisos, sedes, raiz, moneda] = await Promise.all([permisosSitio(ctx), sedesActivas(ctx), categoriasRaiz(ctx), monedaBase(ctx)]);

  let carta: CartaResumen;
  let seccionesIds: number[];
  let excepciones = new Map<number, { is_featured: boolean; is_hidden: boolean; sort_order: number | null }>();
  let disponible = true;

  if (id === ID_CARTA_PRINCIPAL_IMPLICITA) {
    disponible = false;
    seccionesIds = raiz.map((c) => c.id);
    carta = {
      id,
      nombre: 'Carta principal',
      icono: 'principal',
      horario: horarioTodoElDia(),
      sedes: null,
      pdfUrl: null,
      activa: true,
      categorias: raiz.length,
      productos: 0,
      vigenteEn: sedes.map((s) => s.id),
      implicita: true,
    };
  } else {
    const r = await ctx.supabase
      .from('restaurant_menus')
      .select('id, name, icon, schedule, branch_ids, pdf_url, sort_order, is_active, restaurant_menu_sections(category_id, sort_order), restaurant_menu_items(product_id, is_featured, is_hidden, sort_order)')
      .eq('organization_id', ctx.organizationId)
      .eq('id', id)
      .maybeSingle();
    if (r.error) errorDe(r.error);
    if (!r.data) throw new ErrorCarta('no_encontrada', 404, 'No encontramos esa carta.');
    const f = r.data as unknown as FilaCarta & {
      restaurant_menu_sections: { category_id: number; sort_order: number }[] | null;
      restaurant_menu_items: { product_id: number; is_featured: boolean; is_hidden: boolean; sort_order: number | null }[] | null;
    };
    seccionesIds = [...(f.restaurant_menu_sections ?? [])].sort((a, b) => a.sort_order - b.sort_order).map((s) => s.category_id);
    excepciones = new Map((f.restaurant_menu_items ?? []).map((i) => [i.product_id, i]));
    carta = {
      id: f.id,
      nombre: f.name,
      icono: (f.icon as IconoCarta | null) ?? null,
      horario: horarioDeJson(f.schedule),
      sedes: f.branch_ids,
      pdfUrl: f.pdf_url,
      activa: f.is_active,
      categorias: seccionesIds.length,
      productos: 0,
      vigenteEn: null,
    };
  }

  // Nombres de las categorías de la carta (pueden ser subcategorías).
  const nombres = new Map(raiz.map((c) => [c.id, c.name]));
  const faltan = seccionesIds.filter((c) => !nombres.has(c));
  if (faltan.length > 0) {
    const { data, error } = await ctx.supabase.from('categories').select('id, name').eq('organization_id', ctx.organizationId).in('id', faltan);
    if (error) throw error;
    for (const c of (data ?? []) as { id: number; name: string }[]) nombres.set(c.id, c.name);
  }

  const productos = await productosPorCategoria(ctx, seccionesIds);
  const planos = [...productos.values()].flat();
  const ids = planos.map((p) => p.id);
  const [precios, etiquetas, opciones, ocultos] = await Promise.all([
    preciosGenerales(ctx, ids),
    etiquetasDe(ctx, planos),
    opcionesDeProductos(ctx, ids),
    disponible ? ocultosDeCarta(ctx, id) : Promise.resolve(null),
  ]);

  const categorias: CategoriaCarta[] = seccionesIds
    .filter((c) => nombres.has(c))
    .map((c) => ({
      id: c,
      nombre: nombres.get(c) as string,
      productos: ordenarProductos(
        (productos.get(c) ?? []).map((p) => {
          const e = excepciones.get(p.id);
          return {
            id: p.id,
            nombre: p.name,
            precio: precios.get(p.id) ?? null,
            etiquetas: etiquetas.get(p.id) ?? [],
            destacado: e?.is_featured ?? false,
            oculto: e?.is_hidden ?? false,
            orden: e?.sort_order ?? null,
            variantes: opcionesCon(opciones.variantes.get(p.id), ocultos?.get(p.id)?.variantes),
            extras: opcionesCon(opciones.extras.get(p.id), ocultos?.get(p.id)?.extras),
          };
        }),
      ),
    }));
  carta.productos = categorias.reduce((n, c) => n + c.productos.filter((p) => !p.oculto).length, 0);
  if (disponible) {
    // «Visible ahora en …» del subtítulo: la misma RPC que la lista y el sitio.
    const vigencia = await vigentesAhora(ctx, sedes);
    carta.vigenteEn = vigencia.ahora ? vigencia.ids.get(carta.id) ?? [] : null;
  }

  return {
    disponible,
    permisos: { editar: permisos.editar },
    carta,
    categorias,
    disponibles: raiz.filter((c) => !seccionesIds.includes(c.id)).map((c) => ({ id: c.id, nombre: c.name })),
    sedes,
    moneda,
    opcionesDisponibles: disponible && ocultos !== null,
  };
}

/** PUT /api/sitio-web/carta/[menuId]: todo el detalle en un lote (`guardar_carta`). */
export async function guardarCarta(ctx: CtxCarta, id: string, cambios: GuardarCarta): Promise<void> {
  if (id === ID_CARTA_PRINCIPAL_IMPLICITA) throw new ErrorCarta('pendiente_migracion', 409, 'Las cartas por horario se activan con una actualización pendiente.');
  const { error } = await ctx.supabase.rpc('guardar_carta', { p_menu: id, p_patch: parcheGuardarCarta(cambios) });
  if (error) errorDe(error);
}

/**
 * Guarda el detalle de una carta y su pestaña «Por sede» en UNA transacción
 * (`guardar_carta_y_sedes`): o queda todo o no queda nada. Las filas de cada sede
 * se calculan con el servicio único de Carta por sede (`prepararFilasCartaSede`:
 * permiso, sede y productos de la organización, fusión con lo guardado) y cada
 * lote se valida con `escrituraCartaSedeSchema`, la única definición del contrato.
 *
 * Mientras la RPC no esté aplicada (migración pendiente) se degrada a lo de antes,
 * pero las sedes ya van en UN solo upsert: primero la carta, después todas las sedes.
 * La carta implícita (`principal`) no tiene fila propia: solo guarda sus sedes.
 */
export async function guardarCartaYSedes(
  ctx: CtxCarta,
  id: string,
  carta: Omit<GuardarCarta, 'porSede'>,
  porSede: GuardarCarta['porSede'],
): Promise<void> {
  const conCarta = Object.keys(carta).length > 0;
  const lotes = (porSede ?? []).map((l) => escrituraCartaSedeSchema.safeParse({ tipo: 'productos', branch_id: l.branch_id, cambios: l.cambios }));
  if (lotes.some((r) => !r.success)) throw new ErrorCarta('peticion_invalida', 400, 'Revisa los cambios por sede.');
  if (conCarta && id === ID_CARTA_PRINCIPAL_IMPLICITA) {
    throw new ErrorCarta('pendiente_migracion', 409, 'Las cartas por horario se activan con una actualización pendiente.');
  }

  let filas: FilaCartaSede[] = [];
  if (lotes.length > 0) {
    const timezone = await getOrganizationTimezone(ctx.organizationId, ctx.supabase);
    const ctxSede = { organizationId: ctx.organizationId, userId: ctx.userId, supabase: ctx.supabase, timezone };
    // Una fila por sede y producto: si dos lotes tocan el mismo producto, gana el último.
    const porClave = new Map<string, FilaCartaSede>();
    for (const r of lotes) {
      if (!r.success) continue;
      for (const f of await prepararFilasCartaSede(ctxSede, r.data)) porClave.set(`${f.branch_id}/${f.product_id}`, f);
    }
    filas = Array.from(porClave.values());
  }
  if (!conCarta && filas.length === 0) return;

  const { error } = await ctx.supabase.rpc('guardar_carta_y_sedes', {
    p_org: ctx.organizationId,
    p_menu: conCarta ? id : null,
    p_patch: conCarta ? parcheGuardarCarta(carta) : {},
    p_filas: filas,
  });
  if (!error) return;
  if (!faltaObjeto(error)) errorDe(error);

  // Respaldo sin la RPC: carta y luego todas las sedes en un solo upsert.
  if (conCarta) await guardarCarta(ctx, id, carta);
  if (filas.length > 0) {
    const r = await ctx.supabase.from('website_branch_products').upsert(filas, { onConflict: 'branch_id,product_id' });
    if (r.error) errorDe(r.error);
  }
}

/** GET /api/sitio-web/carta/qr: mesas de la sede (POS › Mesas) con la URL de su QR. */
export async function mesasQr(ctx: CtxCarta, sedeId: number | null): Promise<RespuestaQr> {
  const [sedes, direccion] = await Promise.all([sedesActivas(ctx), direccionDelSitio(ctx)]);
  const sede = sedes.find((s) => s.id === sedeId) ?? sedes[0] ?? null;
  const host = direccion.host;
  if (!sede) return { host, sedes, sedeId: null, mesas: [], urlGeneral: host ? `https://${host}/menu` : null };
  const { data, error } = await ctx.supabase
    .from('restaurant_tables')
    .select('id, name, zone')
    .eq('organization_id', ctx.organizationId)
    .eq('branch_id', sede.id)
    .order('zone', { ascending: true, nullsFirst: false })
    .order('name');
  if (error) throw error;
  const mesas = ((data ?? []) as { id: string; name: string; zone: string | null }[]).map((m) => ({ id: m.id, nombre: m.name, zona: m.zone, url: urlQrMesa(host, m.id) }));
  return { host, sedes, sedeId: sede.id, mesas, urlGeneral: host ? `https://${host}/menu` : null };
}

/** GET /api/sitio-web/carta/vista-previa: «Ver como» con la MISMA RPC del sitio. */
export async function vistaPreviaCarta(ctx: CtxCarta, sedeId: number | null, fecha: string | null, hora: string | null): Promise<RespuestaVistaPrevia> {
  const [sedes, direccion, moneda, tzOrg] = await Promise.all([sedesActivas(ctx), direccionDelSitio(ctx), monedaBase(ctx), getOrganizationTimezone(ctx.organizationId, ctx.supabase)]);
  const sede = sedes.find((s) => s.id === sedeId) ?? sedes[0] ?? null;
  const instante = fecha && hora ? wallTimeToInstant(fecha, hora, tzOrg) : new Date();
  const base = { host: direccion.host, sede, sedes, moneda };
  if (!sede) return { ...base, disponible: true, zonaHoraria: tzOrg, dia: 0, hora: '', cartas: [] };
  const { data, error } = await ctx.supabase.rpc('get_public_menu', { p_org: ctx.organizationId, p_branch: sede.id, p_at: instante.toISOString() });
  if (error) {
    if (faltaObjeto(error)) return { ...base, disponible: false, zonaHoraria: tzOrg, dia: 0, hora: hora ?? '', cartas: [] };
    throw error;
  }
  const d = data as { zonaHoraria: string; dia: number; hora: string; cartas: CartaPublica[] };
  return { ...base, disponible: true, zonaHoraria: d.zonaHoraria, dia: d.dia, hora: d.hora, cartas: d.cartas };
}

export function respuestaErrorCarta(error: unknown, ruta: string, organizationId: number): Response {
  const cabeceras = { 'Cache-Control': 'private, no-store' };
  if (error instanceof ErrorCarta) return Response.json({ error: error.message, codigo: error.codigo }, { status: error.status, headers: cabeceras });
  if ((error as { code?: string } | null)?.code === '42501') {
    return Response.json({ error: 'No tienes acceso a la carta.', codigo: 'sin_permiso' }, { status: 403, headers: cabeceras });
  }
  console.error(`[api/${ruta}]`, { organizationId, message: error instanceof Error ? error.message : String((error as { message?: string })?.message ?? error) });
  return Response.json({ error: 'No pudimos completar la operación.', codigo: 'error_interno' }, { status: 500, headers: cabeceras });
}
