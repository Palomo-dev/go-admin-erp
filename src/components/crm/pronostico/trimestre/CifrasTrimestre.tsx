'use client';

/**
 * Cifras del trimestre (Figma CRM 1431:19 «Categorías» y «Barra vs cuota»):
 * cuota, compromiso, mejor caso, ponderado y ganado, y la cobertura de la
 * cuota. Cargando (1434:842588): esqueleto en las categorías; la barra se
 * muestra cuando llegan los totales. Un monto en una moneda sin tasa no suma:
 * se avisa.
 */

import { useTranslations } from 'next-intl';
import { cn } from '@/utils/Utils';
import { Skeleton } from '@/components/ui/skeleton';
import { AvisoTonal } from '@/components/kit/AvisoTonal';
import { formatMoneda, type ContextoMoneda } from '@/lib/utils/moneda';
import { pctDe, type ClaveResumen } from '@/lib/services/crm/forecastLogica';
import type { ResumenMonedaBase } from '@/components/crm/kit/monedaCrm';
import { anchosCobertura, brechaCuota } from './trimestreLogica';

type Resumen = Record<ClaveResumen, ResumenMonedaBase>;

const COLOR_VALOR = { neutro: 'text-fg', compromiso: 'text-brand-deep', mejor: 'text-brand', ganado: 'text-success-text' } as const;

function Cifra({ etiqueta, valor, detalle, color = 'neutro' }: { etiqueta: string; valor: string; detalle: string; color?: keyof typeof COLOR_VALOR }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-xl border border-line bg-surface p-4">
      <span className="truncate text-xs font-medium text-fg-secondary">{etiqueta}</span>
      <span className={cn('truncate text-xl font-semibold tabular-nums', COLOR_VALOR[color])}>{valor}</span>
      <span className="text-xs text-fg-secondary">{detalle}</span>
    </div>
  );
}

function CifraCargando() {
  return (
    <div aria-hidden="true" className="flex items-center gap-3 rounded-xl border border-line bg-surface p-4">
      <Skeleton className="size-10 shrink-0 rounded-lg" />
      <div className="flex flex-1 flex-col gap-2">
        <Skeleton className="h-3 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  );
}

const REJILLA = 'grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5';

export function CifrasTrimestre({ resumen, moneda, enDetalle }: { resumen: Resumen | null; moneda: ContextoMoneda | null; enDetalle: boolean }) {
  const t = useTranslations('crm.pronosticoTrimestre.cifras');
  if (!resumen || !moneda) {
    return (
      <div className={REJILLA} aria-busy="true" aria-label={t('cargando')}>
        {Array.from({ length: 5 }).map((_, i) => <CifraCargando key={i} />)}
      </div>
    );
  }
  const m = (n: number) => formatMoneda(n, moneda);
  const cuota = resumen.quota.total;
  const detalle = (clave: string, n: number) => (cuota > 0 ? t(`${clave}.detalle`, { pct: pctDe(n, cuota) ?? 0 }) : t(`${clave}.detalleSinCuota`));
  const sinTasa = Object.values(resumen).some((r) => r.sinTasa.length > 0);

  return (
    <div className="space-y-3">
      <section aria-label={t('etiqueta')} className={REJILLA}>
        <Cifra etiqueta={t('cuota.titulo')} valor={cuota > 0 ? m(cuota) : '—'} detalle={cuota > 0 ? t(enDetalle ? 'cuota.detalleVendedor' : 'cuota.detalle') : t('cuota.sinCuota')} />
        <Cifra etiqueta={t('compromiso.titulo')} valor={m(resumen.commit.total)} detalle={detalle('compromiso', resumen.commit.total)} color="compromiso" />
        <Cifra etiqueta={t('mejorCaso.titulo')} valor={m(resumen.bestCase.total)} detalle={detalle('mejorCaso', resumen.bestCase.total)} color="mejor" />
        <Cifra etiqueta={t('ponderado.titulo')} valor={m(resumen.weighted.total)} detalle={detalle('ponderado', resumen.weighted.total)} />
        <Cifra etiqueta={t('ganado.titulo')} valor={m(resumen.won.total)} detalle={detalle('ganado', resumen.won.total)} color="ganado" />
      </section>
      {sinTasa && <AvisoTonal tono="advertencia" compacto titulo={t('sinTasa.titulo')} descripcion={t('sinTasa.descripcion')} />}
    </div>
  );
}

/** «Cobertura de la cuota»: ganado ⊂ compromiso ⊂ mejor caso, con la leyenda arriba a la derecha. */
export function CoberturaCuota({ resumen, moneda }: { resumen: Resumen; moneda: ContextoMoneda }) {
  const t = useTranslations('crm.pronosticoTrimestre.cifras.cobertura');
  const cuota = resumen.quota.total;
  if (cuota <= 0) return null;
  const m = (n: number) => formatMoneda(n, moneda);
  const pct = (n: number) => pctDe(n, cuota) ?? 0;
  const brecha = brechaCuota(cuota, resumen.commit.total, resumen.bestCase.total);
  const anchos = anchosCobertura(cuota, resumen.won.total, resumen.commit.total, resumen.bestCase.total);
  const leyenda = [
    { clave: 'ganado', color: 'bg-success' },
    { clave: 'compromiso', color: 'bg-brand-deep' },
    { clave: 'mejorCaso', color: 'bg-brand/30' },
  ];

  return (
    <section aria-labelledby="cobertura-titulo" className="space-y-3 rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="cobertura-titulo" className="text-[15px] font-semibold text-fg">{t('titulo')}</h2>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-secondary">
          {leyenda.map((l) => (
            <li key={l.clave} className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className={cn('size-2.5 rounded-sm', l.color)} />
              {t(l.clave)}
            </li>
          ))}
        </ul>
      </div>
      <div className="relative h-2.5 overflow-hidden rounded-full bg-subtle" role="img" aria-label={t('aria', { compromiso: pct(resumen.commit.total), mejor: pct(resumen.bestCase.total) })}>
        <div className="absolute inset-y-0 left-0 rounded-full bg-brand/30" style={{ width: `${anchos.mejorCaso}%` }} />
        <div className="absolute inset-y-0 left-0 rounded-full bg-brand-deep" style={{ width: `${anchos.compromiso}%` }} />
        <div className="absolute inset-y-0 left-0 rounded-full bg-success" style={{ width: `${anchos.ganado}%` }} />
      </div>
      <p className="text-xs text-fg-secondary">
        {brecha.falta > 0 ? t('falta', { falta: m(brecha.falta), pct: brecha.pctMejor ?? 0 }) : t('cubierta')}
      </p>
    </section>
  );
}
