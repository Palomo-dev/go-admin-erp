/**
 * Voice Agent — Exports
 * GO Admin ERP
 */

export { voiceAgentService } from './voiceAgentService';
export { RealtimeSession } from './realtimeSession';
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

// Voice Agent v2 — ElevenLabs TTS
export { textToSpeech, textToSpeechStream } from './elevenLabsTTS';

// Voice Agent v3 — Deepgram STT
export { createDeepgramStream, transcribeAudio } from './deepgramSTT';
