'use client';

/**
 * Cifras del trimestre (Figma CRM 1431:19 «Categorías» y «Barra vs cuota»):
 * cuota, compromiso, mejor caso, ponderado y ganado, con la cobertura.
 * Un monto en una moneda sin tasa no suma: se avisa.
 */

import { useTranslations } from 'next-intl';
import { KpiStrip } from '@/components/kit/KpiStrip';
import { StatCard } from '@/components/kit/StatCard';
import { AvisoTonal } from '@/components/kit/AvisoTonal';
import { formatMoneda, type ContextoMoneda } from '@/lib/utils/moneda';
import { pctDe, type ClaveResumen } from '@/lib/services/crm/forecastLogica';
import type { ResumenMonedaBase } from '@/components/crm/kit/monedaCrm';
import { anchosCobertura, brechaCuota } from './trimestreLogica';

export function CifrasTrimestre({ resumen, moneda }: { resumen: Record<ClaveResumen, ResumenMonedaBase>; moneda: ContextoMoneda }) {
  const t = useTranslations('crm.pronosticoTrimestre.cifras');
  const m = (n: number) => formatMoneda(n, moneda);
  const cuota = resumen.quota.total;
  const pct = (n: number) => pctDe(n, cuota);
  const sinTasa = Object.values(resumen).some((r) => r.sinTasa.length > 0);
  const brecha = brechaCuota(cuota, resumen.commit.total, resumen.bestCase.total);
  const anchos = anchosCobertura(cuota, resumen.won.total, resumen.commit.total, resumen.bestCase.total);
  const detalle = (clave: string, n: number) => (cuota > 0 ? t(`${clave}.detalle`, { pct: pct(n) ?? 0 }) : t(`${clave}.detalleSinCuota`));

  return (
    <div className="space-y-4">
      <KpiStrip columnas={5} etiqueta={t('etiqueta')}>
        <StatCard etiqueta={t('cuota.titulo')} valor={cuota > 0 ? m(cuota) : '—'} detalle={cuota > 0 ? t('cuota.detalle') : t('cuota.sinCuota')} />
        <StatCard etiqueta={t('compromiso.titulo')} valor={m(resumen.commit.total)} detalle={detalle('compromiso', resumen.commit.total)} tono="marca" />
        <StatCard etiqueta={t('mejorCaso.titulo')} valor={m(resumen.bestCase.total)} detalle={detalle('mejorCaso', resumen.bestCase.total)} />
        <StatCard etiqueta={t('ponderado.titulo')} valor={m(resumen.weighted.total)} detalle={detalle('ponderado', resumen.weighted.total)} />
        <StatCard etiqueta={t('ganado.titulo')} valor={m(resumen.won.total)} detalle={detalle('ganado', resumen.won.total)} tono="exito" />
      </KpiStrip>

      {sinTasa && <AvisoTonal tono="advertencia" compacto titulo={t('sinTasa.titulo')} descripcion={t('sinTasa.descripcion')} />}

      {cuota > 0 ? (
        <section aria-labelledby="cobertura-titulo" className="space-y-2 rounded-xl border border-line bg-surface p-4">
          <h3 id="cobertura-titulo" className="text-sm font-semibold text-fg">{t('cobertura.titulo')}</h3>
          <div className="relative h-3 overflow-hidden rounded-full bg-subtle" role="img" aria-label={t('cobertura.aria', { compromiso: pct(resumen.commit.total) ?? 0, mejor: pct(resumen.bestCase.total) ?? 0 })}>
            <div className="absolute inset-y-0 left-0 rounded-full bg-brand/25" style={{ width: `${anchos.mejorCaso}%` }} />
            <div className="absolute inset-y-0 left-0 rounded-full bg-brand/60" style={{ width: `${anchos.compromiso}%` }} />
            <div className="absolute inset-y-0 left-0 rounded-full bg-success" style={{ width: `${anchos.ganado}%` }} />
            <div className="absolute inset-y-0 w-0.5 bg-fg" style={{ left: `calc(${anchos.cuota}% - 1px)` }} />
          </div>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-secondary">
            <li className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="size-2.5 rounded-full bg-success" />{t('cobertura.ganado')}</li>
            <li className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="size-2.5 rounded-full bg-brand/60" />{t('cobertura.compromiso')}</li>
            <li className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="size-2.5 rounded-full bg-brand/25" />{t('cobertura.mejorCaso')}</li>
          </ul>
          <p className="text-[13px] text-fg">
            {brecha.falta > 0 ? t('cobertura.falta', { falta: m(brecha.falta), pct: brecha.pctMejor ?? 0 }) : t('cobertura.cubierta')}
          </p>
        </section>
      ) : (
        <AvisoTonal tono="informacion" compacto titulo={t('sinCuotas.titulo')} descripcion={t('sinCuotas.descripcion')} />
      )}
    </div>
  );
}
