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

/**
 * Solo propiedades PROPIAS: los ids de campo los escribe el usuario
 * (DiscoveryConfigDialog), y un id como `toString` o `constructor` resolvería
 * por el prototipo de `{}` y contaría como respondido (tester F2, 2026-09-21).
 */
function answerOf(values: Record<string, unknown>, id: string): unknown {
  return Object.prototype.hasOwnProperty.call(values, id) ? values[id] : undefined;
}

export function discoveryProgress(fields: DiscoveryField[], values: Record<string, unknown>): DiscoveryProgress {
  let answered = 0;
  let requiredAnswered = 0;
  let requiredTotal = 0;
  for (const field of fields) {
    const ok = hasAnswer(answerOf(values, field.id));
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
  return fields.filter((f) => f.required && !hasAnswer(answerOf(values, f.id)));
}

export interface DiscoveryDataProgress {
  completed: number;
  total: number;
  /** Etiquetas (no ids) de lo que bloquea el gate, en el orden de la plantilla. */
  missing: string[];
}

/**
 * Progreso de discovery a partir del valor crudo de `opportunities.discovery_data`,
 * para `stageGateService` (criterio `discovery` sin `requiredKeys` y
 * `require_discovery` plano).
 *
 * `discovery_data` real es un mapa plano `{ [fieldId]: valor }` — la forma
 * que escribe `DiscoverySection.tsx` vía `opportunitiesService.updateOpportunity`
 * y que lee `discoveryProgress()` arriba. NO es la forma anidada
 * `{ sections: [{ answers: [...] }] }` que declara `discoveryService.ts`: esa
 * ruta (`/api/crm/discovery/[opportunityId]`) no tiene ningún `fetch` en el
 * front y, contra la BD real (verificado 2026-09-21, proyecto
 * jgmgphmzusbluqhuqihj), ninguna oportunidad con `discovery_data` no vacío
 * tiene esa forma — es el mismo tipo de trampa que `DiscoveryWizard` (ver
 * comentario de archivo arriba), no la «forma real» a la que hay que migrar
 * el gate.
 *
 * `completed`/`total` cuentan TODOS los campos de la plantilla (obligatorios
 * u opcionales, igual que `discoveryProgress()`); `missing` nombra solo lo
 * que bloquea: los campos obligatorios sin responder o —si la plantilla no
 * marca ninguno obligatorio, como las sembradas hoy— cualquier campo sin
 * responder (mismo criterio que `complete` arriba).
 *
 * Compatibilidad: si `discoveryData` ya trae `completed_sections`/
 * `total_sections` numéricos (forma vieja hipotética, previa a esta
 * plantilla), se respetan tal cual. Sin plantilla no hay nombres que dar:
 * se agrega un único `missing` genérico cuando `completed < total`, para que
 * `total > 0 && missing.length === 0` siga siendo la regla de «pasa» en
 * ambos casos.
 */
export function discoveryDataProgress(discoveryData: unknown, fields: DiscoveryField[]): DiscoveryDataProgress {
  const dd = discoveryData && typeof discoveryData === 'object' ? (discoveryData as Record<string, unknown>) : {};

  if (typeof dd.completed_sections === 'number' && typeof dd.total_sections === 'number') {
    const completed = dd.completed_sections;
    const total = dd.total_sections;
    return {
      completed,
      total,
      missing: completed < total ? ['secciones pendientes (dato en formato antiguo, sin detalle)'] : [],
    };
  }

  const progress = discoveryProgress(fields, dd);
  const hasRequired = fields.some((f) => f.required);
  const missingFields = hasRequired ? missingRequired(fields, dd) : fields.filter((f) => !hasAnswer(answerOf(dd, f.id)));
  return {
    completed: progress.answered,
    total: progress.total,
    missing: missingFields.map((f) => f.label),
  };
}
