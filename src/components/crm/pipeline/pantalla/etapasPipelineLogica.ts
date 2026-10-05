/**
 * Orden de la hoja «Etapas del pipeline».
 *
 * La hoja crea la etapa al final (`max(position) + 1`) y no tenía cómo
 * moverla: una etapa nueva quedaba debajo de Perdido. El movimiento reutiliza
 * `reordenar` (el mismo del asistente de pipeline) y la creación se inserta
 * antes de la primera etapa de cierre.
 */
import { indiceAntesDelCierre, reordenar } from '@/components/crm/kit/stageEditorRowLogica';
import type { EtapaApi } from '@/components/crm/oportunidad/oportunidadLogica';

export function etapasOrdenadas(etapas: readonly EtapaApi[]): EtapaApi[] {
  return [...etapas].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, 'es') || a.id.localeCompare(b.id));
}

/** Índice de una etapa nueva: antes de la primera de cierre, o al final si no hay. */
export function indiceNuevaEtapa(etapas: readonly Pick<EtapaApi, 'position' | 'is_won' | 'is_lost'>[]): number {
  return indiceAntesDelCierre([...etapas].sort((a, b) => a.position - b.position));
}

/** Mueve la etapa `desde` hacia `hasta` y renumera `position` 1..N. */
export function moverEtapa(etapas: readonly EtapaApi[], desde: number, hasta: number): EtapaApi[] {
  return reordenar(etapasOrdenadas(etapas), desde, hasta);
}

/** Orden a persistir con `PUT /api/crm/stages`, insertando `idNuevo` antes del cierre. */
export function ordenAlInsertar(etapas: readonly EtapaApi[], idNuevo: string): { id: string; position: number }[] {
  const orden = etapasOrdenadas(etapas).filter((e) => e.id !== idNuevo);
  const ids = orden.map((e) => e.id);
  ids.splice(indiceNuevaEtapa(orden), 0, idNuevo);
  return ids.map((id, n) => ({ id, position: n + 1 }));
}
