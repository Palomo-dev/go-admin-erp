/**
 * Rutas públicas de las integraciones de logística. Sin dependencias de servidor: la usa también
 * la pantalla de conexión para mostrar la URL de avisos.
 */

/** URL de avisos (webhook) de una conexión: única por organización y proveedor. Sin dominio. */
export function rutaWebhookLogistica(proveedor: string, connectionId: string): string {
  return `/api/integrations/logistica/${encodeURIComponent(proveedor)}/webhook/${encodeURIComponent(connectionId)}`;
}
