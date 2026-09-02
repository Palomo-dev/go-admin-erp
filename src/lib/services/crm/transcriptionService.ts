import type { SupabaseClient } from '@supabase/supabase-js';
import { getActiveProvider } from '@/lib/services/providerRegistry';

/**
 * Servicio CRM - FASE 4: Transcripción de llamadas (STT).
 * Tablas: call_transcripts, call_transcript_segments, call_recordings
 *
 * Pipeline:
 *  1. Obtiene la grabación desde call_recordings
 *  2. Descarga el audio desde Supabase Storage
 *  3. Llama al proveedor de STT (Deepgram o ElevenLabs Scribe)
 *  4. Guarda resultado en call_transcripts + call_transcript_segments
 *  5. Maneja errores y marca status failed/completed
 */

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type TranscriptStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface CallTranscript {
  id: string;
  organization_id: number;
  call_id: string;
  provider: string;
  provider_model: string | null;
  language: string;
  status: TranscriptStatus;
  full_text: string | null;
  word_count: number | null;
  confidence: number | null;
  speaker_count: number | null;
  duration_seconds: number | null;
  cost_amount: number | null;
  raw_response: Record<string, unknown> | null;
  error_code: string | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  segments?: CallTranscriptSegment[];
}

export interface CallTranscriptSegment {
  id: string;
  transcript_id: string;
  organization_id: number;
  speaker_label: string;
  speaker_role: 'agent' | 'customer' | 'unknown' | null;
  start_ms: number;
  end_ms: number;
  text: string;
  confidence: number | null;
  sentiment: string | null;
}

export interface TranscriptFilters {
  status?: TranscriptStatus;
  provider?: string;
  callId?: string;
  limit?: number;
  offset?: number;
}

// ─── Tipos internos de respuesta STT ─────────────────────────────────────────

interface STTSegment {
  speaker_label: string;
  speaker_role: 'agent' | 'customer' | 'unknown';
  start_ms: number;
  end_ms: number;
  text: string;
  confidence: number | null;
  sentiment?: string | null;
}

interface STTResult {
  fullText: string;
  wordCount: number;
  confidence: number;
  speakerCount: number;
  durationSeconds: number | null;
  costAmount: number | null;
  segments: STTSegment[];
  rawResponse: Record<string, unknown>;
  language: string;
}

// ─── Llamada al proveedor STT ────────────────────────────────────────────────

/**
 * Llama a Deepgram para transcribir un buffer de audio.
 * Usa el endpoint pretranscribed con diarización.
 */
async function transcribeWithDeepgram(
  audioBuffer: Uint8Array,
  apiKey: string,
  language = 'es'
): Promise<STTResult> {
  const params = new URLSearchParams({
    model: 'nova-2',
    language,
    punctuate: 'true',
    diarize: 'true',
    smart_format: 'true',
    utterances: 'true',
  });

  const response = await fetch(
    `https://api.deepgram.com/v1/listen?${params.toString()}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Token ${apiKey}`,
        'Content-Type': 'audio/wav',
      },
      body: audioBuffer as unknown as BodyInit,
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Deepgram API error: ${response.status} - ${errText}`);
  }

  const result = await response.json() as Record<string, unknown>;
  const metadata = (result.metadata ?? {}) as Record<string, unknown>;
  const results = (result.results ?? {}) as Record<string, unknown>;
  const channels = (results.channels ?? []) as Array<Record<string, unknown>>;
  const channel = channels[0] as Record<string, unknown> | undefined ?? {};
  const alternatives = (channel?.alternatives ?? []) as Array<Record<string, unknown>>;
  const alternative = alternatives[0];

  const fullText = (alternative?.transcript as string) ?? '';
  const confidence = (alternative?.confidence as number) ?? 0;
  const words = (alternative?.words as Array<Record<string, unknown>>) ?? [];
  const wordCount = words.length;

  // Duración desde metadata
  const durationSeconds = (metadata.duration as number) ?? null;

  // Diarización: usar utterances si están disponibles
  const utterances = (results.utterances ?? []) as Array<Record<string, unknown>>;
  const speakerLabels = new Set<string>();
  const segments: STTSegment[] = [];

  if (utterances.length > 0) {
    for (const utt of utterances) {
      const speaker = String(utt.speaker ?? 0);
      speakerLabels.add(speaker);
      const transcript = (utt.transcript as string) ?? '';
      const start = (utt.start as number) ?? 0;
      const end = (utt.end as number) ?? 0;
      const conf = (utt.confidence as number) ?? null;
      // Heurística de rol: speaker 0 = agent, otros = customer
      const role: STTSegment['speaker_role'] = speaker === '0' ? 'agent' : 'customer';
      segments.push({
        speaker_label: `Speaker ${speaker}`,
        speaker_role: role,
        start_ms: Math.round(start * 1000),
        end_ms: Math.round(end * 1000),
        text: transcript,
        confidence: conf,
      });
    }
  } else if (words.length > 0) {
    // Sin utterances: agrupar palabras por speaker
    let currentSpeaker: string | null = null;
    let currentText = '';
    let startMs = 0;
    let endMs = 0;
    let confSum = 0;
    let confCount = 0;

    for (const w of words) {
      const sp = String(w.speaker ?? 0);
      const wStart = (w.start as number) ?? 0;
      const wEnd = (w.end as number) ?? 0;
      const wConf = (w.confidence as number) ?? 0;
      const wWord = (w.punctuated_word as string) ?? (w.word as string) ?? '';

      if (currentSpeaker !== null && sp !== currentSpeaker) {
        speakerLabels.add(currentSpeaker);
        const role: STTSegment['speaker_role'] = currentSpeaker === '0' ? 'agent' : 'customer';
        segments.push({
          speaker_label: `Speaker ${currentSpeaker}`,
          speaker_role: role,
          start_ms: Math.round(startMs * 1000),
          end_ms: Math.round(endMs * 1000),
          text: currentText.trim(),
          confidence: confCount > 0 ? confSum / confCount : null,
        });
        currentText = '';
        confSum = 0;
        confCount = 0;
      }
      if (currentSpeaker !== sp) {
        startMs = wStart;
      }
      currentSpeaker = sp;
      currentText += (currentText ? ' ' : '') + wWord;
      endMs = wEnd;
      confSum += wConf;
      confCount++;
    }
    if (currentSpeaker !== null && currentText) {
      speakerLabels.add(currentSpeaker);
      const role: STTSegment['speaker_role'] = currentSpeaker === '0' ? 'agent' : 'customer';
      segments.push({
        speaker_label: `Speaker ${currentSpeaker}`,
        speaker_role: role,
        start_ms: Math.round(startMs * 1000),
        end_ms: Math.round(endMs * 1000),
        text: currentText.trim(),
        confidence: confCount > 0 ? confSum / confCount : null,
      });
    }
  }

  return {
    fullText,
    wordCount,
    confidence,
    speakerCount: speakerLabels.size || 1,
    durationSeconds: durationSeconds !== null ? Math.round(durationSeconds) : null,
    costAmount: null,
    segments,
    rawResponse: result,
    language,
  };
}

/**
 * Llama a ElevenLabs Scribe para transcribir un buffer de audio.
 */
async function transcribeWithElevenLabs(
  audioBuffer: Uint8Array,
  apiKey: string,
  language = 'es'
): Promise<STTResult> {
  const formData = new FormData();
  const blob = new Blob([audioBuffer as unknown as BlobPart], { type: 'audio/wav' });
  formData.append('file', blob, 'recording.wav');
  formData.append('model_id', 'scribe_v1');
  formData.append('language_code', language);
  formData.append('diarize', 'true');
  formData.append('tag_audio_events', 'false');

  const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
    },
    body: formData,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`ElevenLabs Scribe API error: ${response.status} - ${errText}`);
  }

  const result = await response.json() as Record<string, unknown>;
  const words = (result.words ?? []) as Array<Record<string, unknown>>;
  const languageCode = (result.language_code as string) ?? language;

  // Agrupar palabras por speaker
  const speakerLabels = new Set<string>();
  const segments: STTSegment[] = [];
  let currentSpeaker: string | null = null;
  let currentText = '';
  let startMs = 0;
  let endMs = 0;

  for (const w of words) {
    const sp = String(w.speaker_id ?? '0');
    const wStart = (w.start as number) ?? 0;
    const wEnd = (w.end as number) ?? 0;
    const wText = (w.text as string) ?? '';

    if (currentSpeaker !== null && sp !== currentSpeaker) {
      speakerLabels.add(currentSpeaker);
      const role: STTSegment['speaker_role'] = currentSpeaker === '0' ? 'agent' : 'customer';
      segments.push({
        speaker_label: `Speaker ${currentSpeaker}`,
        speaker_role: role,
        start_ms: Math.round(startMs),
        end_ms: Math.round(endMs),
        text: currentText.trim(),
        confidence: null,
      });
      currentText = '';
    }
    if (currentSpeaker !== sp) {
      startMs = wStart;
    }
    currentSpeaker = sp;
    currentText += (currentText ? ' ' : '') + wText;
    endMs = wEnd;
  }
  if (currentSpeaker !== null && currentText) {
    speakerLabels.add(currentSpeaker);
    const role: STTSegment['speaker_role'] = currentSpeaker === '0' ? 'agent' : 'customer';
    segments.push({
      speaker_label: `Speaker ${currentSpeaker}`,
      speaker_role: role,
      start_ms: Math.round(startMs),
      end_ms: Math.round(endMs),
      text: currentText.trim(),
      confidence: null,
    });
  }

  const fullText = segments.map((s) => s.text).join(' ');
  const wordCount = words.length;
  const durationSeconds = segments.length > 0
    ? Math.round(segments[segments.length - 1].end_ms / 1000)
    : null;

  return {
    fullText,
    wordCount,
    confidence: 0,
    speakerCount: speakerLabels.size || 1,
    durationSeconds,
    costAmount: null,
    segments,
    rawResponse: result,
    language: languageCode,
  };
}

// ─── Funciones del servicio ──────────────────────────────────────────────────

/**
 * Inicia la transcripción de una llamada.
 * 1. Obtiene la grabación desde call_recordings
 * 2. Descarga el audio desde Supabase Storage
 * 3. Llama al proveedor STT (Deepgram o ElevenLabs Scribe)
 * 4. Guarda resultado en call_transcripts + call_transcript_segments
 */
export async function transcribeCall(
  callId: string,
  orgId: number,
  supabase: SupabaseClient
): Promise<CallTranscript | null> {
  // 1. Verificar si ya existe una transcripción en proceso o completada
  const { data: existing } = await supabase
    .from('call_transcripts')
    .select('*')
    .eq('call_id', callId)
    .eq('organization_id', orgId)
    .in('status', ['processing', 'completed'])
    .maybeSingle();

  if (existing) {
    return existing as CallTranscript;
  }

  // 2. Obtener la grabación
  const { data: recording, error: recError } = await supabase
    .from('call_recordings')
    .select('*')
    .eq('call_id', callId)
    .eq('organization_id', orgId)
    .eq('status', 'available')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (recError || !recording) {
    // Crear registro failed si no hay grabación
    const { data: failed } = await supabase
      .from('call_transcripts')
      .insert({
        organization_id: orgId,
        call_id: callId,
        provider: 'none',
        language: 'es',
        status: 'failed',
        error_code: 'NO_RECORDING',
        error_message: 'No se encontró grabación disponible para esta llamada',
      })
      .select()
      .single();
    return failed as CallTranscript | null;
  }

  const recordingData = recording as Record<string, unknown>;
  const storagePath = recordingData.storage_path as string;

  // 3. Crear registro transcript en status processing
  const { data: transcript, error: transError } = await supabase
    .from('call_transcripts')
    .insert({
      organization_id: orgId,
      call_id: callId,
      provider: 'pending',
      language: 'es',
      status: 'processing',
      started_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (transError || !transcript) {
    console.error('[transcriptionService] Error creando transcript:', transError?.message);
    return null;
  }

  const transcriptId = (transcript as CallTranscript).id;

  try {
    // 4. Descargar audio desde Supabase Storage
    // storage_path formato esperado: "bucket/path/to/file" o solo "path/to/file"
    const pathParts = storagePath.split('/');
    const bucket = pathParts[0] || 'call-recordings';
    const filePath = pathParts.slice(1).join('/') || storagePath;

    const { data: audioData, error: downloadError } = await supabase
      .storage
      .from(bucket)
      .download(filePath);

    if (downloadError || !audioData) {
      throw new Error(`Error descargando audio: ${downloadError?.message ?? 'unknown'}`);
    }

    const audioBuffer = new Uint8Array(await audioData.arrayBuffer());

    // 5. Obtener proveedor STT activo
    const providerConfig = await getActiveProvider(orgId, 'stt', supabase);
    const providerName = providerConfig.provider;
    const apiKey = providerConfig.credentials.DEEPGRAM_API_KEY
      || providerConfig.credentials.ELEVENLABS_API_KEY
      || '';

    if (!apiKey || providerName === 'none') {
      throw new Error('No hay proveedor STT configurado (Deepgram o ElevenLabs)');
    }

    // 6. Llamar al proveedor
    let sttResult: STTResult;
    if (providerName === 'elevenlabs') {
      sttResult = await transcribeWithElevenLabs(audioBuffer, apiKey);
    } else {
      sttResult = await transcribeWithDeepgram(audioBuffer, apiKey);
    }

    // 7. Guardar segmentos
    if (sttResult.segments.length > 0) {
      const segmentRows = sttResult.segments.map((s) => ({
        transcript_id: transcriptId,
        organization_id: orgId,
        speaker_label: s.speaker_label,
        speaker_role: s.speaker_role,
        start_ms: s.start_ms,
        end_ms: s.end_ms,
        text: s.text,
        confidence: s.confidence,
        sentiment: s.sentiment ?? null,
      }));

      const { error: segError } = await supabase
        .from('call_transcript_segments')
        .insert(segmentRows);

      if (segError) {
        console.warn('[transcriptionService] Error guardando segmentos:', segError.message);
      }
    }

    // 8. Actualizar transcript a completed
    const { data: updated, error: updateError } = await supabase
      .from('call_transcripts')
      .update({
        provider: providerName,
        provider_model: providerName === 'deepgram' ? 'nova-2' : 'scribe_v1',
        language: sttResult.language,
        status: 'completed',
        full_text: sttResult.fullText,
        word_count: sttResult.wordCount,
        confidence: sttResult.confidence,
        speaker_count: sttResult.speakerCount,
        duration_seconds: sttResult.durationSeconds,
        cost_amount: sttResult.costAmount,
        raw_response: sttResult.rawResponse,
        completed_at: new Date().toISOString(),
        error_code: null,
        error_message: null,
      })
      .eq('id', transcriptId)
      .eq('organization_id', orgId)
      .select()
      .single();

    if (updateError) {
      console.error('[transcriptionService] Error actualizando transcript:', updateError.message);
    }

    return updated as CallTranscript | null;
  } catch (error) {
    // Marcar como failed
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
    const errorCode = errorMessage.includes('NO_RECORDING') ? 'NO_RECORDING'
      : errorMessage.includes('STT') ? 'STT_ERROR'
      : 'TRANSCRIPTION_ERROR';

    await supabase
      .from('call_transcripts')
      .update({
        status: 'failed',
        error_code: errorCode,
        error_message: errorMessage,
        completed_at: new Date().toISOString(),
      })
      .eq('id', transcriptId)
      .eq('organization_id', orgId);

    console.error('[transcriptionService] Error transcribiendo:', errorMessage);
    return null;
  }
}

/**
 * Obtiene la transcripción de una llamada con sus segmentos.
 */
export async function getTranscript(
  callId: string,
  orgId: number,
  supabase: SupabaseClient
): Promise<CallTranscript | null> {
  const { data: transcript, error } = await supabase
    .from('call_transcripts')
    .select('*')
    .eq('call_id', callId)
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !transcript) return null;

  const transcriptData = transcript as CallTranscript;

  // Obtener segmentos
  const { data: segments, error: segError } = await supabase
    .from('call_transcript_segments')
    .select('*')
    .eq('transcript_id', transcriptData.id)
    .eq('organization_id', orgId)
    .order('start_ms', { ascending: true });

  if (segError) {
    console.warn('[transcriptionService] Error obteniendo segmentos:', segError.message);
  }

  return {
    ...transcriptData,
    segments: (segments as CallTranscriptSegment[]) || [],
  };
}

/**
 * Lista transcripciones de una organización con filtros opcionales.
 */
export async function getTranscripts(
  orgId: number,
  supabase: SupabaseClient,
  filters?: TranscriptFilters
): Promise<CallTranscript[]> {
  let query = supabase
    .from('call_transcripts')
    .select('*')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });

  if (filters?.status) {
    query = query.eq('status', filters.status);
  }
  if (filters?.provider && filters.provider !== 'pending') {
    query = query.eq('provider', filters.provider);
  }
  if (filters?.callId) {
    query = query.eq('call_id', filters.callId);
  }
  if (filters?.limit) {
    query = query.limit(filters.limit);
  }
  if (filters?.offset) {
    query = query.range(filters.offset, (filters.offset + (filters.limit ?? 50)) - 1);
  } else if (!filters?.limit) {
    query = query.limit(50);
  }

  const { data, error } = await query;

  if (error) {
    console.warn('[transcriptionService] getTranscripts error:', error.message);
    return [];
  }

  return (data as CallTranscript[]) || [];
}

/**
 * Actualiza el estado de una transcripción.
 */
export async function updateTranscriptStatus(
  id: string,
  orgId: number,
  status: TranscriptStatus,
  supabase: SupabaseClient
): Promise<CallTranscript | null> {
  const updateData: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (status === 'completed') {
    updateData.completed_at = new Date().toISOString();
  }
  if (status === 'processing') {
    updateData.started_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from('call_transcripts')
    .update(updateData)
    .eq('id', id)
    .eq('organization_id', orgId)
    .select()
    .single();

  if (error) throw error;

  return data as CallTranscript;
}
