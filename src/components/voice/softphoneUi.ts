/** Abre el marcador existente. No inicia llamadas ni crea un segundo softphone. */
export const OPEN_SOFTPHONE_EVENT = "crm:open-softphone";
export function abrirMarcador() {
  window.dispatchEvent(new Event(OPEN_SOFTPHONE_EVENT));
}
