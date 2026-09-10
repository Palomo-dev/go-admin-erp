'use client';

/**
 * CallTranscriptPanel — transcripción de una llamada (FASE-04 §5.2).
 * Segmentos con rol/hablante/tiempo (clic → onSeek), búsqueda con resaltado,
 * copiar, estados pendiente/procesando (polling 5 s) / error con "Reintentar".
 * Reutilizable en /app/crm/llamadas y en el timeline (F9).
 */

import { useMemo, useState } from 'react';
import { Copy, Loader2, RefreshCw, Search, AlertTriangle, FileText, Mic } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/use-toast';
import { cn } from '@/utils/Utils';
import { useCallIntelligence, ERROR_LABELS, providerLabel, type TranscriptSegmentDto, type CallIntelligenceState } from './useCallIntelligence';

export interface CallTranscriptPanelProps {
  callId: string;
  /** Salto al instante (ms) al hacer clic en un segmento. */
  onSeek?: (ms: number) => void;
  /** Posición actual del reproductor (resalta el segmento activo). */
  currentMs?: number | null;
  /** Estado compartido (si el contenedor ya llamó al hook). */
  state?: CallIntelligenceState;
  className?: string;
  pageSize?: number;
}

function fmtMs(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function roleLabel(role: TranscriptSegmentDto['speaker_role'], label: string): string {
  if (role === 'agent') return 'AGENTE';
  if (role === 'customer') return 'CLIENTE';
  return label.replace('speaker_', 'Hablante ').replace('ch', 'Canal ');
}

function highlight(text: string, q: string) {
  if (!q) return text;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded bg-yellow-200 px-0.5 dark:bg-yellow-600/60 dark:text-white">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}

export function CallTranscriptPanel({ callId, onSeek, currentMs, state, className, pageSize = 100 }: CallTranscriptPanelProps) {
  const own = useCallIntelligence(callId, !state);
  const s = state ?? own;
  const { transcript, refetch } = s;
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(pageSize);
  const [retrying, setRetrying] = useState(false);

  const segments = useMemo(() => transcript?.segments ?? [], [transcript]);
  const filtered = useMemo(() => (query ? segments.filter((x) => x.text.toLowerCase().includes(query.toLowerCase())) : segments), [segments, query]);
  const activeId = useMemo(() => {
    if (currentMs === null || currentMs === undefined) return null;
    const seg = segments.find((x) => currentMs >= x.start_ms && currentMs < x.end_ms) ?? null;
    return seg?.id ?? null;
  }, [segments, currentMs]);

  const retry = async (force = true) => {
    setRetrying(true);
    s.setBusy(true);
    try {
      const res = await fetch(`/api/crm/calls/${callId}/transcribe`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ force }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? 'No se pudo encolar la transcripción');
      // Ronda 6 (tester r5 N1): el botón «Reintentar» se ofrece TAMBIÉN con el job
      // vivo (a los 10 min). La ruta ya no encola un segundo job en ese caso;
      // aquí se dice la verdad en vez de prometer una transcripción nueva.
      const deduped = json.data?.deduped === true;
      // Ronda 7 (tester r6 F1): la ruta publica también `dedupe_checked:false`
      // cuando NO pudo comprobar si ya había otro trabajo vivo. Prometer «se
      // procesará en el próximo minuto» en ese caso es la misma promesa de más
      // que esta fase fue a quitar del caso `deduped`.
      const unchecked = json.data?.dedupe_checked === false;
      const queued = res.status === 202;
      toast({
        title: deduped ? 'Ya había una transcripción en curso' : queued ? 'Transcripción en cola' : 'Transcripción lista',
        description: deduped
          ? 'Se reutiliza el trabajo que ya estaba encolado; no se cobra dos veces.'
          : unchecked
            ? 'No se pudo comprobar si ya había otra transcripción en curso, así que podría duplicarse.'
            : queued
              ? 'Se procesará en el próximo minuto.'
              : undefined,
      });
      await refetch();
    } catch (e) {
      toast({ title: 'Error', description: e instanceof Error ? e.message : 'Error', variant: 'destructive' });
    } finally {
      setRetrying(false);
      s.setBusy(false);
    }
  };

  const copyAll = async () => {
    const text = segments.map((x) => `[${fmtMs(x.start_ms)}] ${roleLabel(x.speaker_role, x.speaker_label)}: ${x.text}`).join('\n') || transcript?.full_text || '';
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: 'Transcripción copiada' });
    } catch {
      toast({ title: 'No se pudo copiar', description: 'Selecciona el texto manualmente.', variant: 'destructive' });
    }
  };

  const working = transcript && (transcript.status === 'pending' || transcript.status === 'processing' || transcript.jobs?.some((j) => j.kind === 'transcribe' && (j.status === 'queued' || j.status === 'running')));
  const method = transcript?.raw_response?.channel_role_map?.method;

  /**
   * Una transcripción puede quedarse en `processing` para siempre (webhook de
   * Scribe que nunca llega, worker muerto, `?sync=1` cortado por timeout). Pasados
   * STUCK_MS se ofrece reintentar en vez de dejar el spinner eterno (tester r1 nº 7).
   *
   * Ronda 3 (tester r2 nº 6): eran 3 min, la mitad de la ventana en la que el
   * servicio considera vivo un envío (`STALE_PROCESSING_MS` = 10 min en
   * `transcriptionService.ts`). El botón aparecía mientras el primer envío seguía
   * en curso y, con `force`, disparaba un segundo cobro. Ahora es EL MISMO
   * umbral, así que el botón sólo sale cuando el servicio ya daría el intento por
   * perdido. (Constante duplicada a propósito: `transcriptionService` es
   * server-only y no puede importarse desde un componente cliente.)
   */
  const STUCK_MS = 10 * 60 * 1000;
  const startedMs = transcript ? Date.parse(transcript.started_at ?? transcript.updated_at ?? transcript.created_at ?? '') : NaN;
  const stuck = !!working && Number.isFinite(startedMs) && Date.now() - startedMs > STUCK_MS;

  return (
    <section className={cn('flex flex-col rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800', className)} aria-label="Transcripción de la llamada">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-3 py-2 dark:border-gray-700">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
          <FileText size={16} className="text-blue-600 dark:text-blue-400" /> Transcripción
          {transcript?.status === 'completed' && (
            <Badge variant="secondary" className="text-[10px] font-normal">
              {providerLabel(transcript.provider)}
              {transcript.raw_response?.fell_back ? ' (fallback)' : ''}
            </Badge>
          )}
          {transcript?.status === 'completed' && method && (
            <Badge variant={method === 'channel' ? 'success' : 'warning'} className="text-[10px] font-normal" title={method === 'channel' ? 'Roles asignados por canal de la grabación' : 'Roles estimados por heurística'}>
              {method === 'channel' ? 'Roles por canal' : method === 'single' ? '1 hablante' : 'Roles estimados'}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          {transcript?.status === 'completed' && (
            <>
              <Button size="sm" variant="ghost" onClick={copyAll} aria-label="Copiar transcripción" title="Copiar">
                <Copy size={14} />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => retry(true)} disabled={retrying} aria-label="Volver a transcribir" title="Volver a transcribir">
                <RefreshCw size={14} className={retrying ? 'animate-spin' : ''} />
              </Button>
            </>
          )}
        </div>
      </header>

      <div className="p-3" aria-live="polite">
        {s.loading && !transcript && (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-4 animate-pulse rounded bg-gray-200 dark:bg-gray-700" style={{ width: `${70 + (i % 3) * 10}%` }} />
            ))}
          </div>
        )}

        {!s.loading && !transcript && (
          <div className="flex flex-col items-start gap-2 text-sm text-gray-600 dark:text-gray-300">
            <p className="flex items-center gap-2"><Mic size={16} className="opacity-60" /> Esta llamada aún no tiene transcripción.</p>
            <Button size="sm" variant="outline" onClick={() => retry(false)} disabled={retrying}>
              {retrying ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Mic size={14} className="mr-1" />} Transcribir ahora
            </Button>
          </div>
        )}

        {transcript && working && (
          <div className="flex flex-col items-start gap-2">
            <p className="flex items-center gap-2 text-sm text-blue-700 dark:text-blue-300">
              <Loader2 size={16} className="animate-spin" /> Transcribiendo con {providerLabel(transcript.provider === 'pending' ? 'elevenlabs' : transcript.provider)}… (≈ 1-2 min)
            </p>
            {stuck && (
              <div className="flex flex-col items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
                <p className="flex items-center gap-2">
                  <AlertTriangle size={14} /> Está tardando más de lo normal. Puedes volver a lanzarla.
                </p>
                <Button size="sm" variant="outline" onClick={() => retry(true)} disabled={retrying} aria-label="Reintentar la transcripción atascada">
                  <RefreshCw size={14} className={cn('mr-1', retrying && 'animate-spin')} /> Reintentar
                </Button>
              </div>
            )}
          </div>
        )}

        {transcript && !working && transcript.status === 'failed' && (
          <div className="flex flex-col items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200">
            <p className="flex items-center gap-2"><AlertTriangle size={16} /> {ERROR_LABELS[transcript.error_code ?? ''] ?? 'La transcripción falló'}</p>
            {transcript.error_message && <p className="text-xs opacity-80">{transcript.error_message}</p>}
            {transcript.error_code === 'INSUFFICIENT_CREDITS' ? (
              <a href="/app/configuracion?modulo=crm&tab=creditos" className="text-xs underline">Comprar créditos</a>
            ) : (
              <Button size="sm" variant="outline" onClick={() => retry(true)} disabled={retrying}>
                <RefreshCw size={14} className={cn('mr-1', retrying && 'animate-spin')} /> Reintentar
              </Button>
            )}
          </div>
        )}

        {transcript && !working && transcript.status === 'completed' && (
          <>
            <div className="mb-2 flex items-center gap-2">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-2 top-2.5 text-gray-400" />
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar en la transcripción" className="h-8 pl-7 text-sm" aria-label="Buscar en la transcripción" />
              </div>
              {query && <span className="text-xs text-gray-500 dark:text-gray-400">{filtered.length} coincidencia{filtered.length === 1 ? '' : 's'}</span>}
            </div>
            {segments.length === 0 ? (
              transcript.full_text?.trim() ? (
                <p className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-200">{transcript.full_text}</p>
              ) : (
                <p className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
                  <AlertTriangle size={14} /> No se detectó voz en la grabación (silencio o buzón vacío); no hay nada que analizar.
                </p>
              )
            ) : (
              <ol className="max-h-80 space-y-1 overflow-y-auto pr-1" role="list">
                {filtered.slice(0, limit).map((seg) => {
                  const isAgent = seg.speaker_role === 'agent';
                  const active = seg.id === activeId;
                  return (
                    <li key={seg.id}>
                      <button
                        type="button"
                        onClick={() => onSeek?.(seg.start_ms)}
                        aria-current={active ? 'true' : undefined}
                        aria-label={`Ir a ${fmtMs(seg.start_ms)}, ${roleLabel(seg.speaker_role, seg.speaker_label).toLowerCase()}`}
                        className={cn(
                          'flex w-full gap-2 rounded px-2 py-1 text-left text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                          active ? 'bg-blue-50 dark:bg-blue-900/30' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50',
                        )}
                      >
                        <span className="w-11 shrink-0 font-mono text-[11px] text-gray-400 dark:text-gray-500">{fmtMs(seg.start_ms)}</span>
                        <span className={cn('w-16 shrink-0 text-[11px] font-semibold', isAgent ? 'text-blue-700 dark:text-blue-300' : seg.speaker_role === 'customer' ? 'text-emerald-700 dark:text-emerald-300' : 'text-gray-500 dark:text-gray-400')}>
                          {roleLabel(seg.speaker_role, seg.speaker_label)}
                        </span>
                        <span className="text-gray-800 dark:text-gray-100">{highlight(seg.text, query)}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
            {filtered.length > limit && (
              <Button size="sm" variant="ghost" className="mt-2 w-full text-xs" onClick={() => setLimit((l) => l + pageSize)}>
                Mostrar {Math.min(pageSize, filtered.length - limit)} más
              </Button>
            )}
            <p className="mt-2 text-[11px] text-gray-400 dark:text-gray-500">
              {transcript.speaker_count ?? '?'} hablante(s) · {transcript.duration_seconds ? fmtMs(transcript.duration_seconds * 1000) : '--:--'}
              {typeof transcript.cost_amount === 'number' && ` · $${transcript.cost_amount.toFixed(4)}`}
            </p>
          </>
        )}
      </div>
    </section>
  );
}

export default CallTranscriptPanel;
