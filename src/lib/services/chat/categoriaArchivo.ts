/**
 * Categoría de un adjunto del Chat según su tipo MIME. Regla pura, sin
 * Supabase: la usan `ConversationFilesService` (estadísticas) y la pestaña
 * «Archivos» de la conversación (filtros, cifras e icono). Una sola regla.
 */
export const CATEGORIAS_ARCHIVO = ['image', 'video', 'audio', 'pdf', 'document', 'spreadsheet', 'archive', 'other'] as const;
export type CategoriaArchivo = (typeof CATEGORIAS_ARCHIVO)[number];

export function categoriaArchivo(mimeType: string | null | undefined): CategoriaArchivo {
  const mime = (mimeType ?? '').toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.includes('pdf')) return 'pdf';
  // Hojas antes que documentos: el MIME de Excel moderno
  // («…officedocument.spreadsheetml.sheet») también contiene «document».
  if (mime.includes('excel') || mime.includes('spreadsheet')) return 'spreadsheet';
  if (mime.includes('word') || mime.includes('document')) return 'document';
  if (mime.includes('zip') || mime.includes('rar') || mime.includes('tar')) return 'archive';
  return 'other';
}
