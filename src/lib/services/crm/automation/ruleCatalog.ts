/**
 * Catálogo declarativo de disparadores y acciones para la interfaz de
 * Automatizaciones (brief UX 6.2). Es puro: no importa `actions.ts` (que trae
 * el cliente de correo y la cola) para poder usarse en el navegador.
 *
 * Las pruebas (`__tests__/ruleHumanizer.test.ts`) verifican que este catálogo
 * coincide con `AUTOMATION_ACTION_TYPES`, `NOT_IMPLEMENTED_ACTIONS` y
 * `UPDATE_FIELD_ALLOWLIST` del motor: si el motor cambia, aquí se ve en rojo.
 */

import { ACTIVITY_TYPES } from '@/lib/crm/enums';

/**
 * Qué parte del ámbito (pipeline / etapa) USA el motor para cada disparador.
 * Es un espejo literal de `matchesTriggerConfig` (automationService.ts):
 *  - `stage_change` compara `stage_id` y `pipeline_id`;
 *  - `event` compara solo `pipeline_id`;
 *  - `field_change`, `schedule` y `manual` no miran ninguno de los dos.
 * El editor muestra únicamente los campos que el motor lee; los valores que
 * ya tenga la regla se conservan aunque el disparador no los use (R1: nunca
 * se borra un dato en silencio). Verificado por test contra el motor.
 */
export type TriggerScope = 'pipeline_stage' | 'pipeline' | 'none';

export interface TriggerOption {
  value: string;
  /** Etiqueta corta para el selector. */
  label: string;
  /** Explicación de una línea para quien no conoce el motor. */
  hint: string;
  /** Qué campos de ámbito lee el motor con este disparador. */
  scope: TriggerScope;
}

export const TRIGGER_OPTIONS: readonly TriggerOption[] = [
  { value: 'stage_change', label: 'Una oportunidad cambia de etapa', hint: 'Se dispara al mover una oportunidad. Puedes acotar a un pipeline y una etapa concreta.', scope: 'pipeline_stage' },
  { value: 'event', label: 'Ocurre un evento del CRM', hint: 'Se dispara con un evento del sistema (por ejemplo, opportunity.created). Puedes acotar a un pipeline.', scope: 'pipeline' },
  { value: 'field_change', label: 'Cambia un dato de una oportunidad', hint: 'Se dispara cuando se actualiza una oportunidad, en cualquier pipeline y etapa.', scope: 'none' },
  { value: 'schedule', label: 'Según programación', hint: 'La evalúa el barrido programado del servidor.', scope: 'none' },
  { value: 'manual', label: 'Alguien la ejecuta a mano', hint: 'Solo se ejecuta desde el botón de ejecutar o el asistente.', scope: 'none' },
] as const;

/**
 * Evento (`automation_rules.event`) que corresponde a cada disparador.
 * Vive aquí, en el módulo puro, para que el editor (navegador) y el motor
 * (`automationService`, que lo reexporta) usen exactamente la misma función.
 * `evaluateTrigger` descarta una regla cuyo `event` no coincide con el del
 * outbox, así que un `event` desfasado deja la regla muda (R2).
 */
export function defaultEventFor(triggerType: string | undefined): string | null {
  switch (triggerType) {
    case 'stage_change':
      return 'opportunity.stage_changed';
    case 'field_change':
      return 'opportunity.updated';
    default:
      return null;
  }
}

export interface KnownEvent {
  value: string;
  label: string;
  hint: string;
}

/**
 * Eventos del outbox (`crm_events.event_type`, FASE-08 §2.3) que el motor
 * enruta al disparador `event` (`triggerTypeForEvent`). Los de etapa
 * (`opportunity.stage_changed`, `.won`, `.lost`) y de campo
 * (`opportunity.updated`) NO van aquí: van a sus propios disparadores y una
 * regla de tipo `event` con ese nombre no dispararía nunca. Verificado por
 * test contra `triggerTypeForEvent`.
 */
export const KNOWN_EVENTS: readonly KnownEvent[] = [
  { value: 'opportunity.created', label: 'Se crea una oportunidad', hint: 'Al insertar una oportunidad nueva.' },
  { value: 'call.completed', label: 'Termina una llamada', hint: 'Al cerrar una llamada del módulo de voz.' },
  { value: 'call.analyzed', label: 'Se analiza una llamada', hint: 'Cuando el análisis posterior a la llamada queda listo.' },
  { value: 'email.opened', label: 'Se abre un email', hint: 'El cliente abrió un correo enviado desde el CRM.' },
  { value: 'email.clicked', label: 'Se hace clic en un email', hint: 'El cliente pulsó un enlace de un correo.' },
  { value: 'email.replied', label: 'Responden un email', hint: 'Llega una respuesta al hilo de un correo.' },
  { value: 'email.bounced', label: 'Rebota un email', hint: 'El correo no se pudo entregar.' },
  { value: 'whatsapp.inbound', label: 'Llega un WhatsApp', hint: 'Mensaje entrante del cliente por WhatsApp.' },
  { value: 'task.overdue', label: 'Vence una tarea', hint: 'Una tarea de la oportunidad pasó su fecha límite.' },
  { value: 'sla.breached', label: 'Se incumple un SLA de etapa', hint: 'La oportunidad lleva más días en la etapa que su SLA.' },
] as const;

export function knownEvent(value: unknown): KnownEvent | undefined {
  return KNOWN_EVENTS.find((e) => e.value === String(value));
}

/**
 * Eventos que `triggerTypeForEvent` desvía a `stage_change` / `field_change`.
 * Una regla de tipo `event` con uno de estos nombres no dispara nunca: el
 * editor no los ofrece ni los acepta como texto libre, y al cambiar a
 * disparador `event` no se arrastran desde el `event` que puso el motor.
 * Verificado por test contra `triggerTypeForEvent`.
 */
export const ENGINE_ROUTED_EVENTS: readonly string[] = [
  'opportunity.stage_changed', 'opportunity.won', 'opportunity.lost',
  'opportunity.updated', 'opportunity.field_changed',
] as const;

export function isEngineRoutedEvent(value: unknown): boolean {
  return ENGINE_ROUTED_EVENTS.includes(String(value));
}

export type FieldKind = 'text' | 'number' | 'textarea' | 'template' | 'sequence' | 'stage' | 'entity' | 'field_name' | 'activity_type';

export interface ActionFieldDef {
  key: string;
  label: string;
  kind: FieldKind;
  placeholder?: string;
  hint?: string;
}

export interface ActionCatalogEntry {
  type: string;
  /** Infinitivo corto: «Enviar email». */
  label: string;
  /** Una línea que explica qué hace de verdad. */
  hint: string;
  implemented: boolean;
  fields: readonly ActionFieldDef[];
  /** Valores con los que nace una ficha nueva de este tipo. */
  defaults: Record<string, unknown>;
}

/** Espejo de `UPDATE_FIELD_ALLOWLIST` (actions.ts). Verificado por test. */
export const UPDATE_FIELD_OPTIONS: Record<string, readonly string[]> = {
  opportunities: ['temperature', 'next_contact_at', 'next_action', 'expected_close_date', 'amount', 'recontact_at', 'source', 'deal_type'],
  customers: ['lifecycle_stage', 'tags'],
  tasks: ['priority', 'due_date'],
};

export const UPDATE_FIELD_ENTITY_LABELS: Record<string, string> = {
  opportunities: 'la oportunidad',
  customers: 'el cliente',
  tasks: 'la tarea',
};

/** Tipos de actividad válidos: la misma lista que valida el motor. */
export const ACTIVITY_TYPE_OPTIONS: readonly string[] = ACTIVITY_TYPES;

export const ACTION_CATALOG: readonly ActionCatalogEntry[] = [
  {
    type: 'send_email', label: 'Enviar email', implemented: true,
    hint: 'Al cliente de la oportunidad. Se respeta su consentimiento y la baja voluntaria.',
    fields: [
      { key: 'subject', label: 'Asunto', kind: 'text', placeholder: 'Seguimiento de {{opportunity_name}}' },
      { key: 'template_id', label: 'Plantilla', kind: 'template', hint: 'Si eliges plantilla, el contenido de abajo se ignora.' },
      { key: 'html', label: 'Contenido (HTML)', kind: 'textarea', placeholder: '<p>Hola {{first_name|cliente}}</p>' },
    ],
    defaults: { subject: '' },
  },
  {
    type: 'send_whatsapp', label: 'Enviar WhatsApp', implemented: true,
    hint: 'Solo dentro de la ventana de 24 h; fuera de ella hace falta una plantilla aprobada (HSM).',
    fields: [
      { key: 'text', label: 'Texto', kind: 'textarea', placeholder: 'Hola {{first_name|cliente}}, …' },
      { key: 'template_id', label: 'Plantilla HSM', kind: 'template' },
    ],
    defaults: { text: '' },
  },
  {
    type: 'create_task', label: 'Crear tarea', implemented: true,
    hint: 'Para el responsable de la oportunidad.',
    fields: [
      { key: 'title', label: 'Título', kind: 'text', placeholder: 'Llamar a {{customer_name}}' },
      { key: 'due_in_days', label: 'Vence en (días)', kind: 'number', placeholder: '3' },
      { key: 'description', label: 'Descripción', kind: 'textarea' },
    ],
    defaults: { title: '' },
  },
  {
    type: 'create_activity', label: 'Registrar actividad', implemented: true,
    hint: 'Deja constancia en la línea de tiempo de la oportunidad.',
    fields: [
      { key: 'activity_type', label: 'Tipo', kind: 'activity_type' },
      { key: 'notes', label: 'Notas', kind: 'textarea' },
    ],
    defaults: { activity_type: 'system' },
  },
  {
    type: 'update_field', label: 'Cambiar un dato', implemented: true,
    hint: 'Solo campos de la lista permitida; el motor valida el valor.',
    fields: [
      { key: 'entity', label: 'De', kind: 'entity' },
      { key: 'field_name', label: 'Campo', kind: 'field_name' },
      { key: 'field_value', label: 'Nuevo valor', kind: 'text', placeholder: 'hot' },
    ],
    defaults: { entity: 'opportunities', field_name: 'temperature', field_value: '' },
  },
  {
    type: 'enroll_sequence', label: 'Inscribir en secuencia', implemented: true,
    hint: 'La secuencia enviará sus mensajes según su propio calendario.',
    fields: [{ key: 'sequence_id', label: 'Secuencia', kind: 'sequence' }],
    defaults: {},
  },
  {
    type: 'unenroll_sequence', label: 'Sacar de secuencia', implemented: true,
    hint: 'Detiene los mensajes pendientes de esa secuencia.',
    fields: [
      { key: 'sequence_id', label: 'Secuencia', kind: 'sequence' },
      { key: 'reason', label: 'Motivo', kind: 'text' },
    ],
    defaults: {},
  },
  {
    type: 'notify_user', label: 'Avisar al responsable', implemented: true,
    hint: 'Notificación interna, no sale al cliente.',
    fields: [
      { key: 'title', label: 'Título', kind: 'text' },
      { key: 'content', label: 'Contenido', kind: 'textarea' },
    ],
    defaults: { title: '' },
  },
  {
    type: 'move_stage', label: 'Mover de etapa', implemented: true,
    hint: 'Cambia la oportunidad a otra etapa del pipeline.',
    fields: [{ key: 'stage_id', label: 'Etapa destino', kind: 'stage' }],
    defaults: {},
  },
  { type: 'send_sms', label: 'Enviar SMS', hint: 'Todavía no disponible.', implemented: false, fields: [], defaults: {} },
  { type: 'start_ai_agent', label: 'Lanzar agente IA', hint: 'Todavía no disponible.', implemented: false, fields: [], defaults: {} },
  { type: 'ai_draft_email', label: 'Redactar email con IA', hint: 'Todavía no disponible.', implemented: false, fields: [], defaults: {} },
  { type: 'book_meeting_request', label: 'Solicitar reunión', hint: 'Todavía no disponible.', implemented: false, fields: [], defaults: {} },
  { type: 'webhook_out', label: 'Webhook saliente', hint: 'Todavía no disponible.', implemented: false, fields: [], defaults: {} },
] as const;

export function actionEntry(type: unknown): ActionCatalogEntry | undefined {
  return ACTION_CATALOG.find((a) => a.type === String(type));
}

export function triggerOption(type: unknown): TriggerOption | undefined {
  return TRIGGER_OPTIONS.find((t) => t.value === String(type));
}
