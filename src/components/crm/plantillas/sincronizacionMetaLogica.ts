/**
 * «Sincronizar con Meta» de la pestaña WhatsApp de Plantillas. Lógica pura.
 *
 * La integración es real: `POST /api/crm/whatsapp/templates/sync` →
 * `syncFromMeta` (Graph `GET /{WABA_ID}/message_templates`, o los estados de
 * aprobación de Twilio si el canal es de Twilio). Exige admin de la
 * organización (`withWhatsAppRoute({ admin: true })`) y un canal activo.
 * Aquí solo se decide qué estado HONESTO mostrar.
 */

export type EstadoSincronizacion = 'cargando' | 'lista' | 'sinCanal' | 'sinPermiso';
export type ErrorSincronizacion = 'sinCanal' | 'sinPermiso' | 'proveedor' | 'error';

/** Evento de ventana: la pestaña WhatsApp recarga su lista al recibirlo. */
export const EVENTO_PLANTILLAS_SINCRONIZADAS = 'crm:plantillas-whatsapp-sincronizadas';

export function estadoSincronizacion(
  datos: { canales: readonly { status: string }[]; puedeGestionar: boolean } | null,
): EstadoSincronizacion {
  if (!datos) return 'cargando';
  if (!datos.canales.some((c) => c.status === 'active')) return 'sinCanal';
  if (!datos.puedeGestionar) return 'sinPermiso';
  return 'lista';
}

/** Error de la ruta (`ApiError` de `whatsapp/api`: `code` y `status`) → estado. */
export function errorSincronizacion(e: { code?: string; status?: number } | null | undefined): ErrorSincronizacion {
  if (!e) return 'error';
  if (e.code === 'NO_CHANNEL') return 'sinCanal';
  if (e.code === 'ADMIN_REQUIRED' || e.status === 401 || e.status === 403) return 'sinPermiso';
  if (e.code === 'PROVIDER' || e.status === 502) return 'proveedor';
  return 'error';
}
