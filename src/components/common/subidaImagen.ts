/**
 * Subida de imágenes a Supabase Storage: una sola lógica para `ImageUploader`
 * (formularios de sucursal, categoría, proveedor…) y para la subida de un solo
 * archivo del chat del sitio web (`SubidaImagenUnica`). Validar, armar la ruta,
 * subir y borrar viven aquí; las pantallas solo ponen la interfaz.
 *
 * - `validarImagen`: tipo y tamaño en el navegador, antes de subir.
 * - `subirImagen`: sube con `supabase.storage`; si se pide el avance
 *   (`onProgreso`) o poder cancelar (`signal`), sube con XHR al mismo endpoint
 *   y con el mismo cuerpo que arma `@supabase/storage-js` (`POST
 *   /storage/v1/object/<bucket>/<ruta>`, FormData con `cacheControl` y el
 *   archivo), porque storage-js no informa avance ni acepta cancelar.
 * - `rutaEnBucket`: de la URL pública a la ruta del objeto (para borrarlo).
 */
import { supabase } from '@/lib/supabase/config';

export { validarImagen, nombreSeguro, rutaEnBucket, type ErrorImagen } from './subidaImagenLogica';

export interface OpcionesSubida {
  bucket: string;
  /** Ruta completa del objeto dentro del bucket. */
  ruta: string;
  archivo: File;
  /** 0–1. */
  onProgreso?: (fraccion: number) => void;
  signal?: AbortSignal;
}

export class SubidaCancelada extends Error {
  constructor() {
    super('Subida cancelada');
    this.name = 'SubidaCancelada';
  }
}

/** Sube el archivo y devuelve su URL pública. */
export async function subirImagen({ bucket, ruta, archivo, onProgreso, signal }: OpcionesSubida): Promise<string> {
  if (!onProgreso && !signal) {
    const { error } = await supabase.storage.from(bucket).upload(ruta, archivo, { cacheControl: '3600', upsert: false });
    if (error) throw error;
  } else {
    await subirConAvance(bucket, ruta, archivo, onProgreso, signal);
  }
  return supabase.storage.from(bucket).getPublicUrl(ruta).data.publicUrl;
}

async function subirConAvance(bucket: string, ruta: string, archivo: File, onProgreso?: (f: number) => void, signal?: AbortSignal): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error('Falta la configuración de Supabase');
  if (signal?.aborted) throw new SubidaCancelada();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Sin sesión');

  const cuerpo = new FormData();
  cuerpo.append('cacheControl', '3600');
  cuerpo.append('', archivo);
  const destino = `${url.replace(/\/+$/, '')}/storage/v1/object/${bucket}/${ruta.split('/').map(encodeURIComponent).join('/')}`;

  await new Promise<void>((resolver, rechazar) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', destino);
    xhr.setRequestHeader('authorization', `Bearer ${token}`);
    xhr.setRequestHeader('apikey', anon);
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgreso) onProgreso(Math.min(1, e.loaded / e.total));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolver();
      let mensaje = `Error ${xhr.status} al subir la imagen`;
      try {
        const r = JSON.parse(xhr.responseText) as { message?: string; error?: string };
        mensaje = r.message || r.error || mensaje;
      } catch {
        /* respuesta sin JSON */
      }
      rechazar(new Error(mensaje));
    };
    xhr.onerror = () => rechazar(new Error('No hay conexión para subir la imagen'));
    xhr.onabort = () => rechazar(new SubidaCancelada());
    signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(cuerpo);
  });
}

/** Borra objetos del bucket. RLS solo deja borrar lo que subió la misma persona: el fallo se devuelve, no se lanza. */
export async function borrarImagenes(bucket: string, rutas: readonly string[]): Promise<{ error: Error | null }> {
  if (rutas.length === 0) return { error: null };
  const { error } = await supabase.storage.from(bucket).remove([...rutas]);
  return { error: error ?? null };
}
