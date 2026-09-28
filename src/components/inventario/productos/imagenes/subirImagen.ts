import { supabase } from '@/lib/supabase/config';
import { getBucketName, getPublicUrl } from '@/lib/supabase/imageUtils';
import { rutaImagenProducto } from '../logica/formularioProducto';

/**
 * Imágenes de producto: validación, subida, IA y biblioteca compartida. Lo
 * usan el detalle (escribe en `product_images` al momento) y el formulario
 * (solo arma `ImagenForm[]`; la subida real la hace `ProductoForm` al guardar).
 *
 * Buckets: `product-images` para `products/…`, `productos/…` y
 * `ai-generated/…` (lo que guarda la API de IA); `organization_images` para la
 * biblioteca (`shared_images`, rutas `{org}/…`).
 */

export const BUCKET_PRODUCTOS = 'product-images';
export const TAMANO_MAXIMO_IMAGEN = 5 * 1024 * 1024;
export const TIPOS_IMAGEN = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
export const ACEPTAR_IMAGENES = TIPOS_IMAGEN.join(',');

export type ErrorArchivoImagen = 'tipo' | 'tamano';

/** Motivo por el que un archivo no se acepta (o null si sirve). */
export function validarArchivoImagen(archivo: Pick<File, 'type' | 'size'>): ErrorArchivoImagen | null {
  if (!(TIPOS_IMAGEN as readonly string[]).includes(archivo.type)) return 'tipo';
  if (archivo.size > TAMANO_MAXIMO_IMAGEN) return 'tamano';
  return null;
}

/** Separa los archivos válidos de los rechazados y respeta el cupo. */
export function repartirArchivos(
  archivos: readonly File[],
  cupo: number,
): { validos: File[]; rechazados: { nombre: string; motivo: ErrorArchivoImagen }[]; sobrantes: number } {
  const validos: File[] = [];
  const rechazados: { nombre: string; motivo: ErrorArchivoImagen }[] = [];
  for (const a of archivos) {
    const motivo = validarArchivoImagen(a);
    if (motivo) rechazados.push({ nombre: a.name, motivo });
    else validos.push(a);
  }
  const libre = Math.max(0, cupo);
  return { validos: validos.slice(0, libre), rechazados, sobrantes: Math.max(0, validos.length - libre) };
}

function aleatorio(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/** Ruta del bucket para una ruta guardada (reconoce también `ai-generated/`). */
export function bucketDeRuta(ruta: string): string {
  return ruta.startsWith('ai-generated/') ? BUCKET_PRODUCTOS : getBucketName(ruta);
}

/** URL pública de una ruta guardada en `product_images` o `shared_images`. */
export function urlImagen(ruta: string | null | undefined): string {
  if (!ruta) return '';
  if (/^https?:\/\//.test(ruta)) return ruta;
  if (ruta.startsWith('ai-generated/')) {
    return supabase.storage.from(BUCKET_PRODUCTOS).getPublicUrl(ruta).data?.publicUrl ?? '';
  }
  return getPublicUrl(ruta);
}

/** Sube un archivo a `product-images` con `rutaImagenProducto` y devuelve la ruta. */
export async function subirArchivoProducto(organizacionId: number, archivo: File): Promise<string> {
  const ruta = rutaImagenProducto(organizacionId, archivo.name, aleatorio());
  const { error } = await supabase.storage
    .from(BUCKET_PRODUCTOS)
    .upload(ruta, archivo, { cacheControl: '3600', upsert: false, contentType: archivo.type || undefined });
  if (error) throw error;
  return ruta;
}

// ── Generación con IA (/api/ai-assistant/generate-image) ──────────────────

export interface ImagenGenerada {
  /** Ruta en `product-images` (products/{org}/…) o URL si no se pudo guardar. */
  storage_path?: string;
  /** Archivo por subir cuando la API solo devolvió una URL temporal. */
  file?: File;
  /** Para la miniatura. */
  vista: string;
}

export class ErrorGenerarImagen extends Error {
  constructor(
    public readonly estado: number,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = 'ErrorGenerarImagen';
  }
}

interface RespuestaApiImagen {
  imageUrl?: string;
  storagePath?: string;
  isTemporary?: boolean;
  error?: string;
}

/**
 * Pide la imagen a la API (la organización sale de la sesión; cuesta créditos
 * de IA). Si la API la guardó en `ai-generated/…`, se mueve a
 * `products/{org}/…` para que la resuelva `getPublicUrl` en todo el sistema
 * (catálogo, POS, tienda). Si solo llegó una URL temporal, se descarga como
 * archivo para subirla con las demás; si ni eso, se guarda la URL.
 */
export async function generarImagenIA(
  organizacionId: number,
  datos: { nombre: string; descripcion?: string },
): Promise<ImagenGenerada> {
  const res = await fetch('/api/ai-assistant/generate-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ productName: datos.nombre, description: datos.descripcion ?? '' }),
  });
  const cuerpo = (await res.json().catch(() => ({}))) as RespuestaApiImagen;
  if (!res.ok || !cuerpo.imageUrl) {
    throw new ErrorGenerarImagen(res.status, cuerpo.error ?? '');
  }

  if (cuerpo.storagePath && !cuerpo.isTemporary) {
    const destino = rutaImagenProducto(organizacionId, 'ia.png', aleatorio());
    const { error } = await supabase.storage.from(BUCKET_PRODUCTOS).move(cuerpo.storagePath, destino);
    if (!error) return { storage_path: destino, vista: urlImagen(destino) };
    return { storage_path: cuerpo.storagePath, vista: urlImagen(cuerpo.storagePath) };
  }

  try {
    const img = await fetch(cuerpo.imageUrl);
    if (!img.ok) throw new Error(String(img.status));
    const blob = await img.blob();
    const file = new File([blob], `ia-${Date.now()}.png`, { type: blob.type || 'image/png' });
    return { file, vista: URL.createObjectURL(file) };
  } catch {
    return { storage_path: cuerpo.imageUrl, vista: cuerpo.imageUrl };
  }
}

/** Texto plano de una descripción que puede venir en HTML (editor enriquecido). */
export function textoPlano(html: string | null | undefined): string {
  return (html ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 600);
}

// ── Biblioteca compartida (shared_images) ──────────────────────────────────

export interface ImagenBiblioteca {
  id: number;
  storage_path: string;
  file_name: string;
  is_public: boolean;
  tags: string[];
  organization_id: number | null;
  url: string;
}

/** Imágenes de la organización y públicas (RLS `shared_images_lectura`). */
export async function cargarBiblioteca(organizacionId: number): Promise<ImagenBiblioteca[]> {
  const { data, error } = await supabase
    .from('shared_images')
    .select('id, storage_path, file_name, is_public, tags, organization_id')
    .or(`organization_id.eq.${organizacionId},is_public.eq.true`)
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw error;
  return ((data ?? []) as Omit<ImagenBiblioteca, 'url'>[]).map((i) => ({
    ...i,
    tags: i.tags ?? [],
    url: urlImagen(i.storage_path),
  }));
}

// ── Borrado del objeto ─────────────────────────────────────────────────────

/**
 * Borra el objeto del storage solo si ya ninguna fila lo usa: ni otra imagen
 * de producto ni la biblioteca. Las URL externas y las imágenes de la
 * biblioteca nunca se borran desde un producto. Devuelve si lo borró.
 */
export async function borrarObjetoSiHuerfano(ruta: string, sharedImageId: number | null | undefined): Promise<boolean> {
  if (!ruta || sharedImageId || /^https?:\/\//.test(ruta)) return false;
  const [enProductos, enBiblioteca] = await Promise.all([
    supabase.from('product_images').select('id', { count: 'exact', head: true }).eq('storage_path', ruta),
    supabase.from('shared_images').select('id', { count: 'exact', head: true }).eq('storage_path', ruta),
  ]);
  if (enProductos.error || enBiblioteca.error) return false;
  if ((enProductos.count ?? 0) > 0 || (enBiblioteca.count ?? 0) > 0) return false;
  const { error } = await supabase.storage.from(bucketDeRuta(ruta)).remove([ruta]);
  return !error;
}
