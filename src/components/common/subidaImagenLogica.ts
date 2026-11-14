/**
 * Reglas puras de la subida de imágenes (sin Supabase ni React), compartidas
 * por `subidaImagen.ts`, `ImageUploader` y `SubidaImagenUnica`:
 * `src/components/common/__tests__/subidaImagenLogica.test.ts`.
 */
export type ErrorImagen = { tipo: 'formato' } | { tipo: 'tamano'; mb: number };

/** `null` si el archivo sirve; si no, por qué. */
export function validarImagen(archivo: Pick<File, 'type' | 'size'>, tipos: readonly string[], maxMB: number): ErrorImagen | null {
  if (!tipos.includes(archivo.type)) return { tipo: 'formato' };
  const mb = archivo.size / (1024 * 1024);
  if (mb > maxMB) return { tipo: 'tamano', mb: Math.round(mb * 10) / 10 };
  return null;
}

/** «Logo Tienda (1).PNG» → «logo-tienda-1.png»: solo minúsculas, dígitos, punto, guion y guion bajo. */
export function nombreSeguro(nombre: string): string {
  const punto = nombre.lastIndexOf('.');
  const base = (punto > 0 ? nombre.slice(0, punto) : nombre)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  const ext = punto > 0 ? nombre.slice(punto + 1).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) : '';
  return `${base || 'imagen'}${ext ? `.${ext}` : ''}`;
}

/**
 * Ruta del objeto a partir de su URL pública
 * (`<supabase>/storage/v1/object/public/<bucket>/<ruta>`). `null` si la URL es
 * de otro sitio o de otro bucket.
 */
export function rutaEnBucket(url: string, bucket: string, supabaseUrl: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL): string | null {
  if (!url || !supabaseUrl) return null;
  try {
    const u = new URL(url);
    const base = new URL(supabaseUrl);
    if (u.origin !== base.origin) return null;
    const prefijo = `/storage/v1/object/public/${bucket}/`;
    if (!u.pathname.startsWith(prefijo)) return null;
    const ruta = decodeURIComponent(u.pathname.slice(prefijo.length));
    return ruta && !ruta.split('/').includes('..') ? ruta : null;
  } catch {
    return null;
  }
}
