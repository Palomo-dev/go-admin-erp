/**
 * Criterio compartido de "hay datos de cierre" (FASE-09 §4.2, F9-12/F9-37).
 *
 * Vive aparte porque lo usan tanto `opportunityStageService` (guarda de
 * `same_stage` y exigencia del modal) como `opportunityStageReconcile` (para no
 * revertir un cierre ajeno legítimo): un solo criterio, no dos que se separen.
 */

export interface LossInput {
  lossReasonId?: string;
  lossReasonLabel?: string;
  competitor?: string;
  competitorPrice?: number;
  missingFeatures?: string[];
  recontactDate?: string;
  notes?: string;
}

/** `{}` no es "datos de cierre": el modal tiene que aportar algo (F9-12). */
export function hasWonData(v: Record<string, unknown> | undefined): boolean {
  if (!v) return false;
  return Object.values(v).some((x) => x !== null && x !== undefined && x !== '');
}

/** Una pérdida necesita razón; sin ella no se cierra (F9-12). */
export function lossLabel(l: LossInput | undefined): string | null {
  if (!l) return null;
  const label = l.lossReasonLabel || l.lossReasonId || null;
  return label && String(label).trim() ? String(label).trim() : null;
}
