/**
 * Camino ÚNICO de envío de un mensaje del agente en el Chat (regla dura 7).
 * Lo usan la Bandeja y la vista completa de la conversación; antes eran dos
 * implementaciones distintas y la vista completa guardaba directo sin pasar
 * por la API de WhatsApp (ni ventana de 24 h, ni consentimiento, ni créditos).
 *
 *  - WhatsApp → `POST /api/crm/whatsapp/send`, que valida la ventana de 24 h,
 *    el consentimiento (baja), los créditos y crea la actividad del CRM.
 *  - Los demás canales → fila en `messages` con el cliente de la sesión (RLS);
 *    el trigger `trg_channel_dispatch` la entrega al canal y
 *    `update_conversation_last_message` actualiza la conversación. Por eso
 *    aquí NO se toca `conversations` (antes se sumaba dos veces el contador).
 *
 * Archivos y audios se suben primero a Storage (`attachments`) y viajan como URL.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export type CaminoEnvio = 'whatsapp' | 'directo';

/** Qué camino toma un mensaje según el tipo del canal (`channels.type`). */
export function caminoEnvio(tipoCanal: string | null | undefined): CaminoEnvio {
  return (tipoCanal ?? '').toLowerCase() === 'whatsapp' ? 'whatsapp' : 'directo';
}

/** Tipo de contenido de `messages.content_type` para un archivo. */
export function tipoContenidoArchivo(archivo: { type?: string | null } | null | undefined, esAudio = false): 'audio' | 'image' | 'file' {
  if (esAudio || (archivo?.type ?? '').startsWith('audio/')) return 'audio';
  if ((archivo?.type ?? '').startsWith('image/')) return 'image';
  return 'file';
}

/** Error de envío con el código de la API (o uno propio). */
export class ErrorEnvio extends Error {
  codigo: string;
  constructor(mensaje: string, codigo: string) {
    super(mensaje);
    this.name = 'ErrorEnvio';
    this.codigo = codigo;
  }
}

/** Motivo legible (clave de `chatUi.composer.errores`) para un código de error. */
export type MotivoErrorEnvio = 'ventanaCerrada' | 'sinConsentimiento' | 'sinCreditos' | 'demasiados' | 'sinPlantilla' | 'generico';

export function motivoErrorEnvio(codigo: string | null | undefined): MotivoErrorEnvio {
  switch (codigo) {
    case 'WINDOW_CLOSED':
      return 'ventanaCerrada';
    case 'OPTED_OUT':
      return 'sinConsentimiento';
    case 'NO_CREDITS':
      return 'sinCreditos';
    case 'RATE_LIMITED':
    case 'DAILY_LIMIT':
      return 'demasiados';
    case 'TEMPLATE_NOT_APPROVED':
    case 'CHANNEL_NO_TEMPLATES':
    case 'MISSING_VARIABLES':
      return 'sinPlantilla';
    default:
      return 'generico';
  }
}

export interface ConversacionEnvio {
  id: string;
  channel_id: string;
  /** `channels.type` de la conversación. */
  tipoCanal: string | null | undefined;
}

export interface MensajeAEnviar {
  texto?: string | null;
  archivo?: File | null;
  /** El archivo es una nota de voz grabada en el compositor. */
  esAudio?: boolean;
  /** Plantilla aprobada de WhatsApp (ventana de 24 h vencida). Solo WhatsApp. */
  plantilla?: { templateId: string; variables?: Record<string, string> } | null;
}

export interface OpcionesEnvio {
  organizationId: number;
  conversacion: ConversacionEnvio;
  mensaje: MensajeAEnviar;
  /** Cliente del navegador (sesión del usuario, con RLS). */
  supabase: SupabaseClient;
  /** Inyectable en pruebas. */
  fetchFn?: typeof fetch;
}

async function subirArchivo(supabase: SupabaseClient, organizationId: number, conversationId: string, archivo: File): Promise<string> {
  const ext = (archivo.name.split('.').pop() || 'bin').replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'bin';
  const ruta = `chat/${organizationId}/${conversationId}/${Date.now()}_${Math.random().toString(36).slice(2, 9)}.${ext}`;
  const { error } = await supabase.storage.from('attachments').upload(ruta, archivo, { cacheControl: '3600', upsert: false });
  if (error) throw new ErrorEnvio(error.message, 'UPLOAD_FAILED');
  return supabase.storage.from('attachments').getPublicUrl(ruta).data.publicUrl;
}

/** Envía un mensaje del agente por el camino que le toca. Lanza `ErrorEnvio`. */
export async function enviarMensajeConversacion({ organizationId, conversacion, mensaje, supabase, fetchFn }: OpcionesEnvio): Promise<void> {
  const texto = (mensaje.texto ?? '').trim();
  const archivo = mensaje.archivo ?? null;
  const plantilla = mensaje.plantilla ?? null;
  if (!texto && !archivo && !plantilla) throw new ErrorEnvio('Mensaje vacío', 'EMPTY');
  const camino = caminoEnvio(conversacion.tipoCanal);
  if (plantilla && camino !== 'whatsapp') throw new ErrorEnvio('Las plantillas solo existen en WhatsApp', 'CHANNEL_NO_TEMPLATES');

  let contenido = texto;
  let tipo: 'text' | 'audio' | 'image' | 'file' = 'text';
  let metadata: Record<string, unknown> = {};
  if (archivo && !plantilla) {
    contenido = await subirArchivo(supabase, organizationId, conversacion.id, archivo);
    tipo = tipoContenidoArchivo(archivo, mensaje.esAudio);
    metadata = { file_name: archivo.name, file_type: archivo.type, file_size: archivo.size };
  }

  if (camino === 'whatsapp') {
    const res = await (fetchFn ?? fetch)('/api/crm/whatsapp/send', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversationId: conversacion.id,
        channelId: conversacion.channel_id,
        text: plantilla || archivo ? null : contenido,
        template: plantilla ? { templateId: plantilla.templateId, variables: plantilla.variables ?? {} } : null,
        media: archivo && !plantilla ? { url: contenido, mime: archivo.type || 'application/octet-stream', filename: archivo.name, caption: texto || undefined } : null,
      }),
    });
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
      throw new ErrorEnvio(String(json.error ?? `Error ${res.status}`), String(json.code ?? `HTTP_${res.status}`));
    }
    return;
  }

  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id;
  if (!userId) throw new ErrorEnvio('Sin sesión', 'UNAUTHENTICATED');
  const { data: miembro } = await supabase
    .from('organization_members')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();

  const { error } = await supabase.from('messages').insert({
    organization_id: organizationId,
    conversation_id: conversacion.id,
    channel_id: conversacion.channel_id,
    direction: 'outbound',
    role: 'agent',
    sender_member_id: (miembro as { id: number } | null)?.id ?? null,
    content_type: tipo,
    content: contenido,
    metadata,
  });
  if (error) throw new ErrorEnvio(error.message, 'INSERT_FAILED');
}
