'use client';
import Link from 'next/link';
import { useTranslations, useFormatter } from 'next-intl';
import { MessagesSquare, Copy, Play } from 'lucide-react';
import { EmptyState, clasesBoton } from '@/components/kit';
import { Skeleton } from '@/components/ui/skeleton';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { ErrorApiCrm } from '../acciones/apiCrm';
import { useObjectionInsights } from './useObjectionInsights';
import { useState, type ReactNode } from 'react';
export function ObjectionEvidence({ id, children, onUseResponse, busy=false }: {
  id: string;
  children?: (panels: { responses: ReactNode; activity: ReactNode }) => ReactNode;
  onUseResponse?: (text:string)=>void;
  busy?:boolean;
}) {
  const t = useTranslations('crm.objecionesNuevo'),
    format = useFormatter(),
    dates = useFormatDate();
  const { data, error, loading, reload } = useObjectionInsights(id);
  const [copied, setCopied] = useState<string | null>(null),
    [copyError, setCopyError] = useState(false);
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
      setCopyError(false);
    } catch {
      setCopyError(true);
    }
  };
  const layout = (responses: ReactNode, activity: ReactNode) => children
    ? children({ responses, activity }) : <div className="space-y-6">{responses}{activity}</div>;
  if (loading)
    return layout(null, (
      <div aria-busy="true" aria-label={t('loadingEvidence')}>
        <Skeleton className="h-24" />
        <Skeleton className="mt-3 h-40" />
      </div>
    ));
  if (error)
    return layout(null, (
      <EmptyState
        variante={error instanceof ErrorApiCrm && error.status === 403 ? 'forbidden' : 'error'}
        onReintentar={() => void reload()}
      />
    ));
  if (!data) return layout(null, null);
  const max = Math.max(1, ...data.weeks.map((row) => row.call_count));
  const responses = <section className="rounded-xl border border-line-brand bg-brand-tint p-4">
        <h3 className="font-semibold text-fg">{t('successfulResponses')}</h3>
        <p className="mt-1 text-xs text-fg-secondary">{t('miningHint')}</p>
        {data.responses.length ? (
          <div className="mt-3 space-y-3">
            {data.responses.map((row) => (
              <div key={row.response_text} className="rounded-xl border border-line bg-surface p-4">
                <p className="text-sm text-fg">«{row.response_text}»</p>
                <p className="mt-2 text-xs text-fg-secondary">
                  {t('responseCounts', { used: row.used_count, advanced: row.advanced_count })}
                </p>
                <button
                  type="button"
                  className={`${clasesBoton({ variante: 'secundario' })} mt-3`}
                  disabled={busy}
                  onClick={() => onUseResponse ? onUseResponse(row.response_text) : void copy(row.response_text)}
                >
                  <Copy className="size-4" />
                  {onUseResponse?t('visual.useAlternative'):t(copied === row.response_text ? 'copied' : 'copy')}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            titulo={t('noResponses')}
            descripcion={t('noResponsesHint')}
            icono={MessagesSquare}
          />
        )}
      {copyError && (
        <p role="alert" className="text-sm text-danger">
          {t('copyError')}
        </p>
      )}
      </section>;
  const activity = <div className="space-y-4">
      <section>
        <h3 className="font-semibold text-fg">{t('appearsInCalls')}</h3>
        <p className="mt-1 text-xs text-fg-secondary">{t('last90')}</p>
        {data.weeks.length ? (
          <div
            className="mt-3 flex h-28 items-end gap-1 rounded-xl border border-line bg-surface p-3"
            role="img"
            aria-label={t('weeklyFrequency')}
          >
            {data.weeks.map((row) => (
              <div
                key={row.week}
                className="flex h-full min-w-0 flex-1 flex-col justify-end"
                title={`${dates.formatPlain(row.week)}: ${format.number(row.call_count)}`}
              >
                <div
                  className="min-h-px rounded-t bg-brand"
                  style={{ height: `${(row.call_count / max) * 100}%` }}
                />
                <span className="sr-only">
                  {dates.formatPlain(row.week)}: {format.number(row.call_count)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-fg-secondary">{t('noCalls')}</p>
        )}
      </section>
      <section>
        <ul className="space-y-2">
          {data.calls.map((row) => (
            <li key={row.call_id}>
              <Link
                className="flex items-start gap-3 rounded-lg border border-line p-3 text-sm hover:bg-subtle"
                href={`/app/crm/llamadas?call=${encodeURIComponent(row.call_id)}${row.start_ms === null ? '' : `&start_ms=${row.start_ms}`}`}
              >
                <Play className="mt-1 size-4 shrink-0 text-brand" />
                <div className="flex-1">
                  <p className="text-fg">
                    {row.customer_name} ·{' '}
                    {row.start_ms === null
                      ? t('timestampUnavailable')
                      : `${Math.floor(row.start_ms / 60000)}:${String(Math.floor(row.start_ms / 1000) % 60).padStart(2, '0')}`}
                  </p>
                  <p className="mt-1 text-xs text-fg-secondary">
                    {dates.formatDateTime(row.started_at)} · {row.seller_name} ·{' '}
                    {t(row.advanced ? 'advanced' : 'notAdvanced')}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
        {data.calls.length === 100 && <p className="text-xs text-fg-secondary">{t('recent100')}</p>}
      </section>
    </div>;
  return layout(responses, activity);
}
