/**
 * Cliente (navegador) de las rutas del Chat que resuelve el servidor:
 * agentes y asignación (`/api/chat/agentes`, `/api/chat/conversaciones/[id]/asignacion`)
 * y la IA de apoyo al agente (`/api/chat/ai/generate-response`,
 * `/api/chat/ai/generate-summary`, que comprueban y cobran créditos en el
 * servidor), el bloqueo del contacto (`/api/chat/conversaciones/[id]/bloqueo`)
 * y el 👍/👎 de la IA (`/api/chat/ai/trabajos/[id]/valoracion`). La
 * organización sale de la sesión: nunca se envía.
 */
import type { AgenteChat } from './agentesChat';
import type { BloqueoContacto } from './bloqueoContacto';
import type { MotivoValoracion, VotoValoracion } from './valoracionIa';

export class ErrorChatApi extends Error {
  codigo: string;
  estado: number;
  constructor(mensaje: string, codigo: string, estado: number) {
    super(mensaje);
    this.name = 'ErrorChatApi';
    this.codigo = codigo;
    this.estado = estado;
  }
}

async function llamar<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', cache: 'no-store', ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || json.success === false) {
    throw new ErrorChatApi(String(json.error ?? json.message ?? `Error ${res.status}`), String(json.code ?? `HTTP_${res.status}`), res.status);
  }
  return json as T;
}

export const chatApi = {
  /** Personas con acceso al Chat (nombre, avatar, cargo, abiertas). */
  agentes: async (): Promise<AgenteChat[]> => (await llamar<{ data: AgenteChat[] }>('/api/chat/agentes')).data,

  /** Asigna la conversación (o la deja sin asignar con `null`). */
  asignar: async (conversationId: string, memberId: number | null): Promise<AgenteChat | null> =>
    (
      await llamar<{ asignado: AgenteChat | null }>(`/api/chat/conversaciones/${conversationId}/asignacion`, {
        method: 'PUT',
        body: JSON.stringify({ memberId }),
      })
    ).asignado,

  /** Respuesta sugerida por la IA (descuenta créditos en el servidor). */
  sugerirRespuesta: async (conversationId: string): Promise<{ texto: string; jobId: string | null }> => {
    const r = await llamar<{ response: string; jobId?: string | null }>('/api/chat/ai/generate-response', {
      method: 'POST',
      body: JSON.stringify({ conversationId }),
    });
    return { texto: r.response ?? '', jobId: r.jobId ?? null };
  },

  /** Bloquea el contacto de la conversación. */
  bloquearContacto: async (conversationId: string): Promise<BloqueoContacto | null> =>
    (await llamar<{ bloqueo: BloqueoContacto | null }>(`/api/chat/conversaciones/${conversationId}/bloqueo`, { method: 'POST', body: '{}' })).bloqueo,

  desbloquearContacto: async (conversationId: string): Promise<void> => {
    await llamar(`/api/chat/conversaciones/${conversationId}/bloqueo`, { method: 'DELETE' });
  },

  /** 👍/👎 de una respuesta de la IA, ligado a su trabajo (`ai_jobs`). */
  valorarRespuesta: async (jobId: string, valoracion: { voto: VotoValoracion; motivo?: MotivoValoracion | null; comentario?: string | null }): Promise<void> => {
    await llamar(`/api/chat/ai/trabajos/${jobId}/valoracion`, { method: 'PUT', body: JSON.stringify(valoracion) });
  },

  /** Resumen de la conversación por la IA (descuenta créditos en el servidor). */
  generarResumen: async (conversationId: string): Promise<{ resumen: string; puntos: string[]; sentimiento: string | null }> => {
    const r = await llamar<{ summary: string; keyPoints?: string[]; sentiment?: string | null }>('/api/chat/ai/generate-summary', {
      method: 'POST',
      body: JSON.stringify({ conversationId }),
    });
    return { resumen: r.summary ?? '', puntos: r.keyPoints ?? [], sentimiento: r.sentiment ?? null };
  },
};
