/**
 * GO Assistant — cliente de Server-Sent Events.
 *
 * Se usa `fetch` con lector de stream en vez de `EventSource` porque
 * `EventSource` solo hace GET y no manda cabeceras: aquí hace falta POST con el
 * mensaje y la cookie de sesión.
 *
 * Una desconexión no prueba que el servidor no haya generado/cobrado. Solo
 * `done` confirma la entrega; preservar texto y adjuntos ante fallos. No
 * repetir automáticamente un POST sin idempotencia aunque no lleguen tokens.
 */

import type { BulkPreviewRow, PendingAction, PendingQuestion } from './clientTypes';

export interface ToolStep {
  name: string;
  label: string;
  summary?: string;
  ok?: boolean;
}

export interface StreamHandlers {
  onToken(delta: string): void;
  onToolStart(step: ToolStep): void;
  onToolEnd(step: ToolStep): void;
  onAction(action: PendingAction): void;
  onQuestion?(question: PendingQuestion): void;
  onUsage(usage: { model: string; credits: number }): void;
  onMeta(meta: { conversationId: string }): void;
  onError(error: { message: string; code?: string }): void;
}

export interface StreamResult {
  content: string;
  /** Solo true después de done explícito y sin error de servidor. */
  ok: boolean;
  /** El llamador NO debe inferir permiso de reintento a partir de !ok. */
  canFallback: boolean;
}

/** Un evento SSE ya separado en nombre y datos. */
interface ParsedEvent {
  event: string;
  data: string;
}

/**
 * Trocea el buffer en eventos completos.
 *
 * Un evento SSE termina en línea en blanco. Los fragmentos que llegan por red no
 * respetan esa frontera, así que se acumula hasta encontrarla y se devuelve el
 * resto sin consumir.
 */
function drainEvents(buffer: string): { events: ParsedEvent[]; rest: string } {
  const events: ParsedEvent[] = [];
  const parts = buffer.replace(/\r\n/g, '\n').split('\n\n');
  const rest = parts.pop() ?? '';

  for (const raw of parts) {
    let event = 'message';
    const dataLines: string[] = [];
    for (const line of raw.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
    }
    if (dataLines.length > 0 || event === 'done') events.push({ event, data: dataLines.join('\n') || '{}' });
  }

  return { events, rest };
}

/** El `preview` del servidor, saneado a lo que la tarjeta sabe pintar. */
function toActionPreview(raw: unknown): PendingAction['preview'] {
  if (!raw || typeof raw !== 'object') return undefined;
  const p = raw as Record<string, unknown>;
  const lines = Array.isArray(p.lines)
    ? (p.lines as Array<Record<string, unknown>>)
        .filter((l) => l && typeof l.label === 'string')
        .map((l) => ({
          label: String(l.label),
          value: String(l.value ?? ''),
          confidence: typeof l.confidence === 'number' ? l.confidence : undefined,
        }))
    : [];
  const warnings = Array.isArray(p.warnings) ? (p.warnings as unknown[]).map(String) : [];
  const totals =
    p.totals && typeof p.totals === 'object'
      ? Object.fromEntries(Object.entries(p.totals as Record<string, unknown>).map(([k, v]) => [k, String(v)]))
      : undefined;
  const bulkRaw = p.bulk && typeof p.bulk === 'object' ? (p.bulk as Record<string, unknown>) : null;
  const bulk = bulkRaw
    ? {
        total: Number(bulkRaw.total ?? 0),
        nuevos: Number(bulkRaw.nuevos ?? 0),
        duplicados: Number(bulkRaw.duplicados ?? 0),
        conErrores: Number(bulkRaw.conErrores ?? 0),
        rows: Array.isArray(bulkRaw.rows) ? (bulkRaw.rows as BulkPreviewRow[]) : [],
      }
    : undefined;
  return { lines, warnings, totals, reversible: p.reversible !== false, bulk };
}

export async function streamAssistant(
  body: {
    message: string;
    conversationId?: string | null;
    context?: Record<string, unknown>;
    attachmentIds?: string[];
    correctionActionId?: string;
  },
  handlers: StreamHandlers,
  signal?: AbortSignal
): Promise<StreamResult> {
  let content = '';
  let receivedDone = false;
  let failed = false;
  const result = (): StreamResult => ({ content, ok: receivedDone && !failed, canFallback: false });
  const fail = (message: string, code?: string): StreamResult => {
    if (!failed) handlers.onError({ message, code });
    failed = true;
    return result();
  };
  const aborted = () => fail('La respuesta fue cancelada. Conservé el contenido recibido.', 'STREAM_ABORTED');
  if (signal?.aborted) return aborted();

  let response: Response;
  try {
    response = await fetch('/api/ai-assistant/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if ((error as Error)?.name === 'AbortError' || signal?.aborted) return aborted();
    console.error('[GO Assistant] No se pudo abrir el stream:', error);
    return fail('No pude abrir la respuesta. Verifica el historial antes de reintentar.', 'STREAM_CONNECTION_FAILED');
  }

  // 401/403 se devuelven como JSON, no como SSE: la sesión caducó y hay que
  // decirlo, no reintentar por el camino de respaldo.
  if (!response.ok) {
    try {
      const err = await response.json();
      return fail(typeof err.error === 'string' ? err.error : 'No pude responder.', err.code);
    } catch {
      return fail('No pude responder.', String(response.status));
    }
  }

  if (!response.body) return fail('La respuesta llegó vacía. Verifica el historial antes de reintentar.', 'STREAM_INCOMPLETE');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for (;;) {
      if (signal?.aborted) {
        await reader.cancel();
        return receivedDone ? result() : aborted();
      }
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const { events, rest } = drainEvents(buffer);
      buffer = rest;

      for (const { event, data } of events) {
        let payload: Record<string, unknown>;
        try {
          payload = JSON.parse(data);
          if (!payload || typeof payload !== 'object' || Array.isArray(payload)) continue;
        } catch {
          continue;
        }

        switch (event) {
          case 'token':
            content += String(payload.delta ?? '');
            handlers.onToken(String(payload.delta ?? ''));
            break;
          case 'tool_start':
            handlers.onToolStart({ name: String(payload.name), label: String(payload.label) });
            break;
          case 'tool_end':
            handlers.onToolEnd({
              name: String(payload.name),
              label: '',
              summary: String(payload.summary ?? ''),
              ok: Boolean(payload.ok),
            });
            break;
          case 'action':
            handlers.onAction({
              id: String(payload.actionId),
              type: payload.toolName as PendingAction['type'],
              title: (payload.preview as { title?: string })?.title ?? 'Confirmar acción',
              description: (payload.preview as { summary?: string })?.summary ?? '',
              risk: (payload.risk as PendingAction['risk']) ?? 'medium',
              fields: Array.isArray(payload.fields) ? (payload.fields as PendingAction['fields']) : [],
              expiresAt:
                typeof payload.expiresAt === 'string'
                  ? payload.expiresAt
                  : new Date(Date.now() + 30 * 60 * 1000).toISOString(),
              preview: toActionPreview(payload.preview),
            });
            break;
          case 'question':
            handlers.onQuestion?.({
              question: String(payload.question ?? ''),
              options: Array.isArray(payload.options)
                ? (payload.options as Array<Record<string, unknown>>)
                    .filter((o) => o && typeof o.label === 'string')
                    .map((o) => ({ key: String(o.key ?? ''), label: String(o.label), value: typeof o.value === 'string' ? o.value : undefined }))
                : [],
              allowOther: payload.allowOther !== false,
            });
            break;
          case 'usage':
            handlers.onUsage({
              model: String(payload.model ?? ''),
              credits: Number(payload.credits ?? 0),
            });
            break;
          case 'meta':
            if (typeof payload.conversationId === 'string') {
              handlers.onMeta({ conversationId: payload.conversationId });
            }
            break;
          case 'error':
            fail(String(payload.message ?? 'No pude responder.'), payload.code ? String(payload.code) : undefined);
            break;
          case 'done':
            receivedDone = true;
            if (!content && typeof payload.content === 'string') content = payload.content;
            break;
          default:
            break;
        }
      }
    }
  } catch (error) {
    if (receivedDone) return result();
    if ((error as Error)?.name === 'AbortError' || signal?.aborted) return aborted();
    console.error('[GO Assistant] El stream se cortó:', error);
    return fail('La conexión se interrumpió. Conservé el contenido recibido; verifica el historial antes de reintentar.', 'STREAM_INCOMPLETE');
  } finally {
    reader.releaseLock();
  }

  if (!receivedDone) return fail('La respuesta quedó incompleta. Conservé el contenido recibido; verifica el historial antes de reintentar.', 'STREAM_INCOMPLETE');
  return result();
}
