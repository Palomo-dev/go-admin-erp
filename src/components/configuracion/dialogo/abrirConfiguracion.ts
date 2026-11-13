/**
 * Abrir el diálogo de Configuración desde cualquier parte de la app (menú de
 * usuario, «Configurar» de un módulo, GO Assistant…), sin depender de dónde
 * esté montado el proveedor: se emite un evento que escucha
 * `ConfiguracionDialogoRaiz` (montado una vez en el layout de /app).
 */
export const EVENTO_ABRIR_CONFIGURACION = 'goadmin:abrir-configuracion';

export interface OpcionesAbrirConfiguracion {
  /** Id estable de la sección (`chat.ia`); sin él, el menú. */
  seccionId?: string | null;
  /** Ajuste a resaltar (`desinteres`). */
  ancla?: string;
  /** Origen de una ruta vieja (aviso «se movió aquí»). */
  movido?: string;
}

export function abrirConfiguracion(opciones: OpcionesAbrirConfiguracion = {}): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<OpcionesAbrirConfiguracion>(EVENTO_ABRIR_CONFIGURACION, { detail: opciones }));
}

/**
 * Última pantalla de la app (ruta + query, sin el diálogo) que se vio en esta
 * pestaña. La página de redirección de `/app/configuracion` abre el diálogo
 * sobre ella; si no hay (se entró directo por el enlace), sobre Inicio.
 */
let ultimaPantalla: string | null = null;

export function recordarPantalla(href: string | null): void {
  ultimaPantalla = href;
}

export function pantallaAnterior(): string | null {
  return ultimaPantalla;
}
