import { supabase } from '@/lib/supabase/config';
import { getAvatarUrl } from '@/lib/supabase/imageUtils';

/**
 * Datos de las notas del producto (product_notes + product_note_files).
 * RLS por pertenencia a la organización (migración 20260924100000 §3); los
 * adjuntos van al bucket PRIVADO `product-documents`, cuya carpeta raíz es el
 * id de la organización (la política de Storage lo exige), y se descargan con
 * URL firmada.
 */
export const BUCKET_NOTAS = 'product-documents';
/** Tope por archivo (el bucket no fija uno; evita subidas absurdas desde el navegador). */
export const MAX_BYTES_ADJUNTO = 20 * 1024 * 1024;

export interface ArchivoNota {
  id: number;
  nombre: string;
  tamano: number;
  url: string;
  rutaStorage: string;
}

export interface AutorNota {
  nombre: string | null;
  email: string | null;
  avatar: string | null;
  rol: string | null;
}

export interface NotaProducto {
  id: number;
  userId: string;
  contenido: string;
  creada: string | null;
  fijada: boolean;
  fijadaEn: string | null;
  editadaEn: string | null;
  archivos: ArchivoNota[];
  autor: AutorNota;
}

interface FilaNota {
  id: number;
  user_id: string;
  content: string;
  created_at: string | null;
  is_pinned: boolean | null;
  pinned_at: string | null;
  edited_at: string | null;
  product_note_files: { id: number; name: string; size: number; url: string | null; storage_path: string | null }[] | null;
}

interface FilaPerfil {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  avatar_url: string | null;
}

interface FilaMiembro {
  user_id: string;
  roles: { name: string } | { name: string }[] | null;
}

/** Fijadas primero (la más recién fijada arriba) y luego de la más nueva a la más vieja. */
export function ordenarNotas(notas: readonly NotaProducto[]): NotaProducto[] {
  const t = (v: string | null) => (v ? new Date(v).getTime() : 0);
  return [...notas].sort((a, b) => {
    if (a.fijada !== b.fijada) return a.fijada ? -1 : 1;
    if (a.fijada && b.fijada && t(a.fijadaEn) !== t(b.fijadaEn)) return t(b.fijadaEn) - t(a.fijadaEn);
    return t(b.creada) - t(a.creada) || b.id - a.id;
  });
}

export async function cargarNotas(organizacionId: number, productId: number): Promise<NotaProducto[]> {
  const { data, error } = await supabase
    .from('product_notes')
    .select('id, user_id, content, created_at, is_pinned, pinned_at, edited_at, product_note_files(id, name, size, url, storage_path)')
    .eq('product_id', productId)
    .eq('organization_id', organizacionId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  const filas = (data ?? []) as unknown as FilaNota[];
  const usuarios = Array.from(new Set(filas.map((n) => n.user_id).filter(Boolean)));

  const perfiles = new Map<string, FilaPerfil>();
  const roles = new Map<string, string>();
  if (usuarios.length > 0) {
    const [p, m] = await Promise.all([
      supabase.from('profiles').select('id, first_name, last_name, email, avatar_url').in('id', usuarios),
      supabase.from('organization_members').select('user_id, roles(name)').eq('organization_id', organizacionId).in('user_id', usuarios),
    ]);
    // Sin perfil o sin rol la nota se sigue mostrando («Usuario desconocido»).
    for (const f of ((p.data ?? []) as FilaPerfil[])) perfiles.set(f.id, f);
    for (const f of ((m.data ?? []) as unknown as FilaMiembro[])) {
      const r = Array.isArray(f.roles) ? f.roles[0] : f.roles;
      if (r?.name) roles.set(f.user_id, r.name);
    }
  }

  return ordenarNotas(
    filas.map((n) => {
      const perfil = perfiles.get(n.user_id);
      const nombre = perfil ? `${perfil.first_name ?? ''} ${perfil.last_name ?? ''}`.trim() || null : null;
      return {
        id: n.id,
        userId: n.user_id,
        contenido: n.content,
        creada: n.created_at,
        fijada: !!n.is_pinned,
        fijadaEn: n.pinned_at,
        editadaEn: n.edited_at,
        archivos: (n.product_note_files ?? [])
          .map((a) => ({ id: a.id, nombre: a.name, tamano: Number(a.size) || 0, url: a.url ?? '', rutaStorage: a.storage_path ?? '' }))
          .sort((a, b) => a.id - b.id),
        autor: {
          nombre,
          email: perfil?.email ?? null,
          avatar: perfil?.avatar_url ? getAvatarUrl(perfil.avatar_url) || null : null,
          rol: roles.get(n.user_id) ?? null,
        },
      };
    }),
  );
}

/** Nombre seguro para la ruta de Storage (el nombre original se guarda aparte). */
export function nombreSeguroArchivo(nombre: string): string {
  const limpio = nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w.-]+/g, '_')
    .replace(/_+/g, '_')
    .slice(-120);
  return limpio || 'archivo';
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function crearNota(
  organizacionId: number,
  productId: number,
  contenido: string,
  archivos: readonly File[],
  onSubiendo?: () => void,
): Promise<{ notaId: number; fallidos: string[] }> {
  const { data: sesion } = await supabase.auth.getUser();
  const userId = sesion?.user?.id;
  if (!userId) throw new Error('sin_sesion');

  const { data: nota, error } = await supabase
    .from('product_notes')
    .insert({ product_id: productId, organization_id: organizacionId, user_id: userId, content: contenido })
    .select('id')
    .single();
  if (error) throw error;
  const notaId = Number((nota as { id: number }).id);

  const fallidos: string[] = [];
  if (archivos.length > 0) onSubiendo?.();
  for (const archivo of archivos) {
    const ruta = `${organizacionId}/${productId}/${uuid()}-${nombreSeguroArchivo(archivo.name)}`;
    const subida = await supabase.storage.from(BUCKET_NOTAS).upload(ruta, archivo, {
      contentType: archivo.type || undefined,
      upsert: false,
    });
    if (subida.error) {
      fallidos.push(archivo.name);
      continue;
    }
    const fila = await supabase
      .from('product_note_files')
      .insert({ note_id: notaId, name: archivo.name, size: archivo.size, url: '', storage_path: ruta });
    if (fila.error) {
      await supabase.storage.from(BUCKET_NOTAS).remove([ruta]);
      fallidos.push(archivo.name);
    }
  }
  return { notaId, fallidos };
}

export async function editarNota(organizacionId: number, notaId: number, contenido: string): Promise<void> {
  const ahora = new Date().toISOString();
  const { error } = await supabase
    .from('product_notes')
    .update({ content: contenido, edited_at: ahora, updated_at: ahora })
    .eq('id', notaId)
    .eq('organization_id', organizacionId);
  if (error) throw error;
}

export async function fijarNota(organizacionId: number, notaId: number, fijar: boolean): Promise<void> {
  const { error } = await supabase
    .from('product_notes')
    .update({ is_pinned: fijar, pinned_at: fijar ? new Date().toISOString() : null })
    .eq('id', notaId)
    .eq('organization_id', organizacionId);
  if (error) throw error;
}

/** Borra la nota, sus filas de adjuntos y los objetos de Storage de la organización. */
export async function eliminarNota(organizacionId: number, nota: NotaProducto): Promise<void> {
  const rutas = nota.archivos.map((a) => a.rutaStorage).filter((r) => r.startsWith(`${organizacionId}/`));
  if (rutas.length > 0) {
    // Si el objeto ya no existe (notas antiguas) no bloquea el borrado de la nota.
    await supabase.storage.from(BUCKET_NOTAS).remove(rutas);
  }
  if (nota.archivos.length > 0) {
    const { error } = await supabase.from('product_note_files').delete().eq('note_id', nota.id);
    if (error) throw error;
  }
  const { error } = await supabase.from('product_notes').delete().eq('id', nota.id).eq('organization_id', organizacionId);
  if (error) throw error;
}

/** URL de descarga: firmada si el archivo está en el bucket; si no, el enlace guardado (notas antiguas). */
export async function urlDescarga(archivo: ArchivoNota): Promise<string | null> {
  if (archivo.rutaStorage) {
    const { data } = await supabase.storage.from(BUCKET_NOTAS).createSignedUrl(archivo.rutaStorage, 60, { download: archivo.nombre });
    if (data?.signedUrl) return data.signedUrl;
  }
  return archivo.url || null;
}

export async function usuarioActual(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data?.user?.id ?? null;
}
