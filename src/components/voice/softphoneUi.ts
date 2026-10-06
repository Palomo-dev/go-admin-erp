/**
 * Abre el marcador del softphone que ya vive en el shell (`SoftphoneDock`).
 * No inicia una llamada ni monta un segundo softphone: solo lo despliega.
 */
export const OPEN_SOFTPHONE_EVENT = 'crm:open-softphone';

export function abrirMarcador(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(OPEN_SOFTPHONE_EVENT));
}
