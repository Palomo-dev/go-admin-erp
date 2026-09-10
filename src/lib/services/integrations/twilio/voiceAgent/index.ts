/**
 * Voice Agent — Exports
 * GO Admin ERP
 *
 * F0 (REG r1): se eliminaron los motores muertos v1 (OpenAI Realtime +
 * Media Streams: realtimeSession.ts, voiceAgentService.ts), v2
 * (elevenLabsTTS.ts) y v3 (deepgramSTT.ts). El único motor vivo es
 * ConversationRelay (`conversationRelayHandler.ts`), consumido por ws-server.ts.
 */

export { VOICE_AGENT_TOOLS, executeToolCall } from './voiceAgentTools';
export {
  buildVoiceAgentPrompt,
  INTENT_CLASSIFICATION_PROMPT,
  type VoiceAgentContext,
} from './voiceAgentPrompts';

// ConversationRelay (arquitectura principal)
export {
  handleConversationRelayConnection,
  getActiveRelaySessions,
  type ConversationRelaySession,
} from './conversationRelayHandler';
