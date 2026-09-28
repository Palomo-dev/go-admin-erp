/**
 * Formato del catálogo de Meta (Facebook / Instagram Commerce Manager) —
 * FUENTE ÚNICA. La usan la exportación CSV (sesión del usuario) y el feed
 * público por token; antes `buildFacebookRow` estaba duplicada en
 * `facebookCatalogExport.ts` (navegador) y `facebookFeedService.ts` (servidor).
 *
 * Correcciones respecto a la versión anterior (verificadas contra la
 * especificación de Meta):
 *   - `price` es el precio regular y `sale_price` el rebajado. Antes `sale_price`
 *     recibía el precio de comparación (el MAYOR): quedaba invertido.
 *   - Solo productos `active`. Antes entraban los `inactive`/`discontinued`
 *     (el filtro era `status <> 'deleted'`), también en las variantes.
 *   - Un producto que no controla stock está «in stock» (antes salía «out of stock»).
 *   - Un padre con variantes activas no sale como artículo propio: sus variantes
 *     salen con `item_group_id` = SKU del padre y heredan descripción, marca,
 *     categoría, imágenes y precio.
 *   - `gtin` solo si es un código numérico de 8 a 14 dígitos (si no, Meta rechaza la fila).
 *   - `description` vacía → el título (Meta la exige).
 *   - Precio sin separador de miles, con los decimales de la moneda: «100000 COP», «9.99 USD».
 *   - Nueva columna `additional_image_link` (hasta 9 imágenes más, separadas por coma).
 * Lo que Meta no puede publicar se EXCLUYE con su motivo (el diálogo lo muestra).
 */

/** Columnas del CSV. Las 31 de siempre, en el mismo orden, más `additional_image_link` al final. */
export const COLUMNAS_META = [
  'id',
  'title',
  'description',
  'availability',
  'condition',
  'price',
  'link',
  'image_link',
  'brand',
  'google_product_category',
  'fb_product_category',
  'quantity_to_sell_on_facebook',
  'sale_price',
  'sale_price_effective_date',
  'item_group_id',
  'gender',
  'color',
  'size',
  'age_group',
  'material',
  'pattern',
  'shipping',
  'shipping_weight',
  'offer_disclaimer',
  'offer_disclaimer_url',
  'video[0].url',
  'video[0].tag[0]',
  'gtin',
  'product_tags[0]',
  'product_tags[1]',
  'style[0]',
  'additional_image_link',
] as const;

export type ColumnaMeta = (typeof COLUMNAS_META)[number];
export type FilaMeta = Record<ColumnaMeta, string>;

/** Producto ya resuelto (precio vigente, stock sumado, URLs públicas de imágenes). */
export interface ProductoMeta {
  id: number;
  uuid: string | null;
  sku: string;
  name: string;
  description: string | null;
  brand: string | null;
  barcode: string | null;
  status: string | null;
  product_type: string | null;
  track_stock: boolean | null;
  is_parent: boolean | null;
  parent_product_id: number | null;
  variant_data: unknown;
  categoria: string | null;
  /** Precio vigente de venta (0 si no hay). */
  precio: number;
  /** Precio de comparación vigente (0 si no hay). */
  precioComparacion: number;
  precioDesde: string | null;
  precioHasta: string | null;
  /** Disponible = en mano − reservado, sumado en todas las sucursales. */
  stock: number;
  /** URLs públicas, la principal primero. */
  imagenes: string[];
  etiquetas: string[];
}

export interface ContextoMeta {
  moneda: string;
  decimales: number;
  /** Dominio verificado de la tienda (sin protocolo). Sin él no hay `link`. */
  dominio?: string | null;
  nombreOrganizacion?: string | null;
  /** Conversión a otra moneda: precio × factor. */
  factor?: number;
  /** Para `sale_price_effective_date` sin fecha de fin. */
  ahora?: Date;
}

export type MotivoExclusion = 'inactivo' | 'servicio' | 'sinPrecio' | 'sinImagen' | 'padreConVariantes' | 'padreInactivo';

export interface ProductoExcluido {
  id: number;
  sku: string;
  nombre: string;
  motivo: MotivoExclusion;
}

export interface ResultadoFeedMeta {
  filas: FilaMeta[];
  excluidos: ProductoExcluido[];
  resumen: {
    incluidos: number;
    excluidos: number;
    porMotivo: Partial<Record<MotivoExclusion, number>>;
    variantes: number;
    agotados: number;
    sinEnlace: boolean;
  };
}

export function formatearPrecioMeta(monto: number, moneda: string, decimales: number): string {
  const d = Math.max(0, Math.min(4, Math.round(decimales)));
  return `${(Math.round(monto * 10 ** d) / 10 ** d).toFixed(d)} ${moneda.toUpperCase()}`;
}

export function disponibilidadMeta(trackStock: boolean | null | undefined, stock: number): 'in stock' | 'out of stock' {
  if (trackStock === false) return 'in stock';
  return stock > 0 ? 'in stock' : 'out of stock';
}

export function gtinValido(codigo?: string | null): string {
  const c = (codigo ?? '').trim();
  return /^\d{8}$|^\d{12,14}$/.test(c) ? c : '';
}

interface AtributosVariante {
  gender?: string;
  color?: string;
  size?: string;
  age_group?: string;
  material?: string;
  pattern?: string;
}

function asignar(info: AtributosVariante, tipo: string, valor: string): void {
  const t = tipo.toLowerCase();
  if (!valor) return;
  if (t.includes('color') || t.includes('colour')) info.color = valor;
  else if (t.includes('size') || t.includes('talla') || t.includes('tamaño') || t.includes('tamano')) info.size = valor;
  else if (t.includes('gender') || t.includes('género') || t.includes('genero')) info.gender = valor;
  else if (t.includes('age') || t.includes('edad')) info.age_group = valor;
  else if (t.includes('material')) info.material = valor;
  else if (t.includes('pattern') || t.includes('patrón') || t.includes('patron') || t.includes('estampado')) info.pattern = valor;
}

/** `{Color: 'Rojo'}`, `[{type, value}]` o `{attributes: [...]}` → atributos de Meta. */
export function atributosVariante(datos: unknown): AtributosVariante {
  const info: AtributosVariante = {};
  let vd: unknown = datos;
  if (typeof vd === 'string') {
    try {
      vd = JSON.parse(vd);
    } catch {
      return info;
    }
  }
  if (!vd || typeof vd !== 'object') return info;
  const lista = Array.isArray(vd) ? vd : Array.isArray((vd as { attributes?: unknown }).attributes) ? (vd as { attributes: unknown[] }).attributes : null;
  if (lista) {
    for (const a of lista as Array<{ type?: string; name?: string; value?: unknown }>) asignar(info, String(a?.type ?? a?.name ?? ''), String(a?.value ?? ''));
    return info;
  }
  for (const [k, v] of Object.entries(vd as Record<string, unknown>)) {
    if (typeof v === 'string' || typeof v === 'number') asignar(info, k, String(v));
  }
  return info;
}

function rangoOferta(desde: string | null, hasta: string | null, ahora: Date): string {
  if (!desde) return '';
  const inicio = new Date(desde);
  const fin = hasta ? new Date(hasta) : new Date(ahora.getTime() + 365 * 24 * 60 * 60 * 1000);
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime())) return '';
  return `${inicio.toISOString()}/${fin.toISOString()}`;
}

function vacia(): FilaMeta {
  return Object.fromEntries(COLUMNAS_META.map((c) => [c, ''])) as FilaMeta;
}

function fila(p: ProductoMeta, padre: ProductoMeta | null, ctx: ContextoMeta): FilaMeta {
  const factor = ctx.factor ?? 1;
  const precioBase = (p.precio > 0 ? p.precio : padre?.precio ?? 0) * factor;
  const comparacionBase = (p.precio > 0 ? p.precioComparacion : padre?.precioComparacion ?? 0) * factor;
  const hayOferta = comparacionBase > precioBase && precioBase > 0;
  const fuentePrecio = p.precio > 0 ? p : padre ?? p;
  const imagenes = p.imagenes.length ? p.imagenes : padre?.imagenes ?? [];
  const etiquetas = p.etiquetas.length ? p.etiquetas : padre?.etiquetas ?? [];
  const uuid = p.uuid || padre?.uuid || '';
  const titulo = p.name.trim().slice(0, 150);
  const atributos = atributosVariante(p.variant_data);
  const rastrea = p.track_stock ?? padre?.track_stock ?? true;
  const r = vacia();
  r.id = p.sku || String(p.id);
  r.title = titulo;
  r.description = (p.description || padre?.description || titulo).slice(0, 9999);
  r.availability = disponibilidadMeta(rastrea, p.stock);
  r.condition = 'new';
  r.price = formatearPrecioMeta(hayOferta ? comparacionBase : precioBase, ctx.moneda, ctx.decimales);
  r.sale_price = hayOferta ? formatearPrecioMeta(precioBase, ctx.moneda, ctx.decimales) : '';
  r.sale_price_effective_date = hayOferta ? rangoOferta(fuentePrecio.precioDesde, fuentePrecio.precioHasta, ctx.ahora ?? new Date()) : '';
  r.link = ctx.dominio && uuid ? `https://${ctx.dominio}/productos/${uuid}` : '';
  r.image_link = imagenes[0] ?? '';
  r.additional_image_link = imagenes.slice(1, 10).join(',');
  r.brand = p.brand || padre?.brand || ctx.nombreOrganizacion || '';
  r.google_product_category = p.categoria || padre?.categoria || '';
  r.fb_product_category = r.google_product_category;
  r.quantity_to_sell_on_facebook = rastrea === false ? '' : String(Math.max(0, Math.floor(p.stock)));
  r.item_group_id = padre ? padre.sku || String(padre.id) : '';
  r.gender = atributos.gender ?? '';
  r.color = atributos.color ?? '';
  r.size = atributos.size ?? '';
  r.age_group = atributos.age_group ?? 'adult';
  r.material = atributos.material ?? '';
  r.pattern = atributos.pattern ?? '';
  r.gtin = gtinValido(p.barcode);
  r['product_tags[0]'] = etiquetas[0] ?? '';
  r['product_tags[1]'] = etiquetas[1] ?? '';
  return r;
}

/**
 * Filas del catálogo + excluidos con motivo. `productos` es la lista completa
 * de la organización (padres, simples y variantes, de cualquier estado); la
 * función decide.
 */
export function construirFeedMeta(productos: ProductoMeta[], ctx: ContextoMeta): ResultadoFeedMeta {
  const porId = new Map(productos.map((p) => [p.id, p]));
  const hijos = new Map<number, ProductoMeta[]>();
  for (const p of productos) {
    if (p.parent_product_id == null) continue;
    hijos.set(p.parent_product_id, [...(hijos.get(p.parent_product_id) ?? []), p]);
  }
  const activo = (p: ProductoMeta) => (p.status ?? 'active') === 'active';
  const filas: FilaMeta[] = [];
  const excluidos: ProductoExcluido[] = [];
  const excluir = (p: ProductoMeta, motivo: MotivoExclusion) => excluidos.push({ id: p.id, sku: p.sku, nombre: p.name, motivo });
  let variantes = 0;

  const evaluar = (p: ProductoMeta, padre: ProductoMeta | null) => {
    if (!activo(p)) return excluir(p, 'inactivo');
    if (padre && !activo(padre)) return excluir(p, 'padreInactivo');
    if ((p.product_type ?? padre?.product_type) === 'service') return excluir(p, 'servicio');
    const precio = p.precio > 0 ? p.precio : padre?.precio ?? 0;
    if (!(precio > 0)) return excluir(p, 'sinPrecio');
    const imagenes = p.imagenes.length ? p.imagenes : padre?.imagenes ?? [];
    if (!imagenes.length) return excluir(p, 'sinImagen');
    filas.push(fila(p, padre, ctx));
    if (padre) variantes++;
  };

  for (const p of productos) {
    if (p.parent_product_id != null && porId.has(p.parent_product_id)) continue; // se evalúa con su padre
    const propios = hijos.get(p.id) ?? [];
    const hijosActivos = propios.filter(activo);
    if (hijosActivos.length > 0 && activo(p)) {
      excluir(p, 'padreConVariantes');
      for (const h of propios) evaluar(h, p);
    } else {
      evaluar(p, null);
      for (const h of propios) evaluar(h, p);
    }
  }

  const porMotivo: Partial<Record<MotivoExclusion, number>> = {};
  for (const e of excluidos) porMotivo[e.motivo] = (porMotivo[e.motivo] ?? 0) + 1;
  return {
    filas,
    excluidos,
    resumen: {
      incluidos: filas.length,
      excluidos: excluidos.filter((e) => e.motivo !== 'padreConVariantes').length,
      porMotivo,
      variantes,
      agotados: filas.filter((f) => f.availability === 'out of stock').length,
      sinEnlace: !ctx.dominio,
    },
  };
}

function escapar(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** CSV sin BOM (Commerce Manager puede no reconocerlo). */
export function csvMeta(filas: FilaMeta[]): string {
  return [COLUMNAS_META.join(','), ...filas.map((f) => COLUMNAS_META.map((c) => escapar(f[c] ?? '')).join(','))].join('\n');
}
