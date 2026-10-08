/**
 * Resultado de cada llamada del agente de voz, en categorías fijas.
 *
 * Módulo PURO. Lo usan el ws-server al cerrar la conversación
 * (`conversationRelayHandler.endSession`), la herramienta `end_call`, el
 * `statusCallback` de Twilio (`/api/voice/ai-agent/status`) y las pruebas.
 *
 * Motivo (pedido del dueño de la org 125, 2026-10-08): de 83 llamadas
 * contestadas en un día, casi ninguna tenía un resultado claro.
 * `voice_agent_calls.outcome` es texto libre («completed», «answered_by_human»,
 * una frase del modelo…) y no se puede contar. `voice_agent_calls.resultado`
 * guarda la categoría (CHECK con esta misma lista) y `outcome` sigue con el
 * detalle legible.
 *
 * Orden de las reglas: primero lo que se SABE (el estado de Twilio y las
 * herramientas que sí se aplicaron), luego lo que declaró el modelo al colgar,
 * luego el texto del desenlace y, al final, cuántas veces habló la persona.
 */

/** Categorías que puede declarar el agente en `end_call`. */
export const RESULTADOS_AGENTE = [
  'cita_agendada',
  'devolver_llamada',
  'interesado',
  'pide_informacion',
  'no_es_encargado',
  'sin_interes',
  'no_contactar',
  'numero_equivocado',
  'conversacion_sin_resultado',
] as const;

/** Todas las categorías (mismo orden que el CHECK de `voice_agent_calls.resultado`). */
export const RESULTADOS_LLAMADA = [
  ...RESULTADOS_AGENTE,
  'transferida',
  'colgo_en_saludo',
  'buzon',
  'fax',
  'no_contesto',
  'ocupado',
  'fallida',
] as const;

export type ResultadoAgente = (typeof RESULTADOS_AGENTE)[number];
export type ResultadoLlamada = (typeof RESULTADOS_LLAMADA)[number];

/** Resultados en los que sí hubo conversación con una persona. */
export const RESULTADOS_CON_CONVERSACION: readonly ResultadoLlamada[] = [...RESULTADOS_AGENTE, 'transferida', 'colgo_en_saludo'];

export function esResultadoAgente(v: unknown): v is ResultadoAgente {
  return typeof v === 'string' && (RESULTADOS_AGENTE as readonly string[]).includes(v);
}

export function esResultadoLlamada(v: unknown): v is ResultadoLlamada {
  return typeof v === 'string' && (RESULTADOS_LLAMADA as readonly string[]).includes(v);
}

export interface HerramientaEjecutada {
  tool: string;
  /** `voice_agent_tool_runs.status`: solo cuenta `applied`. */
  status: string;
  args?: Record<string, unknown> | null;
}

export interface EntradaResultado {
  /** `voice_agent_calls.status`. */
  status: string | null;
  /** `voice_agent_calls.outcome` (texto libre). */
  outcome: string | null;
  /** Herramientas de la llamada (`voice_agent_tool_runs`). */
  herramientas?: readonly HerramientaEjecutada[];
  /** Turnos de la persona en la conversación (`role: 'user'`). */
  turnosCliente?: number;
  /** Categoría que declaró el modelo en `end_call` (o la ya guardada). */
  resultadoAgente?: string | null;
}

/** Objeciones de `log_objection` que cuentan como «no me interesa» (`cierreLlamada.ts`). */
const TIPOS_OBJECION_DESINTERES = ['desinteres', 'ya_tiene_solucion'];

const DESENLACES_SIN_INTERES = ['sin_interes_definitivo', 'not_interested', 'opportunity_lost'];
const PATRON_SIN_INTERES = /(sin inter[eé]s|no (le |les |me |nos )?interesa|no (est[aá]|estoy|estamos) interesad)/i;
const PATRON_NO_ENCARGADO = /(no es (el|la) encargad|no es quien|no decide|hablar con (el|la) (gerente|due[nñ]|encargad))/i;
const PATRON_EQUIVOCADO = /(n[uú]mero equivocado|equivocad[oa] de n[uú]mero|no (es|conoce) (ese|el) negocio)/i;
const PATRON_CALLBACK = /^callback\b/i;

function aplicada(hs: readonly HerramientaEjecutada[], tool: string): HerramientaEjecutada[] {
  return hs.filter((h) => h.tool === tool && h.status === 'applied');
}

/** Resultado según el estado de Twilio, para llamadas sin conversación. */
function porEstado(status: string | null, outcome: string | null): ResultadoLlamada | null {
  const o = (outcome ?? '').trim().toLowerCase();
  switch (status) {
    case 'voicemail':
      return 'buzon';
    case 'no_answer':
      return o === 'fax' ? 'fax' : 'no_contesto';
    case 'failed':
      return o === 'busy' ? 'ocupado' : 'fallida';
    case 'transferred':
      return 'transferida';
    default:
      return null;
  }
}

/**
 * Categoría de una llamada. `null` mientras no haya terminado (o si se
 * canceló u omitió antes de marcar: no es una llamada).
 */
export function clasificarResultado(e: EntradaResultado): ResultadoLlamada | null {
  const status = e.status ?? null;
  if (!status || ['pending', 'queued', 'in_progress', 'canceled', 'skipped'].includes(status)) return null;

  const sinConversacion = porEstado(status, e.outcome);
  if (sinConversacion) return sinConversacion;

  const hs = e.herramientas ?? [];
  // Lo que ya quedó hecho manda sobre lo que se dijo.
  if (aplicada(hs, 'log_consent_opt_out').length) return 'no_contactar';
  if (aplicada(hs, 'book_meeting').length) return 'cita_agendada';
  if (aplicada(hs, 'transfer_to_human').length) return 'transferida';
  if (aplicada(hs, 'schedule_callback').length) return 'devolver_llamada';

  if (esResultadoAgente(e.resultadoAgente)) return e.resultadoAgente;

  const texto = (e.outcome ?? '').trim();
  if (DESENLACES_SIN_INTERES.includes(texto.toLowerCase()) || PATRON_SIN_INTERES.test(texto)) return 'sin_interes';
  if (PATRON_NO_ENCARGADO.test(texto)) return 'no_es_encargado';
  if (PATRON_EQUIVOCADO.test(texto)) return 'numero_equivocado';
  if (PATRON_CALLBACK.test(texto)) return 'devolver_llamada';

  const desinteres = aplicada(hs, 'log_objection').some((h) =>
    TIPOS_OBJECION_DESINTERES.includes(String((h.args ?? {}).tipo ?? ''))
  );
  if (desinteres) return 'sin_interes';
  if (aplicada(hs, 'create_task').length) return 'pide_informacion';

  // La persona contestó (a lo sumo un «¿Aló?») y colgó durante el saludo.
  if ((e.turnosCliente ?? 0) <= 1) return 'colgo_en_saludo';
  return 'conversacion_sin_resultado';
}

/** Descripción del parámetro `resultado` de `end_call` para el modelo. */
export const DESCRIPCION_RESULTADO_AGENTE =
  'Categoría del resultado, obligatoria. cita_agendada: quedó una demostración o cita con book_meeting. ' +
  'devolver_llamada: pidió que lo llamen en otro momento. interesado: mostró interés pero no agendó. ' +
  'pide_informacion: prefiere que le escriban o le envíen información. no_es_encargado: quien contestó no decide. ' +
  'sin_interes: no le interesa. no_contactar: pidió no volver a ser llamado. numero_equivocado: el número no ' +
  'es de ese negocio o persona. conversacion_sin_resultado: ninguna de las anteriores.';
