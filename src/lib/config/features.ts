/**
 * Feature flags de GoAdmin ERP.
 *
 * Controlan la visibilidad de funcionalidades en desarrollo o temporalmente
 * deshabilitadas.
 */

/**
 * Facturación electrónica: GoAdmin ERP no ofrece actualmente el servicio de
 * facturación electrónica. Esta bandera oculta todas las referencias en la UI
 * (menús, formularios, configuración) sin eliminar la lógica subyacente.
 *
 * Para reactivar: cambiar a `true` y reiniciar el build.
 */
export const MOSTRAR_FACTURA_ELECTRONICA = false;
