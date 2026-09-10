import { pmService, type PMTask } from '@/lib/services/pmService';
import { TASK_PRIORITIES, TASK_STATUSES, type TaskPriority, type TaskStatus } from '@/lib/crm/enums';

/**
 * taskService — ÚNICO punto de creación/actualización de tareas del CRM.
 *
 * Antes había tres caminos distintos que insertaban en `tasks`:
 *   1. `POST /api/crm/tasks` (QuickTaskDialog),
 *   2. `opportunitiesService.createTask` (input rápido del drawer),
 *   3. `pmService.createTask` (TaskCreationPanel «Avanzado»).
 * El (2) escribía `priority: 'medium'`, que viola `tasks_priority_check`
 * (low|med|high|critical) y hacía fallar el guardado en silencio.
 *
 * Ahora la validación y la normalización viven aquí y todos los formularios
 * —modo compacto y modo completo del TaskDialog— pasan por `createTask` /
 * `updateTask`. La escritura final sigue siendo `pmService`, que además
 * recalcula el progreso de proyecto / meta / key result.
 */

export interface TaskFormValues {
  title: string;
  description?: string | null;
  priority?: string | null;
  status?: string | null;
  /** ISO 8601 o `datetime-local`; se normaliza a ISO con zona. */
  due_date?: string | null;
  estimated_hours?: number | string | null;
  actual_hours?: number | string | null;
  assigned_to?: string | null;
  project_id?: string | null;
  goal_id?: string | null;
  type?: string | null;
  customer_id?: string | null;
  related_to_type?: string | null;
  related_to_id?: string | null;
}

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Baja',
  med: 'Media',
  high: 'Alta',
  critical: 'Crítica',
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  open: 'Pendiente',
  in_progress: 'En progreso',
  done: 'Completada',
  canceled: 'Cancelada',
};

/** Alias históricos que aún llegan desde componentes antiguos. */
const PRIORITY_ALIASES: Record<string, TaskPriority> = {
  medium: 'med',
  media: 'med',
  normal: 'med',
  baja: 'low',
  alta: 'high',
  urgent: 'critical',
  urgente: 'critical',
};

const STATUS_ALIASES: Record<string, TaskStatus> = {
  completed: 'done',
  complete: 'done',
  finished: 'done',
  pending: 'open',
  todo: 'open',
  cancelled: 'canceled',
  in_review: 'in_progress',
};

export function normalizeTaskPriority(value: unknown): TaskPriority {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if ((TASK_PRIORITIES as readonly string[]).includes(raw)) return raw as TaskPriority;
  return PRIORITY_ALIASES[raw] ?? 'med';
}

export function normalizeTaskStatus(value: unknown): TaskStatus {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if ((TASK_STATUSES as readonly string[]).includes(raw)) return raw as TaskStatus;
  return STATUS_ALIASES[raw] ?? 'open';
}

/** `2026-09-09T14:30` (datetime-local) → ISO con zona. Vacío → null. */
export function normalizeDueDate(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  let raw = value.trim();
  // `2026-09-09` a secas lo parsea el motor como UTC y en América cae el día
  // anterior. Con la hora explícita se interpreta en la zona del usuario.
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) raw = `${raw}T00:00`;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function normalizeHours(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isFinite(n) ? n : null;
}

function trimOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t ? t : null;
}

/** Devuelve el mensaje de error o `null` si los datos son válidos. */
export function validateTaskValues(values: TaskFormValues): string | null {
  if (!values.title || !values.title.trim()) return 'El título es obligatorio';
  if (values.title.trim().length > 300) return 'El título no puede superar 300 caracteres';
  const hours = normalizeHours(values.estimated_hours);
  if (hours !== null && (hours < 0 || hours > 10000)) return 'Las horas estimadas no son válidas';
  if (values.related_to_type && !values.related_to_id) return 'Falta la entidad relacionada';
  return null;
}

/**
 * Construye la fila de `tasks` a partir del formulario. `forCreate` añade los
 * campos que solo se fijan al insertar (`status`, `type`).
 */
export function buildTaskPayload(
  values: TaskFormValues,
  options: { forCreate: boolean }
): Record<string, unknown> {
  const relatedType = trimOrNull(values.related_to_type);
  const relatedId = relatedType ? trimOrNull(values.related_to_id) : null;
  // Si la tarea cuelga de un cliente, `customer_id` es ese mismo cliente.
  const customerId =
    trimOrNull(values.customer_id) ?? (relatedType === 'customer' ? relatedId : null);

  const payload: Record<string, unknown> = {
    title: values.title.trim(),
    description: trimOrNull(values.description),
    priority: normalizeTaskPriority(values.priority),
    due_date: normalizeDueDate(values.due_date),
    estimated_hours: normalizeHours(values.estimated_hours),
    assigned_to: trimOrNull(values.assigned_to),
    project_id: trimOrNull(values.project_id),
    goal_id: trimOrNull(values.goal_id),
    type: trimOrNull(values.type),
    customer_id: customerId,
    related_to_type: relatedType,
    related_to_id: relatedId,
  };

  if (options.forCreate) {
    payload.status = normalizeTaskStatus(values.status ?? 'open');
  } else {
    payload.status = normalizeTaskStatus(values.status);
    payload.actual_hours = normalizeHours(values.actual_hours);
  }

  return payload;
}

export class TaskValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TaskValidationError';
  }
}

/** Crea la tarea. Lanza `TaskValidationError` si los datos no son válidos. */
export async function createTask(values: TaskFormValues): Promise<PMTask> {
  const invalid = validateTaskValues(values);
  if (invalid) throw new TaskValidationError(invalid);
  return pmService.createTask(buildTaskPayload(values, { forCreate: true }));
}

/** Actualiza la tarea completa (formulario). */
export async function updateTask(taskId: string, values: TaskFormValues): Promise<void> {
  const invalid = validateTaskValues(values);
  if (invalid) throw new TaskValidationError(invalid);
  await pmService.updateTask(taskId, buildTaskPayload(values, { forCreate: false }));
}

/** Cambio puntual de estado (checkbox de la lista). */
export async function setTaskStatus(taskId: string, status: string): Promise<void> {
  await pmService.updateTaskStatus(taskId, normalizeTaskStatus(status));
}

export async function deleteTask(taskId: string): Promise<void> {
  await pmService.deleteTask(taskId);
}

export const crmTaskService = {
  createTask,
  updateTask,
  setTaskStatus,
  deleteTask,
  validateTaskValues,
  buildTaskPayload,
  normalizeTaskPriority,
  normalizeTaskStatus,
  normalizeDueDate,
};
