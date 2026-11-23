'use client';

/**
 * Panel desplegado de «Logística» en «Módulos» del inicio (Figma `03` ›
 * Inicio, 2917:45049; sin datos 2922:48373, al día 2922:48859; móvil
 * 2921:48541). Aprobado por el dueño el 2026-11-23.
 *
 * Cuatro cifras (por despachar, atrasados, contraentrega de hoy, sin
 * domiciliario), «Requiere atención» con la acción que resuelve cada cosa,
 * envíos abiertos por estado y las entregas al primer intento (30 días). Todo
 * llega armado del servidor (`logisticaInicio.ts`).
 */
import { useLocale, useTranslations } from 'next-intl';
import type { LogisticaInicio } from '@/lib/dashboard/logisticaInicio';
import { AtencionLista, BarraDesglose, KpisWidget, SinDatosWidget } from './PiezasWidget';

const pct = (v: number, locale: string) => new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }).format(v);

export function PanelLogisticaInicio({ datos }: { datos: LogisticaInicio }) {
  const t = useTranslations('inicioWidgets');
  const locale = useLocale();

  if (datos.estado === 'sinDatos') {
    return <SinDatosWidget titulo={t('logistica.vacio.titulo')} descripcion={t('logistica.vacio.descripcion')} acciones={datos.acciones} />;
  }

  return (
    <div className="flex flex-col gap-4" data-widget-inicio="logistica">
      <KpisWidget kpis={datos.kpis} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <AtencionLista id="inicio-logistica-atencion" items={datos.atencion} vacio={t('logistica.alDia')} parcial={datos.parcial} />
        {datos.abiertos && (
          <div className="flex min-w-0 flex-col gap-3">
            <BarraDesglose desglose={datos.abiertos} />
          </div>
        )}
      </div>
      {datos.primerIntento && (
        <p className="text-xs leading-4 text-fg-secondary" data-primer-intento>
          {t('logistica.primerIntento', { tasa: pct(datos.primerIntento.tasa, locale), meta: pct(datos.primerIntento.meta, locale) })}
        </p>
      )}
    </div>
  );
}
