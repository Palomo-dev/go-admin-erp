/**
 * Rutas de las pantallas de Logística (Figma «21 Logística»). Solo direcciones para enlazar
 * entre pantallas; qué páginas ve cada organización y cada persona lo decide el catálogo de
 * navegación (`CATALOGO_NAV`, módulo `logistica`) con los módulos y cargos de la base.
 */
export const RUTAS_LOGISTICA = {
  porDespachar: '/app/logistica/por-despachar',
  envios: '/app/logistica/envios',
  seguimiento: '/app/logistica/seguimiento',
  domiciliarios: '/app/logistica/domiciliarios',
  cuadres: '/app/logistica/cuadres',
  zonas: '/app/logistica/zonas',
  reglas: '/app/logistica/reglas',
  /** Proveedores de envío: son conexiones (Integraciones › Conexiones › Logística). */
  proveedores: '/app/integraciones/conexiones/logistica',
  misEnvios: '/app/logistica/mis-envios',
} as const;

/**
 * Sección del diálogo de Configuración con los ajustes de Logística (la registra
 * `configSectionsRegistry`). Las pantallas la abren con `AtajoConfigurar`: Logística no tiene
 * página «Configuración» propia (docs/configuracion/UNIFICACION-CONFIGURACION.md).
 */
export const SECCION_CONFIGURACION_LOGISTICA = 'logistica.general';

/** Detalle de un envío. */
export function rutaEnvio(id: string): string {
  return `${RUTAS_LOGISTICA.envios}/${encodeURIComponent(id)}`;
}
