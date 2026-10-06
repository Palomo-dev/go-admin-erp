/**
 * Valor propio de un campo heredable del documento V2 (`{ mode: 'value' }`);
 * `null` si hereda, está vacío o no existe. Puro: lo usan el Resumen (servidor)
 * y el asistente (navegador).
 */
import type { CampoHeredable } from '@/lib/website/contrato/documentoSitio';

export function valorCampo<T>(campo: CampoHeredable<T> | undefined): T | null {
  return campo && campo.mode === 'value' ? campo.value : null;
}
