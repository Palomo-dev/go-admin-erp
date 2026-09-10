/**
 * GO Assistant — Fase 4: subida de adjuntos.
 *
 * El objeto va al bucket PRIVADO `ai-attachments` (migración
 * `20260910210000_go_assistant_f4_adjuntos_y_vision.sql`). No se devuelve
 * ninguna URL: lo que vuelve al cliente es el `id` de la fila. Quien quiera ver
 * el original pide una URL firmada corta por su camino; una foto de factura
 * lleva NIT, valores y a veces datos de personas (§9.6).
 *
 * Reglas que este archivo cumple y no negocia:
 * - `getServerOrgContext(request)` primero, siempre (§9.1.1). Hay un
 *   guardarraíl —caso 11 de `guardrails.test.ts`— que falla si falta.
 * - La organización sale de la sesión. El body no la trae ni puede traerla.
 * - Se sube con el cliente de SESIÓN, no con el de servicio: así la RLS del
 *   bucket vuelve a comprobar la pertenencia. Que la ruta ya haya validado la
 *   organización no es motivo para saltarse la segunda barrera.
 * - Límite de tasa por usuario (§9.1.4): una subida es la operación más cara
 *   del asistente (20 MB por llamada y una extracción de visión detrás).
 */

import { randomUUID } from 'crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { checkRateLimit } from '@/lib/security/rateLimit';

/** 20 MB, el mismo tope que declara el bucket. */
const MAX_BYTES = 20 * 1024 * 1024;

export type AttachmentKind = 'image' | 'pdf' | 'spreadsheet';

/**
 * Tipos permitidos → extensión y clasificación.
 *
 * La extensión sale de AQUÍ, nunca del nombre del archivo: el nombre lo escribe
 * el cliente y acabaría dentro del path del objeto.
 */
const ALLOWED: Record<string, { ext: string; kind: AttachmentKind }> = {
  'image/jpeg': { ext: 'jpg', kind: 'image' },
  'image/png': { ext: 'png', kind: 'image' },
  'image/webp': { ext: 'webp', kind: 'image' },
  'image/heic': { ext: 'heic', kind: 'image' },
  'image/heif': { ext: 'heif', kind: 'image' },
  'application/pdf': { ext: 'pdf', kind: 'pdf' },
  'text/csv': { ext: 'csv', kind: 'spreadsheet' },
  'application/vnd.ms-excel': { ext: 'xls', kind: 'spreadsheet' },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { ext: 'xlsx', kind: 'spreadsheet' },
};

export const BUCKET = 'ai-attachments';

/** Los navegadores mandan CSV con etiquetas variadas; se normalizan aquí. */
const MIME_ALIASES: Record<string, string> = {
  'image/jpg': 'image/jpeg',
  'image/pjpeg': 'image/jpeg',
  'text/plain': 'text/csv',
  'application/csv': 'text/csv',
  'application/vnd.ms-excel.sheet.macroenabled.12': 'application/vnd.ms-excel',
};

export function normalizeMime(raw: string): string {
  const base = raw.split(';')[0]?.trim().toLowerCase() ?? '';
  return MIME_ALIASES[base] ?? base;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  let ctx;
  try {
    ctx = await getServerOrgContext(request);
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
    }
    throw err;
  }

  // §9.1.4: adjuntos por hora. Cada uno arrastra una extracción de visión, que
  // es el coste unitario más alto de toda la superficie del asistente.
  const rl = await checkRateLimit(`assistant:attach:${ctx.userId}`, { limit: 20, windowMs: 3_600_000 });
  if (!rl.allowed) {
    return NextResponse.json(
      {
        error: 'Has subido demasiados documentos en poco tiempo. Espera un momento y vuelve a intentarlo.',
        code: 'RATE_LIMITED',
        retryAt: rl.resetAt.toISOString(),
      },
      { status: 429 }
    );
  }

  // Corte barato antes de leer el cuerpo entero en memoria.
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > MAX_BYTES + 64 * 1024) {
    return NextResponse.json(
      { error: 'El archivo supera el máximo de 20 MB.', code: 'TOO_LARGE' },
      { status: 413 }
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: 'La subida tiene que ser multipart/form-data.', code: 'BAD_REQUEST' },
      { status: 400 }
    );
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Falta el archivo.', code: 'FILE_REQUIRED' }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: 'El archivo está vacío.', code: 'EMPTY_FILE' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: 'El archivo supera el máximo de 20 MB.', code: 'TOO_LARGE' },
      { status: 413 }
    );
  }

  const mime = normalizeMime(file.type || '');
  const spec = ALLOWED[mime];
  if (!spec) {
    return NextResponse.json(
      {
        error: `No puedo leer archivos de tipo "${file.type || 'desconocido'}". Acepto imágenes, PDF, CSV y Excel.`,
        code: 'UNSUPPORTED_TYPE',
      },
      { status: 415 }
    );
  }

  // La conversación es opcional, pero si viene tiene que ser DEL USUARIO y de
  // ESTA organización. La clave foránea solo comprueba que el id existe: sin
  // esta validación, un miembro podría colgar su adjunto de la conversación de
  // un compañero. Es exactamente el fallo de referencias cruzadas que encontró
  // el tester de la F0.
  const rawConversation = form.get('conversation_id');
  let conversationId: string | null = null;
  if (typeof rawConversation === 'string' && rawConversation.trim()) {
    const candidate = rawConversation.trim();
    if (!UUID_RE.test(candidate)) {
      return NextResponse.json({ error: 'Conversación inválida.', code: 'BAD_CONVERSATION' }, { status: 400 });
    }
    const { data: conv } = await ctx.supabase
      .from('ai_assistant_conversations')
      .select('id')
      .eq('id', candidate)
      .eq('organization_id', ctx.organizationId)
      .eq('user_id', ctx.userId)
      .maybeSingle();
    if (!conv) {
      return NextResponse.json(
        { error: 'Esa conversación no es tuya.', code: 'CONVERSATION_NOT_FOUND' },
        { status: 404 }
      );
    }
    conversationId = candidate;
  }

  const storagePath = `org/${ctx.organizationId}/${randomUUID()}.${spec.ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await ctx.supabase.storage
    .from(BUCKET)
    .upload(storagePath, bytes, { contentType: mime, upsert: false });

  if (uploadError) {
    console.error('[GO Assistant] Fallo subiendo adjunto:', uploadError.message);
    return NextResponse.json(
      { error: 'No pude guardar el documento. Inténtalo de nuevo.', code: 'UPLOAD_FAILED' },
      { status: 502 }
    );
  }

  const { data: row, error: insertError } = await ctx.supabase
    .from('ai_attachments')
    .insert({
      organization_id: ctx.organizationId,
      user_id: ctx.userId,
      conversation_id: conversationId,
      storage_path: storagePath,
      mime,
      bytes: file.size,
      kind: spec.kind,
    })
    .select('id, kind, mime, bytes, created_at')
    .single();

  if (insertError || !row) {
    // Sin fila, el objeto es basura invisible: nadie sabe de quién es ni a qué
    // conversación pertenece, y la retención se calcula sobre la tabla. Se
    // borra para no dejar huérfanos en un bucket con datos personales.
    const { error: cleanupError } = await ctx.supabase.storage.from(BUCKET).remove([storagePath]);
    if (cleanupError) {
      console.error(
        `[GO Assistant] Adjunto huérfano en ${BUCKET}: ${storagePath} (${cleanupError.message})`
      );
    }
    console.error('[GO Assistant] Fallo registrando adjunto:', insertError?.message);
    return NextResponse.json(
      { error: 'No pude registrar el documento. Inténtalo de nuevo.', code: 'INSERT_FAILED' },
      { status: 500 }
    );
  }

  // Se devuelve el id, no el path ni una URL: el cliente no necesita saber
  // dónde vive el objeto para pedirle al asistente que lo lea.
  return NextResponse.json(
    {
      id: row.id,
      kind: row.kind,
      mime: row.mime,
      bytes: row.bytes,
      createdAt: row.created_at,
    },
    { status: 201 }
  );
}
