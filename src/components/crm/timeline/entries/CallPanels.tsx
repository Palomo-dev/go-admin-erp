'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { formatDuration } from '../utils';

/**
 * Paneles mínimos de transcripción y análisis (fallback de CallEntry cuando el
 * módulo F4 `@/components/crm/calls` no está disponible) + `SentimentBadge`.
 * Consumen GET /api/crm/calls/[id]/transcript y GET|POST /api/crm/calls/[id]/analyze.
 */

interface Segment { speaker_label?: string; speaker_role?: string | null; text: string; start_ms?: number; sentiment?: string | null }

export function TranscriptPanel({ callId }: { callId: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fullText, setFullText] = useState<string | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/crm/calls/${callId}/transcript`, { cache: 'no-store' })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (cancelled) return;
        if (r.status === 404) { setStatus('none'); return; }
        if (!r.ok || !j.success) throw new Error(j.error || `Error ${r.status}`);
        const d = j.data ?? {};
        setStatus(d.status ?? 'completed');
        setFullText(d.full_text ?? null);
        setSegments(Array.isArray(d.segments) ? d.segments : []);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : 'Error'))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [callId]);

  if (loading) return <p className="text-xs text-gray-500 flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Cargando transcripción…</p>;
  if (error) return <p className="text-xs text-red-600 dark:text-red-400">{error}</p>;
  if (status === 'none') return <p className="text-xs text-gray-500 dark:text-gray-400">Sin transcripción todavía. Se genera automáticamente al terminar la llamada (F4).</p>;
  if (status && status !== 'completed') return <p className="text-xs text-gray-500 dark:text-gray-400">Transcripción {status}…</p>;
  if (segments.length === 0 && !fullText) return <p className="text-xs text-gray-500">Transcripción vacía.</p>;

  return (
    <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1">
      {segments.length > 0 ? segments.map((s, i) => {
        const role = (s.speaker_role ?? '').toLowerCase();
        const isAgent = role === 'agent' || role === 'user' || s.speaker_label === 'speaker_0';
        return (
          <div key={i} className="text-xs flex gap-2">
            <span className="shrink-0 w-14 text-[10px] text-gray-400 tabular-nums">{s.start_ms != null ? formatDuration(Math.floor(s.start_ms / 1000)) : ''}</span>
            <span className={isAgent ? 'text-blue-700 dark:text-blue-300' : 'text-gray-800 dark:text-gray-200'}>
              <span className="font-semibold mr-1">{isAgent ? 'Agente' : 'Cliente'}:</span>{s.text}
            </span>
          </div>
        );
      }) : <p className="text-xs whitespace-pre-wrap text-gray-700 dark:text-gray-300">{fullText}</p>}
    </div>
  );
}

interface Analysis {
  summary?: string | null; sentiment?: string | null; quality_score?: number | null;
  next_steps?: unknown; detected_objections?: unknown; suggested_stage_id?: string | null; applied?: boolean;
}

const SENTIMENT_BADGE: Record<string, string> = {
  positive: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  neutral: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200',
  negative: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  mixed: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
};

export function SentimentBadge({ sentiment, score }: { sentiment?: string | null; score?: number | null }) {
  if (!sentiment && score == null) return null;
  const label = sentiment === 'positive' ? 'positivo' : sentiment === 'negative' ? 'negativo' : sentiment === 'mixed' ? 'mixto' : sentiment === 'neutral' ? 'neutral' : null;
  return (
    <span className="inline-flex items-center gap-1">
      {label && <Badge className={`text-[11px] ${SENTIMENT_BADGE[sentiment ?? 'neutral']}`}>{label}</Badge>}
      {score != null && <Badge variant="outline" className="text-[11px]">{score}/100</Badge>}
    </span>
  );
}

function asList(v: unknown): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.map((x) => (typeof x === 'string' ? x : (x as { text?: string; title?: string; description?: string })?.text ?? (x as { title?: string })?.title ?? (x as { description?: string })?.description ?? JSON.stringify(x)));
  return [String(v)];
}

export function AnalysisPanel({ callId, initial, hasTranscript = true }: { callId: string; initial?: Analysis | null; hasTranscript?: boolean }) {
  const [analysis, setAnalysis] = useState<Analysis | null>(initial ?? null);
  const [loading, setLoading] = useState(!initial);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (initial) return;
    let cancelled = false;
    fetch(`/api/crm/calls/${callId}/analyze`, { cache: 'no-store' })
      .then(async (r) => { const j = await r.json().catch(() => ({})); if (!cancelled && r.ok && j.success) setAnalysis(j.data); })
      .catch(() => undefined)
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [callId, initial]);

  const run = async () => {
    setRunning(true);
    try {
      const r = await fetch(`/api/crm/calls/${callId}/analyze`, { method: 'POST' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.success) throw new Error(j.error || `Error ${r.status}`);
      // 202 = encolado, todavía no hay análisis: la respuesta trae `{job_id}`,
      // no el análisis. Prometer "Análisis generado" aquí (y meter el job en
      // `setAnalysis`) era anunciar algo que aún no ha ocurrido (encargo de F4).
      if (r.status === 202) {
        toast({ title: 'Análisis en cola', description: 'Se procesará en el próximo minuto.' });
      } else {
        setAnalysis(j.data);
        toast({ title: 'Análisis generado' });
      }
    } catch (e) {
      toast({ title: 'No se pudo analizar', description: e instanceof Error ? e.message : 'Error', variant: 'destructive' });
    } finally {
      setRunning(false);
    }
  };

  if (loading) return <p className="text-xs text-gray-500 flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Cargando análisis…</p>;
  if (!analysis) {
    return (
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-gray-500 dark:text-gray-400">{hasTranscript ? 'Sin análisis IA todavía.' : 'Requiere transcripción completada.'}</p>
        <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={run} disabled={running || !hasTranscript}>
          {running && <Loader2 className="h-3 w-3 animate-spin mr-1" />}Analizar
        </Button>
      </div>
    );
  }
  const steps = asList(analysis.next_steps);
  const objections = asList(analysis.detected_objections);
  return (
    <div className="space-y-2 text-xs">
      <div className="flex items-center gap-2"><SentimentBadge sentiment={analysis.sentiment} score={analysis.quality_score} />{analysis.applied && <Badge variant="success" className="text-[11px]">aplicado</Badge>}</div>
      {analysis.summary && <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{analysis.summary}</p>}
      {steps.length > 0 && (
        <div><p className="font-semibold text-gray-600 dark:text-gray-400 mb-0.5">Próximos pasos</p><ul className="list-disc list-inside space-y-0.5">{steps.map((s, i) => <li key={i}>{s}</li>)}</ul></div>
      )}
      {objections.length > 0 && (
        <div><p className="font-semibold text-gray-600 dark:text-gray-400 mb-0.5">Objeciones</p><ul className="list-disc list-inside space-y-0.5">{objections.map((s, i) => <li key={i}>{s}</li>)}</ul></div>
      )}
    </div>
  );
}
