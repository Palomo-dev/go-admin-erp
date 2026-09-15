/**
 * Progreso del discovery de una oportunidad (FASE-02).
 *
 * Trabaja sobre la forma REAL de `discovery_templates.sections` sembrada en
 * todas las organizaciones («Discovery General/Ventas»): una lista plana de
 * `DiscoveryField`, la que leen `discoveryTemplateService` y
 * `DiscoverySection` del drawer. Es lo único que se rescató del
 * `DiscoveryWizard` muerto, que esperaba secciones con preguntas anidadas y no
 * podía renderizar esa plantilla.
 */

import type { DiscoveryField } from './discoveryTemplateService';

export interface DiscoveryProgress {
  answered: number;
  total: number;
  requiredAnswered: number;
  requiredTotal: number;
  /** Porcentaje entero de campos (obligatorios u opcionales) con respuesta. */
  percent: number;
  /** Todas las obligatorias respondidas; sin obligatorias (plantilla sembrada), todos los campos. */
  complete: boolean;
}

function hasAnswer(value: unknown): boolean {
  if (value == null) return false;
  return String(value).trim() !== '';
}

export function discoveryProgress(fields: DiscoveryField[], values: Record<string, unknown>): DiscoveryProgress {
  let answered = 0;
  let requiredAnswered = 0;
  let requiredTotal = 0;
  for (const field of fields) {
    const ok = hasAnswer(values[field.id]);
    if (ok) answered += 1;
    if (field.required) {
      requiredTotal += 1;
      if (ok) requiredAnswered += 1;
    }
  }
  const total = fields.length;
  const percent = total === 0 ? 0 : Math.round((answered / total) * 100);
  const complete = requiredTotal > 0 ? requiredAnswered === requiredTotal : total > 0 && answered === total;
  return { answered, total, requiredAnswered, requiredTotal, percent, complete };
}

/** Obligatorias sin respuesta, en el orden de la plantilla. */
export function missingRequired(fields: DiscoveryField[], values: Record<string, unknown>): DiscoveryField[] {
  return fields.filter((f) => f.required && !hasAnswer(values[f.id]));
}
