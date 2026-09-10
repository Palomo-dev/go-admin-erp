/**
 * Adjuntos desde `documents` (bucket privado crm-documents, signed URL → base64)
 * o inline base64. Límite total 40 MB incluido el HTML (docs-resend.md).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getDocument, getDownloadUrl } from '@/lib/services/crm/documentService';
import { EmailError, MAX_ATTACHMENT_BYTES, type EmailAttachmentRef } from './types';

export type AttachmentInput = { document_id: string } | { filename: string; content_base64: string; content_type: string };

export interface LoadedAttachment extends EmailAttachmentRef {
  base64: string;
}

/** Tope por adjunto individual (el total sigue siendo `MAX_ATTACHMENT_BYTES`). */
export const MAX_SINGLE_ATTACHMENT_BYTES = 25 * 1024 * 1024;

const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/;

/**
 * Valida un base64 inline y devuelve su tamaño REAL en bytes.
 * Antes (tester r1 #14) cualquier cadena se aceptaba y el tamaño se estimaba
 * con `length * 0.75`, así que un adjunto corrupto provocaba un 4xx de Resend
 * en vez de un 400 propio.
 */
export function decodeInlineBase64(filename: string, content: string): number {
  const compact = content.replace(/[\r\n\s]/g, '');
  if (!compact || compact.length % 4 !== 0 || !BASE64_RE.test(compact)) {
    throw new EmailError('VALIDATION', `El adjunto ${filename} no es base64 válido`, 400);
  }
  const padding = compact.endsWith('==') ? 2 : compact.endsWith('=') ? 1 : 0;
  const bytes = (compact.length / 4) * 3 - padding;
  if (bytes > MAX_SINGLE_ATTACHMENT_BYTES) {
    throw new EmailError('ATTACHMENTS_TOO_LARGE', `El adjunto ${filename} supera ${Math.round(MAX_SINGLE_ATTACHMENT_BYTES / 1024 / 1024)} MB`, 422);
  }
  return bytes;
}

export async function loadAttachments(orgId: number, items: AttachmentInput[] | undefined, htmlBytes: number, supabase: SupabaseClient): Promise<LoadedAttachment[]> {
  const out: LoadedAttachment[] = [];
  for (const it of items ?? []) {
    if ('document_id' in it) {
      const doc = await getDocument(it.document_id, orgId, supabase);
      if (!doc) throw new EmailError('ATTACHMENT_NOT_FOUND', `Documento ${it.document_id} no encontrado`, 404);
      const url = await getDownloadUrl(doc.id, orgId, supabase);
      if (!url) throw new EmailError('ATTACHMENT_NOT_FOUND', `No se pudo firmar la URL de ${doc.name}`, 404);
      const res = await fetch(url);
      if (!res.ok) throw new EmailError('ATTACHMENT_NOT_FOUND', `Descarga fallida (${res.status}) de ${doc.name}`, 502);
      const buf = Buffer.from(await res.arrayBuffer());
      out.push({ filename: doc.name, content_type: doc.mime_type ?? 'application/octet-stream', bytes: buf.length, document_id: doc.id, base64: buf.toString('base64') });
    } else {
      if (!it.filename || !it.content_base64) throw new EmailError('VALIDATION', 'Adjunto inline incompleto', 400);
      const filename = it.filename.slice(0, 200);
      const bytes = decodeInlineBase64(filename, it.content_base64);
      out.push({ filename, content_type: it.content_type || 'application/octet-stream', bytes, base64: it.content_base64 });
    }
  }
  const total = out.reduce((s, a) => s + a.bytes, 0) + htmlBytes;
  if (total > MAX_ATTACHMENT_BYTES) throw new EmailError('ATTACHMENTS_TOO_LARGE', `Los adjuntos superan 40 MB (${Math.round(total / 1024 / 1024)} MB)`, 422);
  return out;
}

export function toRefs(list: LoadedAttachment[]): EmailAttachmentRef[] {
  return list.map(({ filename, content_type, bytes, document_id }) => ({ filename, content_type, bytes, document_id }));
}

/** Para envíos programados: vuelve a cargar solo los adjuntos que provienen de `documents`. */
export function refsToInputs(refs: EmailAttachmentRef[] | undefined): AttachmentInput[] {
  return (refs ?? []).filter((r) => !!r.document_id).map((r) => ({ document_id: r.document_id as string }));
}
