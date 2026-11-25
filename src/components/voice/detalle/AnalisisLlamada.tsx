'use client';

/**
 * Tarjetas del análisis IA en el detalle de una llamada (Figma 1363:20):
 * «Resumen», «Sentimiento y conversación», «Objeciones detectadas» y «Tareas
 * sugeridas». En móvil (1368:17) el resumen y cada objeción van compactos.
 *
 * Nada se aplica solo (anotación 1363:1263): la IA sugiere y el vendedor decide.
 * «Crear tareas» escribe por `/analysis/apply` y no se repite (`applied_actions`).
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowRight, Check, Loader2, RefreshCw, Sparkles, TriangleAlert } from 'lucide-react';
import { Tarjeta } from '@/components/kit/Tarjeta';
import { AvisoTonal } from '@/components/kit/AvisoTonal';
import { clasesBoton } from '@/components/kit/botonClases';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/utils/Utils';
import { ERROR_LABELS, type AnalysisBundle, type AnalysisDto, type TranscriptSegmentDto } from '@/components/crm/calls/useCallIntelligence';
import { formatoReloj, instanteDeCita, porcentaje, porcentajeSentimiento } from './llamadaDetalleLogica';

const TONO_SENTIMIENTO: Record<string, 'exito' | 'neutro' | 'peligro' | 'advertencia'> = {
  positive: 'exito',
  neutral: 'neutro',
  negative: 'peligro',
  mixed: 'advertencia',
};

// ─── Resumen ─────────────────────────────────────────────────────────────────

interface TarjetaResumenProps {
  analisis: AnalysisDto | null;
  bundle: AnalysisBundle | null;
  /** La transcripción o el análisis siguen en curso. */
  enProceso: boolean;
  transcripcionLista: boolean;
  analizando: boolean;
  onAnalizar: (forzar: boolean) => void;
  compacta?: boolean;
}

export function TarjetaResumen({ analisis, bundle, enProceso, transcripcionLista, analizando, onAnalizar, compacta }: TarjetaResumenProps) {
  const t = useTranslations('crm.llamadas.detalle.resumen');

  if (compacta) {
    if (!analisis?.summary) return null;
    return (
      <section className="rounded-xl border border-line bg-surface p-4" aria-label={t('tituloMovil')}>
        <h2 className="text-[13px] font-semibold text-fg-secondary">{t('tituloMovil')}</h2>
        <p className="mt-1.5 text-sm text-fg">{analisis.summary}</p>
      </section>
    );
  }

  const fallido = !analisis && bundle?.job?.status === 'failed';
  return (
    <Tarjeta
      titulo={t('titulo')}
      accion={
        analisis ? (
          <span className="flex items-center gap-1">
            <Badge tono="marca" apariencia="contorno" tamano="sm">
              {t('generadoPorIa')}
            </Badge>
            {transcripcionLista && (
              <button
                type="button"
                className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}
                disabled={analizando}
                onClick={() => onAnalizar(true)}
                aria-label={t('reanalizar')}
                title={t('reanalizar')}
              >
                <RefreshCw aria-hidden="true" className={cn('size-4', analizando && 'animate-spin')} />
              </button>
            )}
          </span>
        ) : enProceso || analizando ? (
          <Badge tono="marca" apariencia="contorno" tamano="sm">
            {t('enProceso')}
          </Badge>
        ) : undefined
      }
    >
      <div aria-live="polite">
        {analisis ? (
          <p className="text-[13px] leading-[18px] text-fg">{analisis.summary}</p>
        ) : enProceso || analizando ? (
          <div className="flex flex-col gap-3" role="status">
            <p className="text-[13px] leading-[18px] text-fg-secondary">{t('esperando')}</p>
            {[0, 1, 2].map((i) => (
              <div key={i} aria-hidden="true" className="h-2.5 animate-pulse rounded-full bg-line motion-reduce:animate-none" />
            ))}
          </div>
        ) : fallido ? (
          <AvisoTonal
            tono="peligro"
            compacto
            titulo={ERROR_LABELS[(bundle?.job?.last_error ?? '').split(':')[0]] ?? t('fallido')}
            accion={transcripcionLista ? { etiqueta: t('reintentar'), onClick: () => onAnalizar(true), cargando: analizando } : undefined}
          />
        ) : transcripcionLista ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-[13px] leading-[18px] text-fg-secondary">{t('sinAnalisis')}</p>
            <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} disabled={analizando} onClick={() => onAnalizar(false)}>
              {analizando ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <Sparkles aria-hidden="true" className="size-4" />}
              {t('analizar')}
            </button>
          </div>
        ) : (
          <p className="text-[13px] leading-[18px] text-fg-secondary">{t('esperando')}</p>
        )}
      </div>
    </Tarjeta>
  );
}

// ─── Sentimiento y conversación ──────────────────────────────────────────────

export function TarjetaSentimiento({ analisis }: { analisis: AnalysisDto }) {
  const t = useTranslations('crm.llamadas.detalle.sentimiento');
  const tl = useTranslations('crm.llamadas');
  const intensidad = porcentajeSentimiento(analisis.sentiment_score);
  const habloVendedor = porcentaje(analisis.talk_ratio_agent);
  const pie = [
    typeof analisis.longest_monologue_seconds === 'number' ? t('monologo', { s: analisis.longest_monologue_seconds }) : null,
    typeof analisis.questions_asked === 'number' ? t('preguntas', { n: analisis.questions_asked }) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  if (!analisis.sentiment && habloVendedor === null && !pie) return null;
  return (
    <Tarjeta titulo={t('titulo')}>
      <div className="flex flex-col gap-3">
        {analisis.sentiment && (
          <div>
            <Badge tono={TONO_SENTIMIENTO[analisis.sentiment] ?? 'neutro'} apariencia="contorno" tamano="sm">
              {intensidad !== null
                ? t('etiqueta', { sentimiento: tl(`sentimientos.${analisis.sentiment}`), n: intensidad })
                : tl(`sentimientos.${analisis.sentiment}`)}
            </Badge>
          </div>
        )}
        {habloVendedor !== null && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-[13px] text-fg-secondary">
              <span>{t('habloVendedor')}</span>
              <span className="tabular-nums text-fg">{habloVendedor} %</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-subtle" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={habloVendedor} aria-label={t('habloVendedor')}>
              <div className="h-full rounded-full bg-brand" style={{ width: `${habloVendedor}%` }} />
            </div>
          </div>
        )}
        {pie && <p className="text-xs text-fg-secondary">{pie}</p>}
      </div>
    </Tarjeta>
  );
}

// ─── Objeciones ──────────────────────────────────────────────────────────────

interface ObjecionVista {
  clave: string;
  titulo: string;
  ms: number | null;
  respuesta: string | null;
}

function useObjeciones(analisis: AnalysisDto, bundle: AnalysisBundle | null, segmentos: readonly TranscriptSegmentDto[]): ObjecionVista[] {
  return useMemo(
    () =>
      (analisis.detected_objections ?? []).map((o, i) => {
        const cat = o.objection_id ? (bundle?.objections ?? []).find((c) => c.id === o.objection_id) : null;
        return {
          clave: `${i}-${o.label}`,
          titulo: cat?.title ?? o.label,
          ms: instanteDeCita(segmentos, o.quote),
          respuesta: cat?.recommended_response ?? null,
        };
      }),
    [analisis, bundle, segmentos],
  );
}

interface TarjetaObjecionesProps {
  analisis: AnalysisDto;
  bundle: AnalysisBundle | null;
  segmentos: readonly TranscriptSegmentDto[];
  onIr: (ms: number) => void;
  compacta?: boolean;
}

export function TarjetaObjeciones({ analisis, bundle, segmentos, onIr, compacta }: TarjetaObjecionesProps) {
  const t = useTranslations('crm.llamadas.detalle.objeciones');
  const lista = useObjeciones(analisis, bundle, segmentos);
  if (lista.length === 0) return null;

  if (compacta) {
    return (
      <>
        {lista.map((o) => (
          <section key={o.clave} className="rounded-xl border border-line bg-surface p-4" aria-label={o.titulo}>
            <h2 className="text-[13px] font-semibold text-fg-secondary">
              {o.ms !== null ? t('tituloMovilConTiempo', { objecion: o.titulo, tiempo: formatoReloj(o.ms) }) : t('tituloMovil', { objecion: o.titulo })}
            </h2>
            {o.respuesta && <p className="mt-1.5 text-sm text-fg">{t('respuesta', { texto: o.respuesta })}</p>}
          </section>
        ))}
      </>
    );
  }

  return (
    <Tarjeta
      titulo={t('titulo')}
      accion={
        <span className="flex size-5 items-center justify-center rounded-full border border-line-warning bg-warning-subtle text-[11px] font-semibold tabular-nums text-warning-text" aria-label={t('cuantas', { n: lista.length })}>
          {lista.length}
        </span>
      }
    >
      <ul className="flex flex-col gap-2">
        {lista.map((o) => (
          <li key={o.clave} className="rounded-lg border border-line-warning bg-warning-subtle px-3 py-3">
            <div className="flex items-start gap-2">
              <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning-text" strokeWidth={1.5} />
              <p className="min-w-0 flex-1 text-sm font-medium text-fg">{o.titulo}</p>
              {o.ms !== null && (
                <button type="button" onClick={() => onIr(o.ms as number)} className="shrink-0 rounded text-xs tabular-nums text-fg-secondary hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand" aria-label={t('irA', { tiempo: formatoReloj(o.ms) })}>
                  {formatoReloj(o.ms)}
                </button>
              )}
            </div>
            <p className="mt-1.5 text-xs text-fg-secondary">
              {o.respuesta ? `${t('respuesta', { texto: o.respuesta })} ` : ''}
              <Link href="/app/crm/objeciones" className="inline-flex items-center gap-0.5 text-fg-secondary underline-offset-2 hover:text-fg hover:underline">
                {t('verBiblioteca')}
                <ArrowRight aria-hidden="true" className="size-3" />
              </Link>
            </p>
          </li>
        ))}
      </ul>
    </Tarjeta>
  );
}

// ─── Tareas sugeridas ────────────────────────────────────────────────────────

interface TarjetaTareasProps {
  analisis: AnalysisDto;
  aplicadas: ReadonlySet<string>;
  creando: boolean;
  onCrear: (indices: number[]) => void;
  formatoFecha: (plana: string) => string;
}

export function TarjetaTareas({ analisis, aplicadas, creando, onCrear, formatoFecha }: TarjetaTareasProps) {
  const t = useTranslations('crm.llamadas.detalle.tareas');
  const tareas = analisis.suggested_tasks ?? [];
  const pendientes = tareas.map((_, i) => i).filter((i) => !aplicadas.has(`task:${i}`));
  const [marcadas, setMarcadas] = useState<ReadonlySet<number>>(() => new Set(pendientes));
  const [descartada, setDescartada] = useState(false);
  if (tareas.length === 0 || descartada) return null;
  const elegidas = pendientes.filter((i) => marcadas.has(i));

  return (
    <Tarjeta titulo={t('titulo')}>
      <div className="flex flex-col gap-3">
        <ul className="flex flex-col gap-2">
          {tareas.map((tarea, i) => {
            const hecha = aplicadas.has(`task:${i}`);
            const id = `tarea-sugerida-${analisis.id}-${i}`;
            return (
              <li key={i} className="flex items-center gap-2">
                <Checkbox
                  id={id}
                  checked={hecha || marcadas.has(i)}
                  disabled={hecha || creando}
                  onCheckedChange={(v) =>
                    setMarcadas((prev) => {
                      const n = new Set(prev);
                      if (v === true) n.add(i);
                      else n.delete(i);
                      return n;
                    })
                  }
                />
                <label htmlFor={id} className={cn('text-sm text-fg', hecha && 'text-fg-muted line-through')}>
                  {tarea.due_date ? t('conFecha', { tarea: tarea.title, fecha: formatoFecha(tarea.due_date) }) : tarea.title}
                </label>
                {hecha && <span className="sr-only">{t('creada')}</span>}
              </li>
            );
          })}
        </ul>
        {pendientes.length > 0 ? (
          <div className="flex items-center gap-2">
            <button type="button" className={clasesBoton({ tamano: 'sm' })} disabled={creando || elegidas.length === 0} onClick={() => onCrear(elegidas)}>
              {creando ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <Check aria-hidden="true" className="size-4" />}
              {t('crear', { n: elegidas.length })}
            </button>
            <button type="button" className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })} disabled={creando} onClick={() => setDescartada(true)}>
              {t('descartar')}
            </button>
          </div>
        ) : (
          <p className="flex items-center gap-1.5 text-xs text-success-text">
            <Check aria-hidden="true" className="size-3.5" /> {t('todasCreadas')}
          </p>
        )}
      </div>
    </Tarjeta>
  );
}
