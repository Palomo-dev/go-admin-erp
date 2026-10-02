'use client';

/**
 * CallTranscriptPanel — transcripción de una llamada (FASE-04 §5.2).
 * Segmentos con rol/hablante/tiempo (clic → onSeek), búsqueda con resaltado,
 * copiar, estados pendiente/procesando (polling 5 s) / error con "Reintentar".
 * Reutilizable en /app/crm/llamadas y en el timeline (F9).
 */

import { useMemo, useState } from 'react';
import { Copy, Loader2, RefreshCw, AlertTriangle, FileText, Mic } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslations } from 'next-intl';
import { SearchInput, AvatarIniciales, EmptyState, RowActionsMenu } from '@/components/kit';
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
  variante?: 'panel' | 'ficha';
  customerName?: string | null;
  agentName?: string | null;
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
      <mark className="rounded bg-warning-subtle px-0.5 text-warning-text">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}

export function CallTranscriptPanel({ callId, onSeek, currentMs, state, className, pageSize = 100, variante = 'panel', customerName, agentName }: CallTranscriptPanelProps) {
  const t = useTranslations('crm.llamadas.ficha');
  const calls = useTranslations('crm.llamadas');
  const own = useCallIntelligence(callId, !state);
  const s = state ?? own;
  const { transcript, refetch } = s;
  const readError = s.transcriptError !== undefined ? s.transcriptError : s.error;
  const [query, setQuery] = useState('');
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const [limit, setLimit] = useState(pageSize);
  const [retrying, setRetrying] = useState(false);

  const segments = useMemo(() => transcript?.segments ?? [], [transcript]);
  const filtered = useMemo(() => (query ? segments.filter((x) => x.text.toLowerCase().includes(query.toLowerCase())) : segments), [segments, query]);
  const activeId = useMemo(() => {
    if (currentMs === null || currentMs === undefined) return null;
    const seg = segments.find((x) => currentMs >= x.start_ms && currentMs < x.end_ms) ?? null;
    return seg?.id ?? null;
  }, [segments, currentMs]);

  const previewId = activeId ?? filtered[0]?.id;

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

  // Mismo umbral que transcriptionService: antes de 10 min el job sigue vivo.
  // No ofrecer un segundo intento que pueda duplicar el cobro del proveedor.
  const STUCK_MS = 10 * 60 * 1000;
  const startedMs = transcript ? Date.parse(transcript.started_at ?? transcript.updated_at ?? transcript.created_at ?? '') : NaN;
  const stuck = !!working && Number.isFinite(startedMs) && Date.now() - startedMs > STUCK_MS;

  return (
    <section className={cn('flex flex-col rounded-xl border border-line bg-surface', className)} aria-label={calls('transcripcion')}>
      <header className={cn("flex flex-wrap items-center justify-between gap-2", variante === 'ficha' ? "px-4 pt-4" : "border-b border-line px-3 py-2")}>
        <div className={cn("flex items-center gap-2", variante === 'ficha' ? "text-[13px] font-medium leading-[18px] text-fg-secondary lg:text-base lg:font-semibold lg:leading-[22px] lg:text-fg" : "text-base font-semibold text-fg")}>
          {variante !== 'ficha' && <FileText size={16} className="text-brand" />} {calls('transcripcion')}
          {variante !== 'ficha' && transcript?.status === 'completed' && (
            <Badge variant="secondary" className="text-[10px] font-normal">
              {providerLabel(transcript.provider)}
              {transcript.raw_response?.fell_back ? ' (fallback)' : ''}
            </Badge>
          )}
          {variante !== 'ficha' && transcript?.status === 'completed' && method && (
            <Badge variant={method === 'channel' ? 'success' : 'warning'} className="text-[10px] font-normal" title={method === 'channel' ? 'Roles asignados por canal de la grabación' : 'Roles estimados por heurística'}>
              {method === 'channel' ? 'Roles por canal' : method === 'single' ? '1 hablante' : 'Roles estimados'}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          {variante === 'ficha' && transcript?.status === 'completed' && <span className="hidden text-xs leading-4 text-fg-secondary lg:inline">{[transcript.language, typeof transcript.speaker_count === 'number' ? t('hablantes', { n: transcript.speaker_count }) : null].filter(Boolean).join(' · ')}</span>}
          {transcript?.status === 'completed' && <RowActionsMenu titulo={calls('transcripcion')} orientacion="horizontal" className={variante === 'ficha' && !mobileExpanded ? 'hidden lg:flex' : undefined} acciones={[
            { id: 'copy', etiqueta: t('copiarTranscripcion'), icono: Copy, onSelect: () => void copyAll() },
            { id: 'retry', etiqueta: t('volverTranscribir'), icono: RefreshCw, onSelect: () => void retry(true), deshabilitada: retrying, motivo: calls('procesando') },
          ]} />}
        </div>
      </header>

      <div className={variante === 'ficha' ? "p-4" : "p-3"} aria-live="polite">
        {s.loading && !transcript && (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-4 animate-pulse rounded bg-subtle" style={{ width: `${70 + (i % 3) * 10}%` }} />
            ))}
          </div>
        )}

        {!s.loading && !transcript && !readError && (
          <div className="flex flex-col items-start gap-2 text-sm text-fg-secondary">
            <p className="flex items-center gap-2"><Mic size={16} className="opacity-60" /> {t('sinTranscripcion')}</p>
            <Button size="sm" variant="outline" onClick={() => retry(false)} disabled={retrying}>
              {retrying ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Mic size={14} className="mr-1" />} {t('transcribirAhora')}
            </Button>
          </div>
        )}

        {!s.loading && !transcript && readError && <EmptyState variante="error" onReintentar={() => void refetch()} />}

        {transcript && working && (
          <div className="flex flex-col items-start gap-2">
            <p className="flex items-center gap-2 text-sm text-brand-deep">
              <Loader2 size={16} className="animate-spin" /> {transcript.provider === 'pending' ? calls('procesando') : `Transcribiendo con ${providerLabel(transcript.provider)}… (≈ 1-2 min)`}
            </p>
            {stuck && (
              <div className="flex flex-col items-start gap-2 rounded-md border border-line-warning bg-warning-subtle p-2 text-sm text-warning-text">
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
          <div className="flex flex-col items-start gap-2 rounded-md border border-line-danger bg-danger-subtle p-3 text-sm text-danger-text">
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
            <div className={cn("mb-2 items-center gap-2", variante === 'ficha' && !mobileExpanded ? "hidden lg:flex" : "flex")}>
              <SearchInput value={query} onChange={setQuery} onValueChange={setQuery} placeholder={t('buscarTranscripcion')} etiqueta={t('buscarTranscripcion')} tamano="sm" atajo={false} pistaAtajo={false} className="flex-1" />
              {query && <span className="text-xs text-fg-secondary">{t('coincidencias', { n: filtered.length })}</span>}

            </div>
            {segments.length === 0 ? (
              transcript.full_text?.trim() ? (
                <p className="whitespace-pre-wrap text-sm text-fg-secondary">{transcript.full_text}</p>
              ) : (
                <p className="flex items-center gap-2 rounded-md border border-line-warning bg-warning-subtle p-2 text-sm text-warning-text">
                  <AlertTriangle size={14} /> No se detectó voz en la grabación (silencio o buzón vacío); no hay nada que analizar.
                </p>
              )
            ) : (
              <ol className={cn("space-y-1 overflow-y-auto", variante === 'ficha' ? "max-h-[640px]" : "max-h-80 pr-1")} role="list">
                {filtered.slice(0, limit).map((seg) => {
                  const isAgent = seg.speaker_role === 'agent';
                  const active = seg.id === activeId;
                  const name = isAgent ? agentName || t('agente') : seg.speaker_role === 'customer' ? customerName || t('cliente') : seg.speaker_label || t('hablante');
                  return (
                    <li key={seg.id} className={variante === 'ficha' && !mobileExpanded && seg.id !== previewId ? "hidden lg:block" : undefined}>
                      <button
                        type="button"
                        onClick={() => onSeek?.(seg.start_ms)}
                        aria-current={active ? 'true' : undefined}
                        aria-label={t('irSegmento', { tiempo: fmtMs(seg.start_ms), nombre: name })}
                        className={cn(
                          'flex w-full gap-3 rounded-lg py-2 pl-2 pr-3 text-left text-sm leading-5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                          active ? 'bg-brand-tint' : 'hover:bg-hover',
                        )}
                      >
                        <AvatarIniciales nombre={name} tamano="xs" tono={isAgent ? 'marcaSuave' : 'neutro'} />
                        <span className="min-w-0 flex-1">
                          <span className="mb-0.5 flex flex-wrap items-center gap-2 text-xs leading-4"><span className={cn('font-semibold', isAgent ? 'text-brand-deep' : 'text-fg')}>{name}</span><span className="font-medium tabular-nums text-fg-secondary">{fmtMs(seg.start_ms)}</span></span>
                          <span className={cn("text-fg", variante === 'ficha' && !mobileExpanded && "line-clamp-3 lg:line-clamp-none")}>{highlight(seg.text, query)}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
            {variante === 'ficha' && !mobileExpanded && <Button size="sm" variant="ghost" className="mt-2 w-full text-xs text-brand lg:hidden" onClick={() => setMobileExpanded(true)}>{t('verTranscripcionCompleta')}</Button>}
            {filtered.length > limit && (
              <Button size="sm" variant="ghost" className="mt-2 w-full text-xs" onClick={() => setLimit((l) => l + pageSize)}>
                {t('mostrarMas', { n: Math.min(pageSize, filtered.length - limit) })}
              </Button>
            )}
            {variante !== 'ficha' && <p className="mt-2 text-[11px] text-fg-muted">
              {transcript.speaker_count ?? '?'} hablante(s) · {transcript.duration_seconds ? fmtMs(transcript.duration_seconds * 1000) : '--:--'}
              {typeof transcript.cost_amount === 'number' && ` · $${transcript.cost_amount.toFixed(4)}`}
            </p>}
          </>
        )}
      </div>
    </section>
  );
}

export default CallTranscriptPanel;
