/**
 * Fixtures de respuestas STT (FASE-04 §9.1). Formas verificadas en
 * docs-elevenlabs.md (Scribe v2: words[] con speaker_id/logprob, y
 * multicanal `transcripts[]` con `channel_index`).
 */

/** Scribe v2 single-channel diarizado (SDK camelCase). El cliente habla primero (inbound). */
export const scribeSingleChannel = {
  languageCode: 'spa',
  languageProbability: 0.98,
  text: 'Hola, buenas tardes, llamo por la cotización. Claro que sí, con gusto le ayudo. ¿Me recuerda su nombre? Juan Pérez.',
  transcriptionId: 'stt_single_001',
  words: [
    { text: 'Hola,', type: 'word', start: 0.1, end: 0.4, speakerId: 'speaker_0', logprob: -0.02 },
    { text: ' ', type: 'spacing', start: 0.4, end: 0.45 },
    { text: 'buenas', type: 'word', start: 0.45, end: 0.8, speakerId: 'speaker_0', logprob: -0.05 },
    { text: 'tardes,', type: 'word', start: 0.8, end: 1.1, speakerId: 'speaker_0', logprob: -0.01 },
    { text: 'llamo', type: 'word', start: 1.2, end: 1.5, speakerId: 'speaker_0', logprob: -0.03 },
    { text: 'por', type: 'word', start: 1.5, end: 1.6, speakerId: 'speaker_0', logprob: -0.01 },
    { text: 'la', type: 'word', start: 1.6, end: 1.7, speakerId: 'speaker_0', logprob: -0.01 },
    { text: 'cotización.', type: 'word', start: 1.7, end: 2.3, speakerId: 'speaker_0', logprob: -0.08 },
    { text: 'Claro', type: 'word', start: 2.9, end: 3.2, speakerId: 'speaker_1', logprob: -0.02 },
    { text: 'que', type: 'word', start: 3.2, end: 3.3, speakerId: 'speaker_1', logprob: -0.01 },
    { text: 'sí,', type: 'word', start: 3.3, end: 3.5, speakerId: 'speaker_1', logprob: -0.01 },
    { text: 'con', type: 'word', start: 3.6, end: 3.7, speakerId: 'speaker_1', logprob: -0.01 },
    { text: 'gusto', type: 'word', start: 3.7, end: 4.0, speakerId: 'speaker_1', logprob: -0.02 },
    { text: 'le', type: 'word', start: 4.0, end: 4.1, speakerId: 'speaker_1', logprob: -0.01 },
    { text: 'ayudo.', type: 'word', start: 4.1, end: 4.5, speakerId: 'speaker_1', logprob: -0.03 },
    { text: '(risas)', type: 'audio_event', start: 4.5, end: 5.0 },
    { text: '¿Me', type: 'word', start: 5.8, end: 6.0, speakerId: 'speaker_1', logprob: -0.02 },
    { text: 'recuerda', type: 'word', start: 6.0, end: 6.4, speakerId: 'speaker_1', logprob: -0.02 },
    { text: 'su', type: 'word', start: 6.4, end: 6.5, speakerId: 'speaker_1', logprob: -0.01 },
    { text: 'nombre?', type: 'word', start: 6.5, end: 6.9, speakerId: 'speaker_1', logprob: -0.01 },
    { text: 'Juan', type: 'word', start: 7.3, end: 7.6, speakerId: 'speaker_0', logprob: -0.01 },
    { text: 'Pérez.', type: 'word', start: 7.6, end: 8.0, speakerId: 'speaker_0', logprob: -0.02 },
  ],
};

/** Scribe v2 con `use_multi_channel` (grabación dual de Twilio): un transcript por canal. */
export const scribeMultiChannel = {
  transcriptionId: 'stt_multi_001',
  audioDurationSecs: 9.4,
  transcripts: [
    {
      channelIndex: 0,
      languageCode: 'spa',
      languageProbability: 0.99,
      text: 'Buenas tardes, le habla Ana de GO Admin. Perfecto, le envío la propuesta hoy.',
      words: [
        { text: 'Buenas', type: 'word', start: 0.2, end: 0.5, logprob: -0.01 },
        { text: 'tardes,', type: 'word', start: 0.5, end: 0.9, logprob: -0.01 },
        { text: 'le', type: 'word', start: 0.9, end: 1.0, logprob: -0.01 },
        { text: 'habla', type: 'word', start: 1.0, end: 1.3, logprob: -0.02 },
        { text: 'Ana', type: 'word', start: 1.3, end: 1.6, logprob: -0.02 },
        { text: 'de', type: 'word', start: 1.6, end: 1.7, logprob: -0.01 },
        { text: 'GO', type: 'word', start: 1.7, end: 1.9, logprob: -0.05 },
        { text: 'Admin.', type: 'word', start: 1.9, end: 2.4, logprob: -0.04 },
        { text: 'Perfecto,', type: 'word', start: 6.0, end: 6.5, logprob: -0.01 },
        { text: 'le', type: 'word', start: 6.5, end: 6.6, logprob: -0.01 },
        { text: 'envío', type: 'word', start: 6.6, end: 6.9, logprob: -0.02 },
        { text: 'la', type: 'word', start: 6.9, end: 7.0, logprob: -0.01 },
        { text: 'propuesta', type: 'word', start: 7.0, end: 7.5, logprob: -0.02 },
        { text: 'hoy.', type: 'word', start: 7.5, end: 7.9, logprob: -0.01 },
      ],
    },
    {
      channelIndex: 1,
      languageCode: 'spa',
      languageProbability: 0.97,
      text: 'Sí, dígame. Me interesa pero el precio es muy alto.',
      words: [
        { text: 'Sí,', type: 'word', start: 2.8, end: 3.0, logprob: -0.02 },
        { text: 'dígame.', type: 'word', start: 3.0, end: 3.4, logprob: -0.03 },
        { text: 'Me', type: 'word', start: 3.9, end: 4.0, logprob: -0.01 },
        { text: 'interesa', type: 'word', start: 4.0, end: 4.4, logprob: -0.02 },
        { text: 'pero', type: 'word', start: 4.4, end: 4.6, logprob: -0.01 },
        { text: 'el', type: 'word', start: 4.6, end: 4.7, logprob: -0.01 },
        { text: 'precio', type: 'word', start: 4.7, end: 5.0, logprob: -0.02 },
        { text: 'es', type: 'word', start: 5.0, end: 5.1, logprob: -0.01 },
        { text: 'muy', type: 'word', start: 5.1, end: 5.3, logprob: -0.01 },
        { text: 'alto.', type: 'word', start: 5.3, end: 5.7, logprob: -0.02 },
      ],
    },
  ],
};

/** Payload `data.transcription` del webhook `speech_to_text_transcription` (snake_case). */
export const scribeWebhookTranscription = {
  language_code: 'spa',
  language_probability: 0.96,
  text: 'Hola Juan, te llamo por el seguimiento. Sí, cuéntame.',
  transcription_id: 'stt_webhook_001',
  audio_duration_secs: 4.2,
  words: [
    { text: 'Hola', type: 'word', start: 0.12, end: 0.41, speaker_id: 'speaker_0', logprob: -0.01 },
    { text: ' ', type: 'spacing', start: 0.41, end: 0.43 },
    { text: 'Juan,', type: 'word', start: 0.43, end: 0.8, speaker_id: 'speaker_0', logprob: -0.02 },
    { text: 'te', type: 'word', start: 0.9, end: 1.0, speaker_id: 'speaker_0', logprob: -0.01 },
    { text: 'llamo', type: 'word', start: 1.0, end: 1.3, speaker_id: 'speaker_0', logprob: -0.01 },
    { text: 'por', type: 'word', start: 1.3, end: 1.4, speaker_id: 'speaker_0', logprob: -0.01 },
    { text: 'el', type: 'word', start: 1.4, end: 1.5, speaker_id: 'speaker_0', logprob: -0.01 },
    { text: 'seguimiento.', type: 'word', start: 1.5, end: 2.2, speaker_id: 'speaker_0', logprob: -0.03 },
    { text: 'Sí,', type: 'word', start: 3.0, end: 3.2, speaker_id: 'speaker_1', logprob: -0.01 },
    { text: 'cuéntame.', type: 'word', start: 3.2, end: 3.8, speaker_id: 'speaker_1', logprob: -0.02 },
  ],
};

/** Salida JSON de Gemini (responseSchema de geminiAudio.ts). */
export const geminiSegmentsJson = {
  language: 'es',
  segments: [
    { speaker: 'speaker_0', start: '00:00.200', end: '00:02.400', text: 'Buenas tardes, le habla Ana.' },
    { speaker: 'speaker_1', start: '00:02.800', end: '00:05.700', text: 'Sí, dígame. El precio es muy alto.' },
    { speaker: 'speaker_0', start: '00:06.000', end: '00:07.900', text: 'Perfecto, le envío la propuesta hoy.' },
    { speaker: 'speaker_1', start: '00:08.000', end: '00:08.000', text: '   ' },
  ],
};
