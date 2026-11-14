/**
 * Pestaña «Archivos» de la conversación (Figma 91-chat-12): cifras, filtros y
 * quién envió cada archivo. Puro, sin React ni Supabase.
 */
import type { ConversationFile } from '@/lib/services/conversationFilesService';
import { CATEGORIAS_ARCHIVO, categoriaArchivo, type CategoriaArchivo } from '@/lib/services/chat/categoriaArchivo';
import { coincideBusqueda } from '../comunLogica';

export const REMITENTES_ARCHIVO = ['customer', 'agent', 'ai'] as const;
export type RemitenteArchivo = (typeof REMITENTES_ARCHIVO)[number] | 'system';

export type FiltroTipoArchivo = 'todos' | CategoriaArchivo;
export type FiltroRemitente = 'todos' | (typeof REMITENTES_ARCHIVO)[number];

export const FILTROS_TIPO_ARCHIVO: readonly FiltroTipoArchivo[] = ['todos', ...CATEGORIAS_ARCHIVO];
export const FILTROS_REMITENTE: readonly FiltroRemitente[] = ['todos', ...REMITENTES_ARCHIVO];

/** Quién mandó el mensaje del adjunto; sin mensaje o rol raro = el sistema. */
export function remitenteArchivo(f: Pick<ConversationFile, 'message'>): RemitenteArchivo {
  const rol = f.message?.role;
  return rol === 'customer' || rol === 'agent' || rol === 'ai' ? rol : 'system';
}

/** Las cinco cifras del Figma: archivos, tamaño, imágenes, documentos y audios. */
export function resumenArchivos(files: readonly Pick<ConversationFile, 'mime_type' | 'size_bytes'>[]) {
  let tamano = 0;
  let imagenes = 0;
  let documentos = 0;
  let audios = 0;
  for (const f of files) {
    tamano += f.size_bytes || 0;
    const c = categoriaArchivo(f.mime_type);
    if (c === 'image') imagenes += 1;
    else if (c === 'pdf' || c === 'document' || c === 'spreadsheet') documentos += 1;
    else if (c === 'audio') audios += 1;
  }
  return { total: files.length, tamano, imagenes, documentos, audios };
}

export type ResumenArchivos = ReturnType<typeof resumenArchivos>;

export function filtrarArchivos<T extends Pick<ConversationFile, 'file_name' | 'mime_type' | 'message'>>(
  files: readonly T[],
  filtros: { busqueda: string; tipo: FiltroTipoArchivo; remitente: FiltroRemitente },
): T[] {
  return files.filter(
    (f) =>
      coincideBusqueda([f.file_name], filtros.busqueda) &&
      (filtros.tipo === 'todos' || categoriaArchivo(f.mime_type) === filtros.tipo) &&
      (filtros.remitente === 'todos' || remitenteArchivo(f) === filtros.remitente),
  );
}

/** «8,4 MB» en el idioma de la persona (1 decimal como mucho). */
export function tamanoLegible(bytes: number, locale = 'es-CO'): string {
  if (!bytes || bytes <= 0) return '0 B';
  const unidades = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(unidades.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const valor = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(bytes / Math.pow(1024, i));
  return `${valor} ${unidades[i]}`;
}
