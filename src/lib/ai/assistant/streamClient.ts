/**
 * GO Assistant — cliente de Server-Sent Events.
 *
 * Se usa `fetch` con lector de stream en vez de `EventSource` porque
 * `EventSource` solo hace GET y no manda cabeceras: aquí hace falta POST con el
 * mensaje y la cookie de sesión.
 *
 * Regla §3.1: **el asistente nunca deja de responder**. Si el stream falla —el
 * navegador no lo soporta, un proxy lo bufferiza, el servidor devuelve un
 * error—, quien llama debe caer al camino de siempre (`/api/ai-assistant/chat`).
 * Por eso los fallos se señalizan y no se lanzan.
 */

import type { PendingAction } from './clientTypes';

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
  onUsage(usage: { model: string; credits: number }): void;
  onMeta(meta: { conversationId: string }): void;
  onError(error: { message: string; code?: string }): void;
}

export interface StreamResult {
  content: string;
  /** `false` = hay que caer al camino de respaldo. */
  ok: boolean;
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
  const parts = buffer.split('\n\n');
  const rest = parts.pop() ?? '';

  for (const raw of parts) {
    let event = 'message';
    const dataLines: string[] = [];
    for (const line of raw.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
    }
    if (dataLines.length > 0) events.push({ event, data: dataLines.join('\n') });
  }

  return { events, rest };
}

export async function streamAssistant(
  body: { message: string; conversationId?: string | null; context?: Record<string, unknown> },
  handlers: StreamHandlers,
  signal?: AbortSignal
): Promise<StreamResult> {
  let content = '';

  let response: Response;
  try {
    response = await fetch('/api/ai-assistant/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') return { content, ok: true };
    console.error('[GO Assistant] No se pudo abrir el stream:', error);
    return { content, ok: false };
  }

  // 401/403 se devuelven como JSON, no como SSE: la sesión caducó y hay que
  // decirlo, no reintentar por el camino de respaldo.
  if (!response.ok) {
    try {
      const err = await response.json();
      handlers.onError({ message: err.error || 'No pude responder.', code: err.code });
    } catch {
      handlers.onError({ message: 'No pude responder.', code: String(response.status) });
    }
    return { content, ok: true };
  }

  if (!response.body) return { content, ok: false };

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const { events, rest } = drainEvents(buffer);
      buffer = rest;

      for (const { event, data } of events) {
        let payload: Record<string, unknown>;
        try {
          payload = JSON.parse(data);
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
            handlers.onError({
              message: String(payload.message ?? 'No pude responder.'),
              code: payload.code ? String(payload.code) : undefined,
            });
            break;
          case 'done':
            if (!content && typeof payload.content === 'string') content = payload.content;
            break;
          default:
            break;
        }
      }
    }
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') return { content, ok: true };
    console.error('[GO Assistant] El stream se cortó:', error);
    // Si ya llegó texto, no se reintenta: se le enseña lo que hay. Reintentar
    // cobraría el turno dos veces.
    return { content, ok: content.length > 0 };
  }

  return { content, ok: true };
}
