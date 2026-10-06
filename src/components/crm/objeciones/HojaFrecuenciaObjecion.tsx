'use client';

/**
 * «Aparece en llamadas» de una objeción (Figma CRM 1410:118018): tendencia
 * semanal de 90 días, las llamadas donde salió (con el minuto en que el
 * cliente la dijo, si la transcripción lo ubica) y las respuestas que
 * funcionaron en tus llamadas. Todo calculado en el servidor.
 */

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Play } from 'lucide-react';
import { HojaDetalle } from '@/components/kit/HojaDetalle';
import { EmptyState } from '@/components/kit/EmptyState';
import { useFormatoEntero } from '@/components/kit/useIdiomaKit';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { formatPlainDate } from '@/lib/utils/dateDisplay';
import { altosTendencia, marcaTiempo, semanaPico } from './frecuenciaObjecionesLogica';
import { useFrecuenciaObjeciones } from './useFrecuenciaObjeciones';

interface Props {
  objecion: { id: string; title: string } | null;
  onCerrar: () => void;
}

export function HojaFrecuenciaObjecion({ objecion, onCerrar }: Props) {
  const t = useTranslations('crm.objecionesFrecuencia');
  const entero = useFormatoEntero();
  const { formatDate } = useFormatDate();
  const { estado, datos, reintentar } = useFrecuenciaObjeciones(objecion?.id ?? null, objecion !== null);
  const semanas = datos?.weeks ?? [];
  const pico = semanaPico(semanas);
  const altos = altosTendencia(semanas);
  const total = datos?.frequencies.find((f) => f.objection_id === objecion?.id)?.call_count ?? 0;

  return (
    <HojaDetalle abierto={objecion !== null} onAbiertoChange={(a) => !a && onCerrar()} titulo={objecion?.title ?? ''} subtitulo={t('subtitulo', { dias: datos?.dias ?? 90 })} ancho={560}>
      {estado === 'cargando' ? (
        <div aria-busy="true" aria-label={t('cargando')} className="space-y-3">
          <div className="h-24 animate-pulse rounded-lg bg-subtle" />
          <div className="h-40 animate-pulse rounded-lg bg-subtle" />
        </div>
      ) : estado !== 'listo' || !datos ? (
        <EmptyState compacto variante={estado === 'sinPermiso' ? 'forbidden' : 'error'} titulo={t(estado === 'sinPermiso' ? 'sinPermiso' : 'error')} onReintentar={estado === 'error' ? reintentar : undefined} />
      ) : total === 0 ? (
        <EmptyState compacto titulo={t('vacio.titulo')} descripcion={t('vacio.descripcion')} />
      ) : (
        <div className="space-y-6">
          <section aria-labelledby="obj-tendencia" className="space-y-2">
            <h3 id="obj-tendencia" className="text-sm font-semibold text-fg">{t('tendencia')}</h3>
            <div className="flex h-20 items-end gap-1" role="img" aria-label={t('tendenciaAria', { n: entero(total) })}>
              {semanas.map((s, i) => (
                <div key={s.week} className="flex-1 rounded-t bg-brand/70" style={{ height: `${altos[i]}%` }} title={`${formatPlainDate(s.week)} · ${entero(s.call_count)}`} />
              ))}
            </div>
            {pico && <p className="text-xs text-fg-secondary">{t('pico', { semana: formatPlainDate(pico.week), n: entero(pico.call_count) })}</p>}
          </section>

          <section aria-labelledby="obj-llamadas" className="space-y-2">
            <h3 id="obj-llamadas" className="text-sm font-semibold text-fg">{t('llamadas', { n: entero(total) })}</h3>
            <ul className="divide-y divide-line rounded-lg border border-line">
              {datos.calls.map((c) => {
                const minuto = marcaTiempo(c.start_ms);
                return (
                  <li key={c.call_id}>
                    <Link href={`/app/crm/llamadas?call=${encodeURIComponent(c.call_id)}`} className="flex items-center gap-3 px-3 py-2 hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
                      <Play aria-hidden="true" className="size-4 shrink-0 text-fg-secondary" strokeWidth={1.5} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-fg">{[c.customer_name || t('sinCliente'), minuto].filter(Boolean).join(' · ')}</span>
                        <span className="block truncate text-xs text-fg-secondary">
                          {[formatDate(c.started_at), c.seller_name, c.advanced ? t('avanzo') : t('sinAvance')].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            {total > datos.calls.length && <p className="text-xs text-fg-secondary">{t('soloUltimas', { n: entero(datos.calls.length) })}</p>}
          </section>

          <section aria-labelledby="obj-respuestas" className="space-y-2">
            <h3 id="obj-respuestas" className="text-sm font-semibold text-fg">{t('respuestas')}</h3>
            {datos.responses.length === 0 ? (
              <p className="text-[13px] text-fg-secondary">{t('sinRespuestas')}</p>
            ) : (
              <ul className="space-y-2">
                {datos.responses.map((r) => (
                  <li key={r.response_text} className="rounded-lg border border-line bg-surface p-3">
                    <p className="text-sm text-fg">«{r.response_text}»</p>
                    <p className="mt-1 text-xs text-fg-secondary">{t('usada', { usada: entero(r.used_count), avanzo: entero(r.advanced_count) })}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </HojaDetalle>
  );
}
