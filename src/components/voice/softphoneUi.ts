/** Abre el marcador existente. No inicia llamadas ni crea un segundo softphone. */
export const OPEN_SOFTPHONE_EVENT = "crm:open-softphone";
/** Estado de presentación del marcador; no representa el estado de la llamada. */
export const SOFTPHONE_VISIBILITY_EVENT = "crm:softphone-visibility";
export function abrirMarcador() {
  window.dispatchEvent(new Event(OPEN_SOFTPHONE_EVENT));
}
