import { supabase } from '@/lib/supabase/config';
import { ilikeAnyOf } from '@/lib/utils/postgrestFilters';
import { vigente } from '@/lib/services/documentos/vigencia';
import { urlImagen, bucketDeRuta } from '@/components/inventario/productos/imagenes/subirImagen';
import {
  BUCKET_BIBLIOTECA,
  dimensionesValidas,
  motivoRechazo,
  rutaBiblioteca,
  tipoPorExtension,
  type Dimensiones,
  type ParametrosListado,
} from './imagenesLogica';

/**
 * Biblioteca de imágenes (`/app/inventario/imagenes`). Todo pasa por las RPC
 * de la migración `20260929020000_inv_b6_imagenes`: la organización la valida
 * `fn_assert_acceso_org` y las escrituras exigen el permiso de catálogo en el
 * servidor (`fn_productos_exigir_permiso`). El navegador solo sube y borra los
 * archivos del storage; las filas nunca se escriben desde aquí.
 */

export interface ImagenBiblioteca {
  id: number;
  storage_path: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  dimensions: Dimensiones | null;
  is_public: boolean;
  alt_text: string | null;
  created_at: string | null;
  /** Productos (distintos) que la usan. */
  productos: number;
  url: string;
}

export interface ImagenDeProducto {
  id: number;
  storage_path: string;
  alt_text: string | null;
  is_primary: boolean;
  created_at: string | null;
  product_id: number;
  product_uuid: string;
  product_name: string;
  product_sku: string | null;
  url: string;
}

export interface ResumenImagenes {
  biblioteca: number;
  de_productos: number;
  total: number;
  sin_usar: number;
  publicas: number;
  productos_sin_imagen: number;
}

export interface UsoImagen {
  product_image_id: number;
  product_id: number;
  product_uuid: string;
  nombre: string;
  sku: string | null;
  principal: boolean;
}

export interface DetalleImagen extends Omit<ImagenBiblioteca, 'productos'> {
  autor: string | null;
  productos: number;
  principal_de: number;
  usada_en: UsoImagen[];
}

export interface ProductoElegible {
  id: number;
  uuid: string;
  nombre: string;
  sku: string | null;
  precio: number | null;
  esPadre: boolean;
  imagen: string | null;
}

type Pagina<T> = { total: number; filas: T[] };

function aBiblioteca(f: Record<string, unknown>): ImagenBiblioteca {
  const ruta = String(f.storage_path ?? '');
  return {
    id: Number(f.id),
    storage_path: ruta,
    file_name: String(f.file_name ?? ''),
    file_size: Number(f.file_size) || 0,
    mime_type: String(f.mime_type ?? ''),
    dimensions: dimensionesValidas(f.dimensions),
    is_public: Boolean(f.is_public),
    alt_text: (f.alt_text as string | null) ?? null,
    created_at: (f.created_at as string | null) ?? null,
    productos: Number(f.productos) || 0,
    url: urlImagen(ruta),
  };
}

function aDeProducto(f: Record<string, unknown>): ImagenDeProducto {
  const ruta = String(f.storage_path ?? '');
  return {
    id: Number(f.id),
    storage_path: ruta,
    alt_text: (f.alt_text as string | null) ?? null,
    is_primary: Boolean(f.is_primary),
    created_at: (f.created_at as string | null) ?? null,
    product_id: Number(f.product_id),
    product_uuid: String(f.product_uuid ?? ''),
    product_name: String(f.product_name ?? ''),
    product_sku: (f.product_sku as string | null) ?? null,
    url: urlImagen(ruta),
  };
}

function aDetalle(d: Record<string, unknown>): DetalleImagen {
  const base = aBiblioteca(d);
  return {
    ...base,
    autor: (d.autor as string | null) ?? null,
    productos: Number(d.productos) || 0,
    principal_de: Number(d.principal_de) || 0,
    usada_en: ((d.usada_en as Record<string, unknown>[] | null) ?? []).map((u) => ({
      product_image_id: Number(u.product_image_id),
      product_id: Number(u.product_id),
      product_uuid: String(u.product_uuid ?? ''),
      nombre: String(u.nombre ?? ''),
      sku: (u.sku as string | null) ?? null,
      principal: Boolean(u.principal),
    })),
  };
}

export async function resumenImagenes(org: number): Promise<ResumenImagenes> {
  const { data, error } = await supabase.rpc('fn_imagenes_resumen', { p_org: org });
  if (error) throw error;
  const r = (data ?? {}) as Partial<Record<keyof ResumenImagenes, number>>;
  return {
    biblioteca: Number(r.biblioteca) || 0,
    de_productos: Number(r.de_productos) || 0,
    total: Number(r.total) || 0,
    sin_usar: Number(r.sin_usar) || 0,
    publicas: Number(r.publicas) || 0,
    productos_sin_imagen: Number(r.productos_sin_imagen) || 0,
  };
}

export async function listarBiblioteca(org: number, p: ParametrosListado): Promise<Pagina<ImagenBiblioteca>> {
  const { data, error } = await supabase.rpc('fn_imagenes_listado', { p_org: org, ...p, p_origen: 'biblioteca' });
  if (error) throw error;
  const r = (data ?? {}) as { total?: number; filas?: Record<string, unknown>[] };
  return { total: Number(r.total) || 0, filas: (r.filas ?? []).map(aBiblioteca) };
}

export async function listarDeProductos(org: number, p: ParametrosListado): Promise<Pagina<ImagenDeProducto>> {
  const { data, error } = await supabase.rpc('fn_imagenes_listado', { p_org: org, ...p, p_origen: 'productos' });
  if (error) throw error;
  const r = (data ?? {}) as { total?: number; filas?: Record<string, unknown>[] };
  return { total: Number(r.total) || 0, filas: (r.filas ?? []).map(aDeProducto) };
}

export async function detalleImagen(org: number, id: number): Promise<DetalleImagen> {
  const { data, error } = await supabase.rpc('fn_imagen_detalle', { p_org: org, p_id: id });
  if (error) throw error;
  return aDetalle((data ?? {}) as Record<string, unknown>);
}

export async function actualizarImagen(
  org: number,
  id: number,
  datos: { nombre: string; textoAlternativo: string; publica: boolean },
): Promise<DetalleImagen> {
  const { data, error } = await supabase.rpc('fn_imagen_actualizar', {
    p_org: org,
    p_id: id,
    p_file_name: datos.nombre,
    p_alt_text: datos.textoAlternativo,
    p_is_public: datos.publica,
  });
  if (error) throw error;
  return aDetalle((data ?? {}) as Record<string, unknown>);
}

export async function cambiarVisibilidad(org: number, ids: readonly number[], publica: boolean): Promise<number> {
  const { data, error } = await supabase.rpc('fn_imagenes_visibilidad', { p_org: org, p_ids: [...ids], p_publica: publica });
  if (error) throw error;
  return Number(data) || 0;
}

export async function asignarAProductos(
  org: number,
  id: number,
  productos: readonly number[],
  principal: boolean,
): Promise<{ asignados: number; ya_la_tenian: number }> {
  const { data, error } = await supabase.rpc('fn_imagen_asignar_productos', {
    p_org: org,
    p_id: id,
    p_productos: [...productos],
    p_principal: principal,
  });
  if (error) throw error;
  const r = (data ?? {}) as { asignados?: number; ya_la_tenian?: number };
  return { asignados: Number(r.asignados) || 0, ya_la_tenian: Number(r.ya_la_tenian) || 0 };
}

/**
 * Borra las imágenes (el servidor las quita de los productos y reasigna la
 * principal) y después los archivos que ya nadie usa. Un archivo que no se
 * pudo borrar del storage no deshace el borrado: queda huérfano y se avisa en
 * la consola.
 */
export async function eliminarImagenes(
  org: number,
  ids: readonly number[],
): Promise<{ eliminadas: number; quitadas_de_productos: number }> {
  const { data, error } = await supabase.rpc('fn_imagenes_eliminar', { p_org: org, p_ids: [...ids] });
  if (error) throw error;
  const r = (data ?? {}) as { eliminadas?: number; quitadas_de_productos?: number; rutas?: string[] };
  const porBucket = new Map<string, string[]>();
  for (const ruta of r.rutas ?? []) {
    if (/^https?:\/\//.test(ruta)) continue;
    const bucket = bucketDeRuta(ruta);
    porBucket.set(bucket, [...(porBucket.get(bucket) ?? []), ruta]);
  }
  for (const [bucket, rutas] of porBucket) {
    const { error: e } = await supabase.storage.from(bucket).remove(rutas);
    if (e) console.warn('No se pudieron borrar del storage:', rutas, e.message);
  }
  return { eliminadas: Number(r.eliminadas) || 0, quitadas_de_productos: Number(r.quitadas_de_productos) || 0 };
}

// ─── Subida con progreso ───────────────────────────────────────────────────

function aleatorio(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function leerDimensiones(archivo: File): Promise<Dimensiones | null> {
  return new Promise((resolve) => {
    if (typeof Image === 'undefined' || typeof URL === 'undefined') return resolve(null);
    const url = URL.createObjectURL(archivo);
    const img = new Image();
    img.onload = () => {
      resolve(dimensionesValidas({ width: img.naturalWidth, height: img.naturalHeight }));
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve(null);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

/**
 * Sube al storage con XHR para informar el avance real (supabase-js no lo
 * da). Usa la sesión del usuario: las políticas del bucket se aplican igual.
 */
async function subirConAvance(ruta: string, archivo: File, tipo: string, onAvance: (pct: number) => void): Promise<void> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const clave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!base || !token || typeof XMLHttpRequest === 'undefined') {
    const { error } = await supabase.storage.from(BUCKET_BIBLIOTECA).upload(ruta, archivo, { contentType: tipo, upsert: false });
    if (error) throw error;
    onAvance(100);
    return;
  }
  const destino = `${base}/storage/v1/object/${BUCKET_BIBLIOTECA}/${ruta.split('/').map(encodeURIComponent).join('/')}`;
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', destino);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    if (clave) xhr.setRequestHeader('apikey', clave);
    xhr.setRequestHeader('Content-Type', tipo);
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.setRequestHeader('cache-control', '3600');
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) onAvance(Math.min(99, Math.round((ev.loaded / ev.total) * 100)));
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`storage ${xhr.status}`)));
    xhr.onerror = () => reject(new Error('red'));
    xhr.send(archivo);
  });
  onAvance(100);
}

export class ErrorSubida extends Error {
  constructor(
    public readonly motivo: 'formato' | 'tamano' | 'subida' | 'registro',
    public readonly causa?: unknown,
  ) {
    super(motivo);
    this.name = 'ErrorSubida';
  }
}

/** Sube un archivo y lo registra en la biblioteca. Si el registro falla, borra el archivo (sin huérfanos). */
export async function subirImagen(org: number, archivo: File, onAvance: (pct: number) => void): Promise<DetalleImagen> {
  const rechazo = motivoRechazo(archivo);
  if (rechazo) throw new ErrorSubida(rechazo);
  const tipo = archivo.type || tipoPorExtension(archivo.name);
  const ruta = rutaBiblioteca(org, archivo.name, aleatorio());
  const [dimensiones] = await Promise.all([
    leerDimensiones(archivo),
    subirConAvance(ruta, archivo, tipo, onAvance).catch((e) => {
      throw new ErrorSubida('subida', e);
    }),
  ]);
  const { data, error } = await supabase.rpc('fn_imagen_registrar', {
    p_org: org,
    p_storage_path: ruta,
    p_file_name: archivo.name,
    p_file_size: archivo.size,
    p_mime_type: tipo,
    p_dimensions: dimensiones,
    p_alt_text: null,
  });
  if (error) {
    await supabase.storage.from(BUCKET_BIBLIOTECA).remove([ruta]);
    throw new ErrorSubida('registro', error);
  }
  return aDetalle((data ?? {}) as Record<string, unknown>);
}

/**
 * Registra en la biblioteca una imagen generada con IA (ya guardada por
 * `generarImagenIA` en `products/{org}/…`).
 */
export async function registrarGenerada(org: number, ruta: string, nombre: string, tamano: number, tipo: string): Promise<DetalleImagen> {
  const { data, error } = await supabase.rpc('fn_imagen_registrar', {
    p_org: org,
    p_storage_path: ruta,
    p_file_name: nombre,
    p_file_size: tamano,
    p_mime_type: tipo,
    p_dimensions: null,
    p_alt_text: null,
  });
  if (error) throw error;
  return aDetalle((data ?? {}) as Record<string, unknown>);
}

// ─── Productos para «Asignar a productos» y el filtro «Producto» ───────────

type FilaProducto = {
  id: number;
  uuid: string;
  name: string;
  sku: string | null;
  is_parent: boolean | null;
  product_prices: { price: number | string; effective_from: string | null; effective_to: string | null }[] | null;
  product_images: { storage_path: string | null; is_primary: boolean | null }[] | null;
};

/**
 * Productos del catálogo por nombre, SKU o código (padres incluidos: la foto
 * del producto con variantes va en el padre). Sin eliminados.
 */
export async function buscarProductos(org: number, texto: string, senal?: AbortSignal): Promise<ProductoElegible[]> {
  let q = supabase
    .from('products')
    .select('id, uuid, name, sku, is_parent, product_prices(price, effective_from, effective_to), product_images(storage_path, is_primary)')
    .eq('organization_id', org)
    .neq('status', 'deleted')
    .order('name')
    .limit(20);
  const filtro = ilikeAnyOf(['name', 'sku', 'barcode'], texto);
  if (filtro) q = q.or(filtro);
  if (senal) q = q.abortSignal(senal);
  const { data, error } = await q;
  if (error) throw error;
  return ((data ?? []) as unknown as FilaProducto[]).map((p) => {
    const precio = vigente(p.product_prices)?.price;
    const principal = (p.product_images ?? []).find((i) => i.is_primary) ?? (p.product_images ?? [])[0];
    return {
      id: Number(p.id),
      uuid: String(p.uuid),
      nombre: p.name,
      sku: p.sku,
      precio: precio === undefined || precio === null ? null : Number(precio),
      esPadre: Boolean(p.is_parent),
      imagen: principal?.storage_path ? urlImagen(principal.storage_path) : null,
    };
  });
}

export async function productoPorId(org: number, id: number): Promise<ProductoElegible | null> {
  const { data, error } = await supabase.from('products').select('id, uuid, name, sku, is_parent').eq('organization_id', org).eq('id', id).maybeSingle();
  if (error || !data) return null;
  const p = data as { id: number; uuid: string; name: string; sku: string | null; is_parent: boolean | null };
  return { id: p.id, uuid: p.uuid, nombre: p.name, sku: p.sku, precio: null, esPadre: Boolean(p.is_parent), imagen: null };
}
