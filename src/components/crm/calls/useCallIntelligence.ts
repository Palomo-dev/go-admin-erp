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
  busy: boolean;
  refetch: () => Promise<void>;
  setBusy: (b: boolean) => void;
}

const POLL_MS = 5000;

function isWorking(t: TranscriptDto | null, a: AnalysisBundle | null): boolean {
  if (t && (t.status === 'pending' || t.status === 'processing')) return true;
  if (t?.jobs?.some((j) => j.status === 'queued' || j.status === 'running')) return true;
  if (a?.job && (a.job.status === 'queued' || a.job.status === 'running')) return true;
  return false;
}

export function useCallIntelligence(callId: string, enabled = true): CallIntelligenceState {
  const [transcript, setTranscript] = useState<TranscriptDto | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisBundle | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);

  const refetch = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const [tRes, aRes] = await Promise.all([fetch(`/api/crm/calls/${callId}/transcript`), fetch(`/api/crm/calls/${callId}/analysis`)]);
      const tJson = await tRes.json().catch(() => ({}));
      const aJson = await aRes.json().catch(() => ({}));
      if (!alive.current) return;
      if (tRes.ok) setTranscript(tJson.data as TranscriptDto);
      else if (tRes.status === 404) setTranscript(tJson.data?.jobs?.length || tJson.data?.recording ? ({ id: '', status: 'pending', provider: 'pending', provider_model: null, language: 'spa', full_text: null, speaker_count: null, duration_seconds: null, cost_amount: null, error_code: null, error_message: null, completed_at: null, raw_response: null, segments: [], jobs: tJson.data?.jobs ?? [], recording: tJson.data?.recording ?? null, __missing: true } as TranscriptDto & { __missing: boolean }) : null);
      else setError(tJson.error ?? 'Error cargando transcripción');
      if (aRes.ok) setAnalysis(aJson.data as AnalysisBundle);
      else if (aRes.status === 404) setAnalysis({ analysis: null, tags: [], objections: [], suggested_stage: null, applied_actions: [], policy: 'suggest', job: aJson.data?.job ?? null });
      else setError(aJson.error ?? 'Error cargando análisis');
      if (tRes.ok || tRes.status === 404) setError(null);
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : 'Error de red');
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [callId, enabled]);

  useEffect(() => {
    alive.current = true;
    if (enabled) void refetch();
    return () => {
      alive.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [enabled, refetch]);

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

  return { transcript, analysis, loading, error, busy, refetch, setBusy };
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
