'use client';

/**
 * «Mi pronóstico» en el celular (Figma CRM 1434:843089): el vendedor revisa
 * sus cifras del trimestre y clasifica sus oportunidades. Sin ajustes (son del
 * supervisor, en escritorio). Usa la misma foto y el mismo cambio de categoría
 * que el escritorio.
 */

import { useTranslations } from 'next-intl';
import { cn } from '@/utils/Utils';
import { Skeleton } from '@/components/ui/skeleton';
import { BarraProgreso } from '@/components/kit/BarraProgreso';
import { EmptyState } from '@/components/kit/EmptyState';
import { Pagination } from '@/components/kit/Pagination';
import { formatPlainDate } from '@/lib/utils/dateDisplay';
import { formatMoneda } from '@/lib/utils/moneda';
import { TAMANO_PAGINA_PRONOSTICO } from '@/lib/services/crm/forecastLogica';
import type { RespuestaPronostico } from '@/lib/services/crm/forecastService';
import { useCategoriaPronostico } from './OportunidadesPronostico';
import { partesTrimestre, tonoProgresoCobertura } from './trimestreLogica';

interface Props {
  datos: RespuestaPronostico | null;
  pagina: number;
  onPagina: (p: number) => void;
  onCambio: () => void;
}

export function PronosticoMovil({ datos, pagina, onPagina, onCambio }: Props) {
  const t = useTranslations('crm.pronosticoTrimestre.movil');
  const tc = useTranslations('crm.pronosticoTrimestre.cifras');
  const { selector } = useCategoriaPronostico(onCambio);

  if (!datos) {
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-44 w-full rounded-xl" />
        <Skeleton className="h-5 w-48" />
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
      </div>
    );
  }

  const m = (n: number) => formatMoneda(n, datos.moneda);
  const r = datos.summary;
  const cuota = r.quota.total;
  const cobertura = cuota > 0 ? r.commit.total / cuota : null;
  const filas = [
    { clave: 'ganado', valor: r.won.total, color: 'text-success-text' },
    { clave: 'compromiso', valor: r.commit.total, color: 'text-brand-deep' },
    { clave: 'mejorCaso', valor: r.bestCase.total, color: 'text-brand' },
  ];

  return (
    <div className="space-y-4">
      <section aria-label={t('resumen')} className="space-y-2 rounded-xl border border-line bg-surface p-4">
        <p className="text-xs text-fg-secondary">{t('cabecera', { q: partesTrimestre(datos.period).q, cuota: cuota > 0 ? m(cuota) : '—' })}</p>
        <dl className="space-y-2">
          {filas.map((f) => (
            <div key={f.clave} className="flex items-center justify-between gap-2">
              <dt className="text-[13px] text-fg-secondary">{tc(`${f.clave}.titulo`)}</dt>
              <dd className={cn('text-base font-semibold tabular-nums', f.color)}>{m(f.valor)}</dd>
            </div>
          ))}
        </dl>
        {cobertura !== null && (
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-fg-secondary">{t('cobertura')}</span>
              <span className="font-medium text-fg tabular-nums">{Math.round(cobertura * 100)} %</span>
            </div>
            <BarraProgreso valor={Math.min(100, cobertura * 100)} etiqueta={t('cobertura')} textoValor={`${Math.round(cobertura * 100)} %`} tono={tonoProgresoCobertura(cobertura)} />
          </div>
        )}
      </section>

      <h2 className="text-[15px] font-semibold text-fg">{t('clasifica')}</h2>
      {datos.opportunities.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface">
          <EmptyState compacto titulo={t('vacio.titulo')} descripcion={t('vacio.descripcion')} accion={{ etiqueta: t('vacio.irPipeline'), href: '/app/crm/pipeline' }} />
        </div>
      ) : (
        <ul className="space-y-3">
          {datos.opportunities.map((o) => (
            <li key={o.id} className="space-y-1.5 rounded-xl border border-line bg-surface p-3">
              <p className="text-sm font-medium text-fg">{o.name}</p>
              <p className="text-xs text-fg-secondary">
                {[formatMoneda(o.amount, o.currency ?? datos.moneda), formatPlainDate(o.expected_close_date, { day: '2-digit', month: '2-digit' })].filter(Boolean).join(' · ')}
              </p>
              {selector(o, 'w-full')}
            </li>
          ))}
        </ul>
      )}
      {datos.opportunityCount > TAMANO_PAGINA_PRONOSTICO && (
        <Pagination pagina={pagina} tamano={TAMANO_PAGINA_PRONOSTICO} total={datos.opportunityCount} onPaginaChange={onPagina} sustantivo={{ singular: t('sustantivo.uno'), plural: t('sustantivo.otros') }} />
      )}
    </div>
  );
}
