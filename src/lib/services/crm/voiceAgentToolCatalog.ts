// Catálogo puro compartido: navegador y runtime consumen la misma fuente.
export const OPPORTUNITY_WRITABLE_FIELDS = [
  'amount',
  'expected_close_date',
  'next_contact_at',
  'temperature',
  'contact_result',
  'next_action',
  'competitor_name',
] as const;

// ─── Definiciones para el LLM (forma de chat.completions) ────────────────────

export interface ChatToolDefinition {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

const fn = (
  name: string,
  description: string,
  parameters: Record<string, unknown>
): ChatToolDefinition => ({ type: 'function', function: { name, description, parameters } });

/**
 * M-F6-29: forma anidada `{type:'function', function:{...}}`, la que exige
 * `chat.completions`. La forma plana anterior era la de la Responses API.
 */
export const VOICE_AGENT_TOOL_DEFINITIONS: ChatToolDefinition[] = [
  fn('get_customer_context', 'Obtiene datos del cliente, sus oportunidades abiertas, actividades y tareas.', {
    type: 'object',
    properties: { customer_id: { type: 'string', description: 'ID del cliente' } },
    required: [],
  }),
  fn('move_opportunity_stage', 'Mueve la oportunidad a otra etapa del embudo. No puede cerrar (ganada/perdida).', {
    type: 'object',
    properties: {
      opportunity_id: { type: 'string' },
      stage_id: { type: 'string' },
    },
    required: ['stage_id'],
  }),
  fn('update_opportunity_field', 'Actualiza un dato de la oportunidad averiguado en la llamada.', {
    type: 'object',
    properties: {
      field: { type: 'string', enum: [...OPPORTUNITY_WRITABLE_FIELDS] },
      value: { type: 'string' },
    },
    required: ['field', 'value'],
  }),
  fn('create_task', 'Crea una tarea de seguimiento para el vendedor.', {
    type: 'object',
    properties: {
      title: { type: 'string' },
      description: { type: 'string' },
      due_date: { type: 'string', description: 'ISO 8601' },
    },
    required: ['title'],
  }),
  fn('book_meeting', 'Agenda una reunión (demo) con el vendedor en la fecha y hora que el cliente aceptó. Confirma antes el día y la hora en voz alta.', {
    type: 'object',
    properties: {
      start_at: {
        type: 'string',
        description:
          'Inicio en ISO 8601 CON el desfase de la zona horaria indicada en las instrucciones, p. ej. 2026-10-02T10:00:00-05:00. Calcúlalo a partir de la fecha y hora actuales que te dieron, nunca de tu conocimiento.',
      },
      duration_minutes: { type: 'number' },
      title: { type: 'string' },
      notes: { type: 'string' },
    },
    required: ['start_at'],
  }),
  fn('schedule_callback', 'Programa devolver la llamada más tarde.', {
    type: 'object',
    properties: {
      when: { type: 'string', description: 'Momento en ISO 8601' },
      reason: { type: 'string' },
    },
    required: ['when'],
  }),
  fn('log_objection', 'Registra la objeción o el motivo por el que el cliente no avanza.', {
    type: 'object',
    properties: { objection: { type: 'string' }, detail: { type: 'string' } },
    required: ['objection'],
  }),
  fn('send_payment_link', 'Deja preparado el envío del enlace de pago al cliente.', {
    type: 'object',
    properties: { amount: { type: 'number' }, concept: { type: 'string' } },
    required: [],
  }),
  fn('log_consent_opt_out', 'El cliente pide no recibir más llamadas: registra la baja voluntaria.', {
    type: 'object',
    properties: {
      channel: { type: 'string', enum: ['voice', 'email', 'whatsapp', 'sms'] },
      reason: { type: 'string' },
    },
    required: [],
  }),
  fn('transfer_to_human', 'Transfiere la llamada a una persona del equipo.', {
    type: 'object',
    properties: { reason: { type: 'string' } },
    required: [],
  }),
  fn('end_call', 'Termina la llamada dejando registrado el desenlace.', {
    type: 'object',
    properties: { outcome: { type: 'string' } },
    required: [],
  }),
];

export const ALL_TOOL_NAMES = VOICE_AGENT_TOOL_DEFINITIONS.map((t) => t.function.name);

/**
 * Herramientas OBLIGATORIAS en toda llamada (F-NEW-7 · D9 · Ley 1581 de 2012).
 * No se pueden desmarcar en la UI ni acotar desde la etapa del embudo: sin
 * `log_consent_opt_out` el agente no puede registrar un «no me vuelva a llamar»,
 * y sin `end_call` no puede colgar después de registrarlo.
 * `agentRuntime.buildRuntimeConfig` las añade siempre a `allowedTools`.
 */
export const MANDATORY_TOOLS = ['log_consent_opt_out', 'end_call'] as const;

/** Definiciones filtradas por las tools permitidas del agente/etapa. */
export function toolDefinitionsFor(allowed: string[]): ChatToolDefinition[] {
  if (!allowed || allowed.length === 0) return [];
  return VOICE_AGENT_TOOL_DEFINITIONS.filter((t) => allowed.includes(t.function.name));
}

