/**
 * GO Assistant — Fase 4: subida de adjuntos.
 *
 * El objeto va al bucket PRIVADO `ai-attachments` (migración
 * `20260910210000_go_assistant_f4_adjuntos_y_vision.sql`). No se devuelve
 * ninguna URL de lectura: prepare devuelve solo una URL firmada de escritura;
 * finalize devuelve el `id` de la fila. Quien quiera ver
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

import { randomUUID, createHmac, timingSafeEqual } from 'crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { checkRateLimit } from '@/lib/security/rateLimit';
import { normalizeAttachmentMime } from '@/lib/ai/assistant/attachments';
import { readWsSessionSecret } from '@/lib/security/wsSessionToken';
import { readRealSecret } from '@/lib/security/secrets';
import type { ServerOrgContext } from '@/lib/utils/orgContext';

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

const BUCKET = 'ai-attachments';

/** Los navegadores mandan CSV con etiquetas variadas; se normalizan aquí. */
const MIME_ALIASES: Record<string, string> = {
  'image/jpg': 'image/jpeg',
  'image/pjpeg': 'image/jpeg',
  'text/plain': 'text/csv',
  'application/csv': 'text/csv',
  'application/vnd.ms-excel.sheet.macroenabled.12': 'application/vnd.ms-excel',
};

function normalizeMime(raw: string): string {
  const base = raw.split(';')[0]?.trim().toLowerCase() ?? '';
  return Object.prototype.hasOwnProperty.call(MIME_ALIASES, base) ? MIME_ALIASES[base] : base;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Autorización pendiente sin filas incompletas visibles para visión. La clave
// existente se separa por propósito: estos tokens no son tokens de voz.
interface UploadClaims {
  id: string; organizationId: number; userId: string; path: string;
  mime: string; bytes: number; conversationId: string | null; exp: number;
}
const UPLOAD_TTL = 2 * 60 * 60 * 1000;
const attachmentJson = (body: object, status = 200) => NextResponse.json(body, {
  status, headers: { 'Cache-Control': 'no-store' },
});
const fail = (error: string, code: string, status: number) => attachmentJson({ error, code }, status);
function signature(payload: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(`assistant-attachment-v1:${payload}`).digest();
}
function readAuthorization(token: unknown, secret: string, ctx: ServerOrgContext): UploadClaims | null {
  if (typeof token !== 'string' || token.length > 4096) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const actual = Buffer.from(parts[1], 'base64url');
  const expected = signature(parts[0], secret);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const claims: UploadClaims = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    if (claims.organizationId !== ctx.organizationId || claims.userId !== ctx.userId ||
        !Number.isFinite(claims.exp) || claims.exp <= Date.now() || claims.exp > Date.now() + UPLOAD_TTL ||
        !UUID_RE.test(claims.id) || !Object.prototype.hasOwnProperty.call(ALLOWED, claims.mime) ||
        !Number.isInteger(claims.bytes) || claims.bytes <= 0 || claims.bytes > MAX_BYTES ||
        claims.path !== `org/${ctx.organizationId}/${claims.id}.${ALLOWED[claims.mime].ext}` ||
        (claims.conversationId !== null && !UUID_RE.test(claims.conversationId))) return null;
    return claims;
  } catch { return null; }
}

async function signedUpload(request: NextRequest, ctx: ServerOrgContext) {
  // JSON es solo control, nunca contiene binarios. Acotar también cuerpos chunked.
  const reader = request.body?.getReader();
  if (!reader) return fail('Falta la solicitud.', 'BAD_REQUEST', 400);
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    length += chunk.value.byteLength;
    if (length > 8192) { await reader.cancel(); return fail('Solicitud demasiado grande.', 'TOO_LARGE', 413); }
    chunks.push(chunk.value);
  }
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fail('Solicitud inválida.', 'BAD_REQUEST', 400);
    const parsedBody = parsed as Record<string, unknown>;
    body = readOrgBody(ctx, parsedBody, { route: 'ai-assistant/attachments', request });
  } catch (error) {
    if (error instanceof OrgContextError) return fail(error.message, error.code, error.statusCode);
    return fail('JSON inválido.', 'BAD_REQUEST', 400);
  }
  if (body.operation !== 'prepare' && body.operation !== 'finalize') return fail('Operación inválida.', 'BAD_REQUEST', 400);
  // Alternativa para despliegues sin voz. Solo se usa como clave HMAC con
  // propósito separado, nunca como cliente privilegiado ni se envía al navegador.
  const secret = readWsSessionSecret() ?? readRealSecret('SUPABASE_SERVICE_ROLE_KEY', { min: 32 });
  if (!secret) return fail('La subida directa no está configurada. Contacta al administrador.', 'UPLOAD_NOT_CONFIGURED', 503);
  const storage = ctx.supabase.storage.from(BUCKET);
  if (body.operation === 'prepare') {
    const limit = await checkRateLimit(`assistant:attach:${ctx.userId}`, { limit: 20, windowMs: 3600000 });
    if (!limit.allowed) return fail('Demasiadas subidas. Inténtalo más tarde.', 'RATE_LIMITED', 429);
    if (typeof body.bytes !== 'number' || !Number.isInteger(body.bytes) || body.bytes <= 0) return fail('Tamaño inválido.', 'EMPTY_FILE', 400);
    if (body.bytes > MAX_BYTES) return fail('El archivo supera el máximo de 20 MB.', 'TOO_LARGE', 413);
    if (typeof body.filename !== 'string' || body.filename.length > 255 || typeof body.mime !== 'string') return fail('Archivo inválido.', 'BAD_REQUEST', 400);
    const mime = normalizeAttachmentMime(normalizeMime(body.mime), body.filename);
    if (!Object.prototype.hasOwnProperty.call(ALLOWED, mime)) return fail('Tipo de archivo no admitido.', 'UNSUPPORTED_TYPE', 415);
    const conversationId = body.conversation_id ?? null;
    if (conversationId !== null) {
      if (typeof conversationId !== 'string' || !UUID_RE.test(conversationId)) return fail('Conversación inválida.', 'BAD_CONVERSATION', 400);
      const { data, error } = await ctx.supabase.from('ai_assistant_conversations').select('id')
        .eq('id', conversationId).eq('organization_id', ctx.organizationId).eq('user_id', ctx.userId).maybeSingle();
      if (error) return fail('No pude verificar la conversación.', 'LOOKUP_FAILED', 503);
      if (!data) return fail('Esa conversación no es tuya.', 'CONVERSATION_NOT_FOUND', 404);
    }
    const id = randomUUID();
    const path = `org/${ctx.organizationId}/${id}.${ALLOWED[mime].ext}`;
    const { data, error } = await storage.createSignedUploadUrl(path, { upsert: false });
    if (error || !data) return fail('No pude preparar la subida.', 'UPLOAD_FAILED', 502);
    const claims: UploadClaims = { id, path, mime, bytes: body.bytes, conversationId,
      userId: ctx.userId, organizationId: ctx.organizationId, exp: Date.now() + UPLOAD_TTL };
    const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
    return attachmentJson({ uploadUrl: data.signedUrl, mime,
      finalizeToken: `${payload}.${signature(payload, secret).toString('base64url')}` });
  }
  const claims = readAuthorization(body.finalizeToken, secret, ctx);
  if (!claims) return fail('Autorización de subida inválida o vencida.', 'INVALID_UPLOAD', 403);
  const lookup = () => ctx.supabase.from('ai_attachments').select('id, kind, mime, bytes, created_at')
    .eq('id', claims.id).eq('organization_id', ctx.organizationId).eq('user_id', ctx.userId)
    .eq('storage_path', claims.path).maybeSingle();
  const existing = await lookup();
  if (existing.error) return fail('No pude verificar el adjunto.', 'LOOKUP_FAILED', 503);
  const result = (row: { id: string; kind: string; mime: string; bytes: number; created_at: string }, status: number) =>
    attachmentJson({ id: row.id, kind: row.kind, mime: row.mime, bytes: row.bytes, createdAt: row.created_at }, status);
  if (existing.data) return result(existing.data, 200);
  // Leer solo el path firmado, nunca un path arbitrario recibido en finalize.
  const filename = claims.path.split('/').pop()!;
  const { data: objects, error } = await storage.list(`org/${ctx.organizationId}`, { search: filename, limit: 2 });
  if (error) return fail('No pude verificar Storage.', 'STORAGE_UNAVAILABLE', 503);
  const object = objects?.find((entry) => entry.name === filename);
  if (!object) return fail('La subida aún no aparece en Storage. Reintenta.', 'UPLOAD_PENDING', 409);
  // storage.search no devuelve owner (verificado por MCP). La pertenencia de
  // la autorización pendiente se verifica con HMAC userId + org + path, no con
  // un campo owner ficticio del listado. Storage sigue usando la sesión/RLS.
  const bytes: unknown = object.metadata?.size;
  const mime: unknown = object.metadata?.mimetype;
  if (typeof bytes !== 'number' || bytes !== claims.bytes || bytes > MAX_BYTES || bytes <= 0 ||
      typeof mime !== 'string' || normalizeMime(mime) !== claims.mime) {
    const cleanup = await storage.remove([claims.path]);
    if (cleanup.error) console.error('[GO Assistant] No pude limpiar una subida inválida:', cleanup.error.message);
    return fail('El tamaño o tipo guardado no coincide con el archivo autorizado.', 'INVALID_OBJECT', 422);
  }
  // PK emitida en prepare: las carreras/reintentos no duplican metadata.
  const inserted = await ctx.supabase.from('ai_attachments').insert({ id: claims.id,
    organization_id: ctx.organizationId, user_id: ctx.userId, conversation_id: claims.conversationId,
    storage_path: claims.path, mime: claims.mime, bytes, kind: ALLOWED[claims.mime].kind,
  }).select('id, kind, mime, bytes, created_at').single();
  if (inserted.error || !inserted.data) {
    if (inserted.error?.code === '23505') {
      const retry = await lookup();
      if (retry.data) return result(retry.data, 200);
    }
    // No borrar ante errores transitorios: el cliente conserva la autorización
    // y puede finalizar el mismo objeto, sin subirlo ni facturarlo otra vez.
    return fail('No pude registrar el documento. Reintenta.', 'INSERT_FAILED', 503);
  }
  return result(inserted.data, 201);
}

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

  if (request.headers.get('content-type')?.split(';')[0].trim() === 'application/json') {
    const limit = await checkRateLimit(`assistant:attach-control:${ctx.organizationId}:${ctx.userId}`, { limit: 100, windowMs: 3600000 });
    if (!limit.allowed) return fail('Demasiadas solicitudes. Inténtalo más tarde.', 'RATE_LIMITED', 429);
    return signedUpload(request, ctx);
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
  // Fuera del try del parseo: una organización ajena en el formulario es un
  // 403 FOREIGN_ORGANIZATION registrado (regla dura 5), no un 400 «mal formado»
  // (QA F0-SEC C+D r2, §1).
  try {
    form = readOrgBody(ctx, form, { route: 'ai-assistant/attachments', request });
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
    }
    throw err;
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

  const mime = normalizeAttachmentMime(normalizeMime(file.type || ''), file.name);
  const spec = ALLOWED[mime];
  if (!Object.prototype.hasOwnProperty.call(ALLOWED, mime)) {
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
