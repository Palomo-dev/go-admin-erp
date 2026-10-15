/**
 * Voice Agent Prompts Module
 * Módulo de plantillas de prompts para agentes de voz
 */

export {
  // Prompts
  PROMPT_ENCUESTA_SATISFACCION,
  FIRST_MESSAGE_ENCUESTA_SATISFACCION,
  PROMPT_PROSPECCION_LEADS_NUEVOS,
  FIRST_MESSAGE_PROSPECCION_LEADS_NUEVOS,
  PROMPT_PROSPECCION_CLIENTES_EXISTENTES,
  FIRST_MESSAGE_PROSPECCION_CLIENTES_EXISTENTES,
  
  // Avisos legales
  AVISO_GRABACION_POLLY,
  AVISO_AGENTE_IA_CON_GRABACION,
  RESPUESTAS_GRABACION,
  RESPUESTA_ERES_ROBOT,
  
  // Utilidades
  fillPromptVariables,
  getOrigenDatoFrase,
  validatePromptVariables,
  
  // Tipos
  type PromptVariables,
} from './templates';
