/**
 * Payload de la RPC `fn_importar_productos_lote` a partir de las filas
 * validadas. Todo lo que la base necesita ya normalizado (unidad, estación,
 * estado, variantes, modificadores); la RPC vuelve a comprobar pertenencia,
 * existencia y reglas de stock con la base real.
 */

import { estacionDesdeTexto, estadoDesdeTexto, parsearModificadores, parsearVariante, separarLista, separarUrls, tipoDesdeTexto, unidadDesdeTexto, type GrupoModificador } from './normalizacion';
import type { FilaValidada, ModoImportacion, OpcionesImportacion } from './tipos';

/** Filas por llamada a la RPC (Figma: «Lotes de 50 filas en una RPC por lote»). */
export const TAMANO_LOTE = 50;
/** Tope duro que acepta la ruta (y la RPC) por llamada. */
export const MAX_FILAS_POR_LOTE = 200;

export interface FilaRpc {
  fila: number;
  sku: string;
  nombre: string;
  /** Solo si el archivo lo trae: al actualizar, lo ausente no se toca. */
  tipo?: 'product' | 'service';
  descripcion?: string;
  categoria?: string;
  unidad?: string;
  codigo_barras?: string;
  marca?: string;
  referencia?: string;
  proveedores: string[];
  precio?: number;
  precio_comparacion?: number;
  costo?: number;
  impuesto?: string;
  rastrear_stock?: boolean;
  stock?: number;
  stock_minimo?: number;
  etiquetas: string[];
  nota?: string;
  sku_padre?: string;
  datos_variante?: Record<string, string>;
  es_padre: boolean;
  estacion?: string | null;
  modificadores: GrupoModificador[];
  estado?: 'active' | 'inactive' | 'discontinued';
  /** Las descarga la ruta del servidor tras la RPC (la RPC las ignora). */
  imagenes: string[];
  /** Variante de la web: copia las imágenes del padre. */
  imagenes_del_padre?: boolean;
}

export interface CuerpoLote {
  modo: ModoImportacion;
  branch_id: number;
  opciones: {
    stock_existentes: OpcionesImportacion['stockExistentes'];
    importar_imagenes: boolean;
    origen: 'archivo' | 'web';
    fuente_url?: string;
  };
  filas: FilaRpc[];
}

const opcional = <T>(v: T | undefined | null | ''): T | undefined => (v === undefined || v === null || v === '' ? undefined : v);

export function filaARpc(v: FilaValidada, opciones: Pick<OpcionesImportacion, 'importarImagenes'>): FilaRpc {
  const f = v.datos;
  const tipo = f.type?.trim() ? tipoDesdeTexto(f.type) : undefined;
  const variante = parsearVariante(f.variantData);
  const esPadre = f.isParent === true;
  return {
    fila: f.fila,
    sku: (f.sku ?? '').trim(),
    nombre: (f.name ?? '').trim(),
    tipo,
    descripcion: opcional(f.description?.trim()),
    categoria: opcional(f.category?.trim()),
    unidad: f.unit?.trim() ? unidadDesdeTexto(f.unit).codigo : tipo === 'service' ? 'SV' : undefined,
    codigo_barras: opcional(f.barcode?.trim()),
    marca: opcional(f.brand?.trim()),
    referencia: opcional(f.reference?.trim()),
    proveedores: separarLista(f.supplier),
    precio: f.price !== undefined && f.price > 0 ? f.price : undefined,
    precio_comparacion: f.comparePrice && f.price && f.comparePrice > f.price ? f.comparePrice : undefined,
    costo: f.cost !== undefined && f.cost > 0 ? f.cost : undefined,
    impuesto: opcional(f.tax?.trim()),
    rastrear_stock: f.trackStock,
    stock: f.stock !== undefined && f.stock > 0 ? f.stock : undefined,
    stock_minimo: f.minLevel !== undefined && f.minLevel >= 0 ? f.minLevel : undefined,
    etiquetas: separarLista(f.tags),
    nota: opcional(f.notes?.trim()),
    sku_padre: opcional(f.parentSku?.trim()),
    datos_variante: variante && Object.keys(variante).length ? variante : undefined,
    es_padre: esPadre,
    estacion: f.station?.trim() ? estacionDesdeTexto(f.station).estacion : undefined,
    modificadores: parsearModificadores(f.modifiers),
    estado: f.status?.trim() ? estadoDesdeTexto(f.status).estado : undefined,
    imagenes: opciones.importarImagenes ? separarUrls(f.imageUrls).validas.slice(0, 10) : [],
    imagenes_del_padre: opciones.importarImagenes && f.imagenesDelPadre ? true : undefined,
  };
}

/**
 * Filas que se envían (sin error, sin «omitir», sin las excluidas a mano),
 * ordenadas: padres, luego simples, luego variantes. Así un padre siempre
 * existe cuando llega el lote de sus variantes.
 */
export function filasAImportar(filas: FilaValidada[], excluidas: Set<string>, opciones: Pick<OpcionesImportacion, 'importarImagenes'>): FilaRpc[] {
  const rango = (f: FilaRpc) => (f.es_padre ? 0 : f.sku_padre ? 2 : 1);
  return filas
    .filter((f) => f.estado !== 'error' && f.accion !== 'omitir' && !excluidas.has(f.id))
    .map((f) => filaARpc(f, opciones))
    .map((f, i) => ({ f, i }))
    .sort((a, b) => rango(a.f) - rango(b.f) || a.i - b.i)
    .map(({ f }) => f);
}

export function dividirEnLotes<T>(filas: T[], tamano = TAMANO_LOTE): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < filas.length; i += tamano) lotes.push(filas.slice(i, i + tamano));
  return lotes;
}

/** La parte de la fila que va a la RPC (sin las URLs, que maneja la ruta). */
export function filaParaRpc(f: FilaRpc): Omit<FilaRpc, 'imagenes' | 'imagenes_del_padre'> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { imagenes, imagenes_del_padre, ...resto } = f;
  return resto;
}
