/**
 * Biblioteca de imágenes: reglas sin React ni Supabase (se prueban en node).
 *
 * - Qué archivo se acepta (JPG, PNG o WEBP de hasta 5 MB: lo mismo que exige
 *   `fn_imagen_registrar` en el servidor) y por qué se rechaza.
 * - La ruta en el storage: `{org}/{aleatorio}-{nombre-saneado}` en
 *   `organization_images`. El nombre visible se guarda aparte, tal cual.
 * - Los filtros de la URL → parámetros de `fn_imagenes_listado`.
 * - El código de un error de las RPC (`hint`) → clave de `inventarioImagenes.errores`.
 */

export const TIPOS_BIBLIOTECA = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const ACEPTAR_BIBLIOTECA = TIPOS_BIBLIOTECA.join(',');
export const TAMANO_MAXIMO_BIBLIOTECA = 5 * 1024 * 1024;
/** Figma «Subir imágenes»: hasta 5 por tanda. */
export const MAX_POR_TANDA = 5;
export const BUCKET_BIBLIOTECA = 'organization_images';

export type MotivoRechazo = 'formato' | 'tamano';

export function motivoRechazo(archivo: Pick<File, 'type' | 'size' | 'name'>): MotivoRechazo | null {
  const tipo = archivo.type || tipoPorExtension(archivo.name);
  if (!(TIPOS_BIBLIOTECA as readonly string[]).includes(tipo)) return 'formato';
  if (archivo.size <= 0 || archivo.size > TAMANO_MAXIMO_BIBLIOTECA) return 'tamano';
  return null;
}

/** Algunos navegadores no informan el tipo de un .webp: se deduce por la extensión. */
export function tipoPorExtension(nombre: string): string {
  const ext = extension(nombre);
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return '';
}

export function extension(nombre: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(nombre.trim());
  return m ? m[1].toLowerCase() : '';
}

/**
 * Nombre apto para la ruta del storage: sin tildes, espacios ni símbolos, en
 * minúsculas y con su extensión. Nunca vacío.
 */
export function nombreSeguro(nombre: string): string {
  const ext = extension(nombre);
  const base = (ext ? nombre.slice(0, -(ext.length + 1)) : nombre)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${base || 'imagen'}${ext ? `.${ext}` : ''}`;
}

export function rutaBiblioteca(organizacionId: number, nombre: string, aleatorio: string): string {
  const sufijo = aleatorio.replace(/[^a-z0-9]/gi, '').slice(0, 12).toLowerCase() || 'x';
  return `${organizacionId}/${sufijo}-${nombreSeguro(nombre)}`;
}

/** «412 KB», «1,1 MB» en el idioma activo. */
export function formatoTamano(bytes: number | null | undefined, locale: string): string {
  const b = Number(bytes) || 0;
  if (b <= 0) return '—';
  const n = (v: number, d: number) => v.toLocaleString(locale, { maximumFractionDigits: d });
  if (b < 1024) return `${n(b, 0)} B`;
  if (b < 1024 * 1024) return `${n(Math.round(b / 1024), 0)} KB`;
  return `${n(b / (1024 * 1024), 1)} MB`;
}

export interface Dimensiones {
  width: number;
  height: number;
}

export function dimensionesValidas(d: unknown): Dimensiones | null {
  if (!d || typeof d !== 'object') return null;
  const w = Number((d as Record<string, unknown>).width);
  const h = Number((d as Record<string, unknown>).height);
  return w > 0 && h > 0 ? { width: Math.round(w), height: Math.round(h) } : null;
}

/** «JPG», «PNG», «WEBP» a partir del tipo MIME o de la ruta. */
export function etiquetaFormato(mime: string | null | undefined, ruta?: string | null): string {
  if (mime === 'image/jpeg' || mime === 'image/jpg') return 'JPG';
  if (mime === 'image/png') return 'PNG';
  if (mime === 'image/webp') return 'WEBP';
  const ext = extension(ruta ?? '');
  return ext === 'jpeg' ? 'JPG' : ext.toUpperCase();
}

/** Último tramo de una ruta del storage (el «nombre» de una imagen de producto). */
export function nombreDeRuta(ruta: string): string {
  const limpio = ruta.split('?')[0];
  return decodeURIComponent(limpio.slice(limpio.lastIndexOf('/') + 1)) || limpio;
}

// ─── Filtros de la URL → RPC ───────────────────────────────────────────────

export type Pestana = 'biblioteca' | 'productos';
export const USOS = ['en_uso', 'sin_usar'] as const;
export const VISIBILIDADES = ['publicas', 'privadas'] as const;
export const FORMATOS = ['jpg_png', 'webp'] as const;
export const TAMANOS = ['pequena', 'mediana', 'grande'] as const;
export const ORDENES = ['recientes', 'nombre', 'tamano', 'uso'] as const;
export const CLAVES_FILTRO_IMAGENES = ['vista', 'uso', 'visibilidad', 'formato', 'tamano', 'producto'] as const;

const de = <T extends string>(lista: readonly T[], v: string | undefined): T | null =>
  v && (lista as readonly string[]).includes(v) ? (v as T) : null;

export function pestanaDe(filtros: Record<string, string>): Pestana {
  return filtros.vista === 'productos' ? 'productos' : 'biblioteca';
}

export interface ParametrosListado {
  p_origen: Pestana;
  p_busqueda: string | null;
  p_uso: (typeof USOS)[number] | null;
  p_visibilidad: (typeof VISIBILIDADES)[number] | null;
  p_formato: (typeof FORMATOS)[number] | null;
  p_tamano: (typeof TAMANOS)[number] | null;
  p_producto_id: number | null;
  p_orden: (typeof ORDENES)[number];
  p_offset: number;
  p_limit: number;
}

/**
 * Parámetros de `fn_imagenes_listado`. Lo que la pestaña «De productos» no
 * admite (uso, visibilidad, tamaño) no se manda aunque quede en la URL.
 */
export function parametrosListado(
  estado: { busqueda: string; filtros: Record<string, string>; pagina: number; tamano: number; orden?: { campo: string } | null },
): ParametrosListado {
  const pestana = pestanaDe(estado.filtros);
  const biblioteca = pestana === 'biblioteca';
  const producto = Number(estado.filtros.producto);
  return {
    p_origen: pestana,
    p_busqueda: estado.busqueda.trim() || null,
    p_uso: biblioteca ? de(USOS, estado.filtros.uso) : null,
    p_visibilidad: biblioteca ? de(VISIBILIDADES, estado.filtros.visibilidad) : null,
    p_formato: de(FORMATOS, estado.filtros.formato),
    p_tamano: biblioteca ? de(TAMANOS, estado.filtros.tamano) : null,
    p_producto_id: Number.isInteger(producto) && producto > 0 ? producto : null,
    p_orden: de(ORDENES, estado.orden?.campo) ?? 'recientes',
    p_offset: (Math.max(1, estado.pagina) - 1) * estado.tamano,
    p_limit: estado.tamano,
  };
}

/** Filtros que cuentan en el botón «Filtros (n)»: la pestaña no es un filtro. */
export function filtrosActivos(filtros: Record<string, string>): string[] {
  const biblioteca = pestanaDe(filtros) === 'biblioteca';
  return (['uso', 'visibilidad', 'formato', 'tamano', 'producto'] as const).filter((k) => {
    if (!filtros[k]) return false;
    return biblioteca || k === 'formato' || k === 'producto';
  });
}

// ─── Errores de las RPC ────────────────────────────────────────────────────

const CODIGOS: Readonly<Record<string, string>> = {
  IMAGEN_NO_ENCONTRADA: 'noEncontrada',
  IMAGEN_RUTA_INVALIDA: 'rutaInvalida',
  IMAGEN_FORMATO: 'formato',
  IMAGEN_TAMANO: 'tamano',
  IMAGEN_NOMBRE: 'nombre',
};

export interface ErrorRpc {
  code?: string;
  hint?: string | null;
  message?: string;
}

/** Clave de `inventarioImagenes.errores.*` para un error de Supabase. */
export function claveError(e: unknown): string {
  const err = (e ?? {}) as ErrorRpc;
  if (err.code === '42501') return 'sinPermiso';
  const clave = err.hint ? CODIGOS[err.hint] : undefined;
  return clave ?? 'generico';
}

export function esSinPermiso(e: unknown): boolean {
  return claveError(e) === 'sinPermiso';
}
