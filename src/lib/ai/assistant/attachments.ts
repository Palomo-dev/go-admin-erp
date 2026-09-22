/** Contrato compartido por el composer y la subida; no contiene credenciales. */
export interface AssistantAttachment {
  id: string;
  file: File;
  previewUrl?: string;
  /** Una subida exitosa no se repite si otro archivo o el stream falla. */
  uploadedId?: string;
  /** Permite reintentar finalize sin volver a subir el binario. Solo en memoria. */
  pendingUpload?: { uploadUrl: string; finalizeToken: string; mime: string; uploaded: boolean };
}

export function normalizeAttachmentMime(mime: string, filename: string): string {
  const normalized = mime.toLowerCase().trim();
  if (normalized === 'image/jpg') return 'image/jpeg';
  if (normalized === 'application/csv' || normalized === 'text/plain') return 'text/csv';
  if (normalized && normalized !== 'application/octet-stream') return normalized;
  const extension = filename.toLowerCase().split('.').pop() ?? '';
  const types: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
    heic: 'image/heic', heif: 'image/heif', pdf: 'application/pdf', csv: 'text/csv',
    xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
  return Object.prototype.hasOwnProperty.call(types, extension) ? types[extension] : normalized;
}

export async function uploadAssistantAttachments(
  items: AssistantAttachment[],
  conversationId: string | null,
  upload: typeof fetch = fetch,
): Promise<{ items: AssistantAttachment[]; ids: string[]; errors: string[] }> {
  const retained: AssistantAttachment[] = [];
  const errors: string[] = [];
  for (const item of items) {
    if (item.uploadedId) { retained.push(item); continue; }
    let current = item;
    try {
      if (!item.file.size) throw new Error('El archivo está vacío');
      if (item.file.size > 20 * 1024 * 1024) throw new Error('El archivo supera el máximo de 20 MB');
      const post = (body: object) => upload('/api/ai-assistant/attachments', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (!current.pendingUpload) {
        const prepared = await post({ operation: 'prepare', filename: item.file.name,
          mime: normalizeAttachmentMime(item.file.type, item.file.name), bytes: item.file.size,
          conversation_id: conversationId });
        const data = await prepared.json().catch(() => null);
        if (!prepared.ok || typeof data?.uploadUrl !== 'string' || typeof data?.finalizeToken !== 'string' || typeof data?.mime !== 'string') {
          throw new Error(typeof data?.error === 'string' ? data.error : `Error de subida (${prepared.status})`);
        }
        current = { ...current, pendingUpload: { uploadUrl: data.uploadUrl, finalizeToken: data.finalizeToken, mime: data.mime, uploaded: false } };
      }
      const pending = current.pendingUpload!;
      if (!pending.uploaded) {
        // El binario nunca atraviesa Next/Vercel. La URL es una capacidad de escritura,
        // no una URL pública de lectura; no enviar cookies de la aplicación.
        const stored = await upload(pending.uploadUrl, { method: 'PUT', body: item.file,
          credentials: 'omit', headers: { 'Content-Type': pending.mime, 'x-upsert': 'false' } });
        if (!stored.ok) {
          // Una respuesta perdida puede dejar un objeto ya subido. Finalize comprobará
          // el objeto exacto autorizado en vez de duplicarlo ante Duplicate
          // (Storage puede responder 400 o 409 según la versión).
          if (stored.status !== 409 && stored.status !== 400) {
            if (stored.status === 403 || stored.status === 410) current = { ...current, pendingUpload: undefined };
            throw new Error(`Error de Storage (${stored.status})`);
          }
        }
        current = { ...current, pendingUpload: { ...pending, uploaded: true } };
      }
      const response = await post({ operation: 'finalize', finalizeToken: pending.finalizeToken });
      const data = await response.json().catch(() => null);
      if (!response.ok || typeof data?.id !== 'string') {
        if (response.status === 409) current = { ...current, pendingUpload: { ...pending, uploaded: false } };
        if ([403, 410, 422].includes(response.status)) current = { ...current, pendingUpload: undefined };
        throw new Error(typeof data?.error === 'string' ? data.error : `Error de subida (${response.status})`);
      }
      retained.push({ ...current, uploadedId: data.id, pendingUpload: undefined });
    } catch (error) {
      retained.push(current);
      errors.push(`No pude subir «${item.file.name}»: ${error instanceof Error ? error.message : 'revisa la conexión'}. El archivo sigue adjunto para reintentar.`);
    }
  }
  return { items: retained, ids: retained.flatMap((item) => item.uploadedId ? [item.uploadedId] : []), errors };
}
