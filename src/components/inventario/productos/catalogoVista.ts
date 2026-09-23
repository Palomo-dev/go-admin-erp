/**
 * Lo que el catálogo hace EN EL NAVEGADOR sobre la lista ya cargada por
 * `catalogoLotes.ts`: búsqueda rápida, filtros que la RPC no conoce (imagen,
 * tipo, stock, variantes, modificadores), orden por columna y el resumen de
 * stock del subtítulo.
 *
 * La RPC `catalogo_productos_lote` sigue filtrando por búsqueda, categoría y
 * estado; lo de aquí no dispara consultas, así que ordenar o filtrar por
 * imagen no recarga el catálogo.
 *
 * Sin React ni Supabase: lo usan `CatalogoProductos` y sus tests.
 */
import { claveOrdenStock, stockVisibleDe } from './stockVisible';
import type { Producto } from './types';

/** Por debajo de esto el stock es «bajo» (mismo corte que el color de la fila). */
export const UMBRAL_STOCK_BAJO = 5;

export type NivelStockVista = 'sinSeguimiento' | 'sin' | 'bajo' | 'con';

/** Nivel de stock de lo que el usuario VE (sucursal del header o todas). */
export function nivelStock(p: Producto, branchFilter: number | null): NivelStockVista {
  const s = stockVisibleDe(p, branchFilter);
  if (s === null) return 'sinSeguimiento';
  if (s <= 0) return 'sin';
  if (s < UMBRAL_STOCK_BAJO) return 'bajo';
  return 'con';
}

// ─── Filtros del listado (claves de la URL) ─────────────────────────────────

/** Claves de filtro admitidas en la URL (lista blanca de `useListadoServidor`). */
export const CLAVES_FILTRO = ['categoria', 'estado', 'imagen', 'tipo', 'stock', 'variantes', 'modificadores'] as const;
export type ClaveFiltro = (typeof CLAVES_FILTRO)[number];

/** Estados que se mandan a la RPC. Sin estado = todo menos eliminados. */
export const ESTADOS_PRODUCTO = [
  { valor: 'active', etiqueta: 'Activo' },
  { valor: 'inactive', etiqueta: 'Inactivo' },
  { valor: 'discontinued', etiqueta: 'Descontinuado' },
  { valor: 'deleted', etiqueta: 'Eliminado' },
] as const;

export const OPCIONES_IMAGEN = [
  { valor: 'con', etiqueta: 'Con imagen' },
  { valor: 'sin', etiqueta: 'Sin imagen' },
] as const;

export const OPCIONES_TIPO = [
  { valor: 'producto', etiqueta: 'Producto' },
  { valor: 'servicio', etiqueta: 'Servicio' },
] as const;

export const OPCIONES_STOCK = [
  { valor: 'con', etiqueta: 'Con stock' },
  { valor: 'bajo', etiqueta: `Stock bajo (menos de ${UMBRAL_STOCK_BAJO})` },
  { valor: 'sin', etiqueta: 'Sin stock' },
  { valor: 'sinSeguimiento', etiqueta: 'Sin seguimiento' },
] as const;

const etiquetaDe = (opciones: readonly { valor: string; etiqueta: string }[], valor: string) =>
  opciones.find((o) => o.valor === valor)?.etiqueta ?? valor;

/** Estado para la RPC a partir del filtro de la URL (valores fuera de la lista se ignoran). */
export function estadoParaRpc(valor: string | undefined): string | null {
  return ESTADOS_PRODUCTO.some((e) => e.valor === valor) ? (valor as string) : null;
}

/** Categoría para la RPC: solo un entero positivo. */
export function categoriaParaRpc(valor: string | undefined): number | null {
  const n = Number(valor);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export interface ChipCatalogo {
  clave: ClaveFiltro;
  etiqueta: string;
}

/** Chips de los filtros activos, en el orden del panel. */
export function chipsFiltros(
  filtros: Readonly<Record<string, string>>,
  nombreCategoria: (id: string) => string | undefined,
): ChipCatalogo[] {
  const chips: ChipCatalogo[] = [];
  const f = filtros;
  if (f.categoria) chips.push({ clave: 'categoria', etiqueta: `Categoría: ${nombreCategoria(f.categoria) ?? `#${f.categoria}`}` });
  if (f.estado) chips.push({ clave: 'estado', etiqueta: `Estado: ${etiquetaDe(ESTADOS_PRODUCTO, f.estado)}` });
  if (f.imagen) chips.push({ clave: 'imagen', etiqueta: etiquetaDe(OPCIONES_IMAGEN, f.imagen) });
  if (f.tipo) chips.push({ clave: 'tipo', etiqueta: `Tipo: ${etiquetaDe(OPCIONES_TIPO, f.tipo)}` });
  if (f.stock) chips.push({ clave: 'stock', etiqueta: etiquetaDe(OPCIONES_STOCK, f.stock).replace(/ \(.*\)$/, '') });
  if (f.variantes) chips.push({ clave: 'variantes', etiqueta: 'Con variantes' });
  if (f.modificadores) chips.push({ clave: 'modificadores', etiqueta: 'Con modificadores' });
  return chips;
}

// ─── Filtrado en el navegador ───────────────────────────────────────────────

/** Ruta de la imagen principal (la primera marcada como principal, o la primera). */
export function rutaImagenPrincipal(p: Pick<Producto, 'product_images'>): string | null {
  const imagenes = p.product_images;
  if (!Array.isArray(imagenes) || imagenes.length === 0) return null;
  const principal = imagenes.find((i) => i.is_primary) ?? imagenes[0];
  return principal?.storage_path || null;
}

/**
 * «Con imagen» de verdad: tiene ruta y la imagen no falló al cargar (URL rota,
 * 404). Un registro en `product_images` que no carga cuenta como «sin imagen».
 */
export function tieneImagen(p: Producto, imagenesFallidas: ReadonlySet<string>): boolean {
  return rutaImagenPrincipal(p) !== null && !imagenesFallidas.has(String(p.id));
}

const normalizar = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/**
 * Búsqueda rápida sobre lo ya cargado: nombre, SKU, código de barras, marca y
 * referencia, y también SKU y código de las variantes (la RPC encuentra al
 * padre por el código de una variante; aquí igual, para no esconderlo).
 */
export function coincideTexto(p: Producto, termino: string): boolean {
  const t = normalizar(termino.trim());
  if (!t) return true;
  const campos = [p.name, p.sku, p.barcode, p.brand, p.reference];
  for (const h of p.children ?? []) campos.push(h.sku, h.barcode);
  return campos.some((c) => !!c && normalizar(String(c)).includes(t));
}

export interface OpcionesFiltroCliente {
  /** Búsqueda rápida (lo que se lleva escrito y el servidor aún no confirmó). */
  termino?: string;
  filtros: Readonly<Record<string, string>>;
  branchFilter: number | null;
  imagenesFallidas: ReadonlySet<string>;
}

export function filtrarCatalogo(productos: readonly Producto[], o: OpcionesFiltroCliente): Producto[] {
  const { filtros: f, branchFilter, imagenesFallidas } = o;
  const termino = o.termino?.trim() ?? '';
  return productos.filter((p) => {
    if (termino && !coincideTexto(p, termino)) return false;
    if (f.imagen === 'con' && !tieneImagen(p, imagenesFallidas)) return false;
    if (f.imagen === 'sin' && tieneImagen(p, imagenesFallidas)) return false;
    if (f.tipo === 'servicio' && p.product_type !== 'service') return false;
    if (f.tipo === 'producto' && p.product_type === 'service') return false;
    if (f.stock) {
      const n = nivelStock(p, branchFilter);
      // «Con stock» incluye el bajo: hay unidades.
      if (f.stock === 'con' ? n !== 'con' && n !== 'bajo' : n !== f.stock) return false;
    }
    if (f.variantes && !(p.children && p.children.length > 0)) return false;
    if (f.modificadores && !((p.modifier_groups_count ?? 0) > 0)) return false;
    return true;
  });
}

// ─── Orden ──────────────────────────────────────────────────────────────────

export const CAMPOS_ORDEN = ['nombre', 'sku', 'categoria', 'precio', 'margen', 'stock', 'estado', 'creado'] as const;
export type CampoOrden = (typeof CAMPOS_ORDEN)[number];

/** Opciones del «Ordenar por» del panel (móvil, donde no hay cabeceras). */
export const OPCIONES_ORDEN: readonly { campo: CampoOrden; direccion: 'asc' | 'desc'; etiqueta: string }[] = [
  { campo: 'nombre', direccion: 'asc', etiqueta: 'Nombre (A-Z)' },
  { campo: 'sku', direccion: 'asc', etiqueta: 'Código (SKU)' },
  { campo: 'precio', direccion: 'asc', etiqueta: 'Precio: menor a mayor' },
  { campo: 'precio', direccion: 'desc', etiqueta: 'Precio: mayor a menor' },
  { campo: 'stock', direccion: 'asc', etiqueta: 'Stock: menor a mayor' },
  { campo: 'creado', direccion: 'desc', etiqueta: 'Más recientes' },
];

/** Margen bruto en % sobre el precio de venta; `null` sin precio. */
export function margenDe(p: Pick<Producto, 'price' | 'cost'>): number | null {
  if (typeof p.price !== 'number' || p.price <= 0 || typeof p.cost !== 'number') return null;
  return ((p.price - p.cost) / p.price) * 100;
}

const colador = new Intl.Collator('es', { sensitivity: 'base', numeric: true });

/**
 * Ordena una copia. «Sin seguimiento» (stock) y los productos sin margen van
 * siempre al final, suba o baje el orden. Empates por nombre y luego por id,
 * para que la tabla no baile al llegar los lotes.
 */
export function ordenarCatalogo(
  productos: readonly Producto[],
  orden: { campo: string; direccion: 'asc' | 'desc' } | null,
  branchFilter: number | null,
): Producto[] {
  const lista = [...productos];
  if (!orden) return lista;
  const signo = orden.direccion === 'asc' ? 1 : -1;
  const alFinal = orden.direccion === 'asc' ? Infinity : -Infinity;

  const clave = (p: Producto): string | number => {
    switch (orden.campo as CampoOrden) {
      case 'sku':
        return p.sku ?? '';
      case 'categoria':
        return p.category?.name ?? '';
      case 'precio':
        return p.price ?? 0;
      case 'margen':
        return margenDe(p) ?? alFinal;
      case 'stock':
        return claveOrdenStock(p, branchFilter, orden.direccion);
      case 'estado':
        return p.status ?? '';
      case 'creado':
        return p.created_at ?? '';
      case 'nombre':
      default:
        return p.name ?? '';
    }
  };

  const conClave = lista.map((p) => ({ p, k: clave(p) }));
  conClave.sort((a, b) => {
    let c: number;
    if (typeof a.k === 'number' && typeof b.k === 'number') {
      c = a.k === b.k ? 0 : a.k < b.k ? -1 : 1;
    } else {
      c = colador.compare(String(a.k), String(b.k));
    }
    if (c !== 0) return c * signo;
    const n = colador.compare(a.p.name ?? '', b.p.name ?? '');
    if (n !== 0) return n;
    return Number(a.p.id) - Number(b.p.id);
  });
  return conClave.map((x) => x.p);
}

// ─── Resumen del subtítulo ──────────────────────────────────────────────────

/** Productos sin stock y con stock bajo en lo que ve el usuario (sin «sin seguimiento»). */
export function resumenStock(productos: readonly Producto[], branchFilter: number | null): { sinStock: number; bajo: number } {
  let sinStock = 0;
  let bajo = 0;
  for (const p of productos) {
    const n = nivelStock(p, branchFilter);
    if (n === 'sin') sinStock++;
    else if (n === 'bajo') bajo++;
  }
  return { sinStock, bajo };
}

/** Selección (ids de la tabla, texto) → ids numéricos para los servicios masivos. */
export function idsNumericos(seleccion: Iterable<string>): number[] {
  const salida: number[] = [];
  for (const id of seleccion) {
    const n = Number(id);
    if (Number.isInteger(n) && n > 0) salida.push(n);
  }
  return salida;
}
