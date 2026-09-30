'use client';

import { useTranslations } from 'next-intl';
import { DollarSign } from 'lucide-react';
import { StatCard } from '@/components/kit/StatCard';
import { KpiMoneda } from '@/components/crm/kit/KpiMoneda';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { resumenEnBase, tasaCierre, type ResumenApi } from './oportunidadLogica';

/**
 * Los 4 KPI de Pipeline y Oportunidades (Figma 768:454963 y 773:23160):
 * valor abierto y ponderado (solo abiertas) en la moneda BASE con la tasa del
 * día —lo que no tiene tasa queda fuera con aviso, nunca se inventa—,
 * abiertas (y cuántas cierran este mes) y tasa de cierre a 90 días.
 */
export interface KpisOportunidadesProps {
  resumen: ResumenApi | null;
  hoy: string;
  cargando?: boolean;
  error?: string | null;
  onReintentar?: () => void;
}

export function KpisOportunidades({ resumen, hoy, cargando, error, onReintentar }: KpisOportunidadesProps) {
  const t = useTranslations('crm.oportunidad.kpis');
  const moneda = useMonedaOrganizacion();
  const base = resumen?.base ?? moneda.code;
  const tasas = resumen?.tasas ?? [];
  const abierto = resumenEnBase(resumen?.abiertas ?? [], base, tasas, hoy);
  const ponderado = resumenEnBase(resumen?.abiertas ?? [], base, tasas, hoy, 'ponderado');
  const abiertas = resumen?.conteos.open ?? 0;
  const tasa = tasaCierre(resumen);
  const sinDatos = cargando && !resumen;
  return (
    <section aria-label={t('aria')} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_220px_220px]">
      <KpiMoneda etiqueta={t('valorAbierto')} resumen={abierto} monedaBase={moneda} detalle={t('detalleAbiertas', { n: abiertas })} fechaContable={hoy} cargando={sinDatos} error={error} onReintentar={onReintentar} />
      <KpiMoneda etiqueta={t('ponderado')} resumen={ponderado} monedaBase={moneda} detalle={t('detalleAbiertas', { n: abiertas })} fechaContable={hoy} cargando={sinDatos} error={error} onReintentar={onReintentar} />
      <StatCard etiqueta={t('abiertas')} valor={abiertas} detalle={resumen?.cierran_periodo !== null && resumen ? t('cierranMes', { n: resumen.cierran_periodo ?? 0 }) : undefined} icono={DollarSign} cargando={sinDatos} />
      <StatCard
        etiqueta={t('tasaCierre')}
        valor={tasa === null ? '—' : `${tasa} %`}
        detalle={resumen ? t('ganadasPerdidas', { ganadas: resumen.ganadas_90, perdidas: resumen.perdidas_90 }) : undefined}
        icono={DollarSign}
        cargando={sinDatos}
      />
      {resumen?.truncado && <p className="text-xs text-warning-text sm:col-span-2 xl:col-span-4">{t('truncado')}</p>}
    </section>
  );
}
