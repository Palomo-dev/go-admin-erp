'use client';

/**
 * useCallIntelligence — estado de transcripción + análisis de una llamada.
 * GET /api/crm/calls/[id]/transcript y /analysis; polling cada 5 s mientras
 * haya trabajo en curso (transcript pending|processing o job queued|running).
 * Sin react-query (regla del repo).
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export interface TranscriptSegmentDto {
  id: string;
  speaker_label: string;
  speaker_role: 'agent' | 'customer' | 'unknown' | null;
  start_ms: number;
  end_ms: number;
  text: string;
  confidence: number | null;
}

export interface TranscriptDto {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  provider: string;
  provider_model: string | null;
  language: string;
  full_text: string | null;
  speaker_count: number | null;
  duration_seconds: number | null;
  cost_amount: number | null;
  error_code: string | null;
  error_message: string | null;
  started_at?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
  completed_at: string | null;
  raw_response: { channel_role_map?: { method?: string }; fell_back?: boolean; attempts?: Array<{ provider: string; ok: boolean }> } | null;
  segments?: TranscriptSegmentDto[];
  jobs?: JobDto[];
  recording?: { id: string; status: string; channels: string | null; duration_seconds: number | null } | null;
}

export interface JobDto {
  id: string;
  kind: string;
  status: string;
  attempts: number;
  last_error: string | null;
}

export interface AnalysisDto {
  id: string;
  provider: string;
  model: string | null;
  summary: string | null;
  sentiment: string | null;
  sentiment_score: number | null;
  quality_score: number | null;
  quality_breakdown: Record<string, number> | null;
  talk_ratio_agent: number | null;
  talk_ratio_customer: number | null;
  longest_monologue_seconds: number | null;
  questions_asked: number | null;
  next_steps: Array<{ action: string; owner?: string; due_date?: string | null }> | null;
  detected_objections: Array<{ objection_id: string | null; label: string; quote: string; confidence: number }> | null;
  detected_competitors: string[] | null;
  budget_mentioned: number | null;
  decision_maker_identified: boolean | null;
  discovery_fields: Record<string, string | null> | null;
  suggested_stage_id: string | null;
  suggested_stage_confidence: number | null;
  suggested_tasks: Array<{ title: string; type?: string; priority?: string; due_date?: string | null }> | null;
  applied: boolean;
  created_at: string;
  raw_response: { temperature?: string | null; applied_actions?: string[]; policy?: string; cost_usd?: number | null; rejected_stage_id?: string | null; stage_confidence_threshold?: number } | null;
}

export interface AnalysisBundle {
  analysis: AnalysisDto | null;
  tags: Array<{ id: string; tag_id?: string; tag?: { name: string; color: string } | null }>;
  objections: Array<{ id: string; title: string; category: string; recommended_response: string | null }>;
  suggested_stage: { id: string; name: string } | null;
  applied_actions: string[];
  policy: 'auto' | 'suggest';
  job?: JobDto | null;
}

export interface CallIntelligenceState {
  transcript: TranscriptDto | null;
  analysis: AnalysisBundle | null;
  loading: boolean;
  error: string | null;
  transcriptError?: string | null;
  analysisError?: string | null;
  busy: boolean;
  refetch: () => Promise<void>;
  setBusy: (b: boolean) => void;
}

const POLL_MS = 5000;

function missingTranscript(data: { jobs?: JobDto[]; recording?: TranscriptDto['recording'] } | null): TranscriptDto | null {
  const jobs = data?.jobs ?? [];
  const active = jobs.find((job) => job.kind === 'transcribe' && ['queued', 'running'].includes(job.status));
  const latest = jobs.find((job) => job.kind === 'transcribe');
  if (!active && latest?.status !== 'failed') return null;
  return { id: '', status: active ? 'pending' : 'failed', provider: 'pending', provider_model: null, language: '', full_text: null, speaker_count: null, duration_seconds: null, cost_amount: null, error_code: active ? null : latest?.last_error?.split(':')[0] ?? null, error_message: active ? null : latest?.last_error ?? null, completed_at: null, raw_response: null, segments: [], jobs, recording: data?.recording ?? null };
}

function isWorking(t: TranscriptDto | null, a: AnalysisBundle | null): boolean {
  if (t && (t.status === 'pending' || t.status === 'processing')) return true;
  if (t?.jobs?.some((j) => j.kind === 'transcribe' && (j.status === 'queued' || j.status === 'running'))) return true;
  if (a?.job && (a.job.status === 'queued' || a.job.status === 'running')) return true;
  return false;
}

export function useCallIntelligence(callId: string, enabled = true): CallIntelligenceState {
  const [transcript, setTranscript] = useState<TranscriptDto | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisBundle | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcriptError, setTranscriptError] = useState<string | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const loadedCall = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);
  const generation = useRef(0);
  const inFlight = useRef<AbortController | null>(null);
  const cancelRead = useCallback(() => { generation.current++; inFlight.current?.abort(); }, []);

  const refetch = useCallback(async () => {
    if (!enabled) return;
    const version = ++generation.current;
    inFlight.current?.abort();
    const abort = new AbortController();
    inFlight.current = abort;
    setLoading(true);
    try {
      const [tRes, aRes] = await Promise.all([
        fetch(`/api/crm/calls/${callId}/transcript`, { signal: abort.signal }),
        fetch(`/api/crm/calls/${callId}/analysis`, { signal: abort.signal }),
      ]);
      const [tJson, aJson] = await Promise.all([tRes.json().catch(() => ({})), aRes.json().catch(() => ({}))]);
      if (!alive.current || abort.signal.aborted || version !== generation.current) return;
      loadedCall.current = callId;
      const hasTranscriptError = !tRes.ok && tRes.status !== 404;
      const hasAnalysisError = !aRes.ok && aRes.status !== 404;
      if (tRes.ok) setTranscript(tJson.data as TranscriptDto);
      else if (tRes.status === 404) setTranscript(missingTranscript(tJson.data));
      else setTranscript(null);
      if (aRes.ok) setAnalysis(aJson.data as AnalysisBundle);
      else if (aRes.status === 404) setAnalysis({ analysis: null, tags: [], objections: [], suggested_stage: null, applied_actions: [], policy: 'suggest', job: aJson.data?.job ?? null });
      else setAnalysis(null);
      const transcriptFailure = hasTranscriptError ? tJson.error ?? 'Error cargando transcripción' : null;
      const analysisFailure = hasAnalysisError ? aJson.error ?? 'Error cargando análisis' : null;
      setTranscriptError(transcriptFailure);
      setAnalysisError(analysisFailure);
      setError(transcriptFailure ?? analysisFailure);
    } catch (failure) {
      if (alive.current && !abort.signal.aborted && version === generation.current) {
        setTranscript(null);
        setAnalysis(null);
        loadedCall.current = callId;
        const message = failure instanceof Error ? failure.message : 'Error de red';
        setError(message);
        setTranscriptError(message);
        setAnalysisError(message);
      }
    } finally {
      if (alive.current && !abort.signal.aborted && version === generation.current) setLoading(false);
    }
  }, [callId, enabled]);

  useEffect(() => {
    alive.current = true;
    loadedCall.current = null;
    setTranscriptError(null);
    setAnalysisError(null);
    setTranscript(null);
    setAnalysis(null);
    setError(null);
    const changedOrganization = () => {
      cancelRead();
      loadedCall.current = null;
      setTranscriptError(null);
      setAnalysisError(null);
      setTranscript(null);
      setAnalysis(null);
      setError(null);
      setBusy(false);
      if (enabled) void refetch();
    };
    if (enabled) {
      void refetch();
      window.addEventListener('organization-changed', changedOrganization);
    }
    return () => {
      alive.current = false;
      cancelRead();
      if (timer.current) clearTimeout(timer.current);
      window.removeEventListener('organization-changed', changedOrganization);
    };
  }, [enabled, refetch, cancelRead]);

  // Polling mientras hay trabajo en curso
  useEffect(() => {
    if (!enabled) return;
    if (timer.current) clearTimeout(timer.current);
    if (isWorking(transcript, analysis) || busy) {
      timer.current = setTimeout(() => void refetch(), POLL_MS);
    }
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [transcript, analysis, busy, enabled, refetch]);

  const currentCall = loadedCall.current === callId;
  return { transcript: currentCall ? transcript : null, analysis: currentCall ? analysis : null, loading, error: currentCall ? error : null, transcriptError: currentCall ? transcriptError : null, analysisError: currentCall ? analysisError : null, busy, refetch, setBusy };
}

export const ERROR_LABELS: Record<string, string> = {
  INSUFFICIENT_CREDITS: 'Sin créditos IA',
  PROVIDER_ERROR: 'El proveedor no respondió',
  AUDIO_TOO_SHORT: 'Audio demasiado corto',
  AUDIO_EMPTY: 'La grabación está vacía',
  AUDIO_TOO_LARGE: 'El audio es demasiado grande para transcribirlo',
  NO_RECORDING: 'Sin grabación disponible',
  WEBHOOK_TIMEOUT: 'Tiempo de espera agotado',
  PERSIST_ERROR: 'No se pudo guardar el resultado',
  NO_TRANSCRIPT: 'Sin transcripción',
  CALL_NOT_FOUND: 'Llamada no encontrada',
};

export function providerLabel(p: string | null | undefined): string {
  switch (p) {
    case 'elevenlabs':
      return 'ElevenLabs Scribe';
    case 'google':
    case 'gemini':
      return 'Gemini';
    case 'openai':
      return 'OpenAI';
    default:
      return p ?? '—';
  }
}
