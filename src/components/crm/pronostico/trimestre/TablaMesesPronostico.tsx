'use client';

/**
 * Vista «Por mes» del trimestre (control «Por vendedor | Por mes» del Figma
 * CRM 1431:19): ganado, compromiso, mejor caso y ponderado de cada mes, con las
 * reglas de `calcularPorMes`. Los ajustes con motivo son del trimestre y no se
 * reparten por mes: se dice debajo.
 */

import { useLocale, useTranslations } from 'next-intl';
import { DataTable, type ColumnaTabla, type EstadoTabla } from '@/components/kit/DataTable';
import { formatMoneda, type ContextoMoneda } from '@/lib/utils/moneda';
import type { MesPronostico } from '@/lib/services/crm/forecastLogica';
import { etiquetaMes } from './trimestreLogica';

export function TablaMesesPronostico({ meses, moneda, hayAjustes, estado }: { meses: MesPronostico[]; moneda: ContextoMoneda; hayAjustes: boolean; estado?: EstadoTabla }) {
  const t = useTranslations('crm.pronosticoTrimestre.meses');
  const idioma = useLocale();
  const m = (n: number) => formatMoneda(n, moneda);
  const importe = (n: number, fuerte = false) => <span className={fuerte ? 'text-sm font-semibold text-fg tabular-nums' : 'text-[13px] text-fg-secondary tabular-nums'}>{m(n)}</span>;

  const columnas: ColumnaTabla<MesPronostico>[] = [
    { id: 'mes', encabezado: t('columnas.mes'), celda: (f) => <span className="text-sm font-medium capitalize text-fg">{etiquetaMes(f.mes, idioma)}</span> },
    { id: 'ganado', encabezado: t('columnas.ganado'), celda: (f) => importe(f.won.total) },
    { id: 'compromiso', encabezado: t('columnas.compromiso'), celda: (f) => importe(f.commit.total, true) },
    { id: 'mejor', encabezado: t('columnas.mejorCaso'), celda: (f) => importe(f.bestCase.total), ocultarDebajo: 'md' },
    { id: 'ponderado', encabezado: t('columnas.ponderado'), celda: (f) => importe(f.weighted.total), ocultarDebajo: 'lg' },
    { id: 'abiertas', encabezado: t('columnas.abiertas'), celda: (f) => <span className="text-[13px] text-fg-secondary tabular-nums">{f.oportunidades}</span>, ocultarDebajo: 'lg' },
  ];

  return (
    <div className="space-y-2">
      <DataTable
        columnas={columnas}
        filas={meses}
        obtenerId={(f) => f.mes}
        etiqueta={t('titulo')}
        estado={estado}
        tarjetaMovil={(f) => (
          <div className="space-y-1 p-4">
            <p className="text-sm font-medium capitalize text-fg">{etiquetaMes(f.mes, idioma)}</p>
            <p className="text-xs text-fg-secondary">{t('movil', { ganado: m(f.won.total), compromiso: m(f.commit.total) })}</p>
          </div>
        )}
      />
      {hayAjustes && <p className="text-xs text-fg-secondary">{t('ajustesNoSeReparten')}</p>}
    </div>
  );
}
