'use client';

import { useLocale, useTranslations } from 'next-intl';
import { TriangleAlert } from 'lucide-react';
import { StatCard } from '@/components/kit/StatCard';
import { Skeleton } from '@/components/ui/skeleton';
import { DEFAULT_BANDS, type HealthBand, type HealthBandsJson } from '@/lib/services/crm/healthBands';
import { cn } from '@/utils/Utils';
import { BAND_STYLES } from './healthBandStyles';
import { bandaDeValor, type ResumenBandas, type ResumenTendencia } from './saludLogica';

/**
 * «Resumen» de la lista priorizada (Figma 1415:816): Saludables, En
 * observación y En riesgo (`StatCard`) y la tarjeta «Puntaje medio · 12
 * semanas» (1415:909). Cargando: cuatro `Skeleton` (1424:841109). Si falla
 * solo la tendencia, la tarjeta dice «No disponible» (anotación 1424:841630).
 */
export interface SaludResumenProps {
  resumen: ResumenBandas;
  tendencia: ResumenTendencia | null;
  errorTendencia: boolean;
  cargando: boolean;
  formatear: (valor: number) => string;
}

/** Nombre del mes de una columna `date` (sin zona: no se convierte). */
export function mesDeSemana(semana: string, idioma: string): string {
  const [y, m, d] = semana.split('-').map(Number);
  return new Intl.DateTimeFormat(idioma, { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}

/** Color de la barra por banda: en el panel lo sano va en azul de marca (1415:911); en el detalle, en verde (1424:823). */
const COLOR_BARRA: Record<'marca' | 'banda', Record<HealthBand, string>> = {
  marca: { green: 'bg-brand', yellow: BAND_STYLES.yellow.bar, red: BAND_STYLES.red.bar },
  banda: { green: BAND_STYLES.green.bar, yellow: BAND_STYLES.yellow.bar, red: BAND_STYLES.red.bar },
};

/** Doce barras semanales (la más reciente a la derecha); semanas sin medición, una raya. */
export function BarrasSemanas({ barras, bandas = DEFAULT_BANDS, color, alto, ancho, etiqueta }: { barras: ResumenTendencia['barras']; bandas?: HealthBandsJson; color: 'marca' | 'banda'; alto: number; ancho: number; etiqueta: string }) {
  return (
    <div className="flex items-end gap-1" style={{ height: alto }} role="img" aria-label={etiqueta}>
      {Array.from({ length: 12 }, (_, i) => {
        const b = barras[barras.length - 12 + i];
        return b ? (
          <span key={b.semana} className={cn('rounded-sm', COLOR_BARRA[color][bandaDeValor(b.valor, bandas)])} style={{ width: ancho, height: `${Math.max(6, b.valor)}%` }} />
        ) : (
          <span key={`vacia-${i}`} className="h-1 rounded-sm bg-line" style={{ width: ancho }} />
        );
      })}
    </div>
  );
}

export function TarjetaTendencia({ tendencia, error }: { tendencia: ResumenTendencia | null; error: boolean }) {
  const t = useTranslations('crm.redSalud.tendencia');
  const idioma = useLocale();
  let texto: string;
  if (error) texto = t('noDisponible');
  else if (!tendencia) texto = t('sinDatos');
  else if (tendencia.delta === null || !tendencia.desde) texto = t('solo', { actual: tendencia.actual });
  else {
    const mes = mesDeSemana(tendencia.desde, idioma);
    texto = tendencia.delta < 0 ? t('bajo', { actual: tendencia.actual, n: -tendencia.delta, mes }) : tendencia.delta > 0 ? t('subio', { actual: tendencia.actual, n: tendencia.delta, mes }) : t('estable', { actual: tendencia.actual, mes });
  }
  const banda = !error && tendencia ? bandaDeValor(tendencia.actual, DEFAULT_BANDS) : null;
  return (
    <figure className="flex flex-col gap-1.5 rounded-xl border border-line bg-surface p-4">
      <figcaption className="text-xs font-medium text-fg-secondary">{t('titulo')}</figcaption>
      <BarrasSemanas barras={!error && tendencia ? tendencia.barras : []} color="marca" alto={48} ancho={14} etiqueta={`${t('titulo')}: ${texto}`} />
      <p className={cn('text-xs font-medium', banda ? BAND_STYLES[banda].text : 'text-fg-secondary')}>{texto}</p>
    </figure>
  );
}

export function SaludResumen({ resumen, tendencia, errorTendencia, cargando, formatear }: SaludResumenProps) {
  const t = useTranslations('crm.redSalud');
  const idioma = useLocale();
  const n = (x: number) => new Intl.NumberFormat(idioma).format(x);
  if (cargando) {
    return (
      <div className="hidden gap-4 lg:grid lg:grid-cols-4" aria-busy="true" aria-label={t('kpi.grupo')}>
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[72px] rounded-xl" />)}
      </div>
    );
  }
  const pct = (x: number) => (resumen.total > 0 ? Math.round((x * 100) / resumen.total) : 0);
  return (
    <div className="hidden gap-4 lg:grid lg:grid-cols-4" role="group" aria-label={t('kpi.grupo')}>
      <StatCard etiqueta={t('kpi.green')} valor={n(resumen.conteo.green)} detalle={t('kpi.activos', { pct: pct(resumen.conteo.green) })} tono="exito" tendencia="sube" />
      <StatCard etiqueta={t('kpi.yellow')} valor={n(resumen.conteo.yellow)} detalle={t('kpi.porcentaje', { pct: pct(resumen.conteo.yellow) })} tono="advertencia" iconoDetalle={TriangleAlert} />
      <StatCard etiqueta={t('kpi.red')} valor={n(resumen.conteo.red)} detalle={t('kpi.ingresos', { importe: formatear(resumen.ingresos.red) })} tono="peligro" tendencia="baja" />
      <TarjetaTendencia tendencia={tendencia} error={errorTendencia} />
    </div>
  );
}
