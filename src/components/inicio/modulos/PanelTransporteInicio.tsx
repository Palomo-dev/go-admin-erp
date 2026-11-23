'use client';

/**
 * Panel desplegado de «Transporte» en «Módulos» del inicio (Figma `03` ›
 * Inicio, 2917:45560; sin datos 2922:48432, al día 2922:49068; móvil
 * 2921:49601). Aprobado por el dueño el 2026-11-23. Sustituye al «Inicio del
 * día» de Transporte (descartado).
 *
 * Cuatro cifras (viajes de hoy, ocupación, vehículos disponibles, documentos
 * por vencer), «Requiere atención» (despachos bloqueados con su causa,
 * documentos vencidos, mantenimiento, retrasos) y los viajes de hoy por
 * estado. Todo llega armado del servidor (`transporteInicio.ts`).
 */
import { useTranslations } from 'next-intl';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import type { TransporteInicio } from '@/lib/dashboard/transporteInicio';
import type { AtencionWidget } from '@/lib/dashboard/widgetsInicio';
import { AtencionLista, BarraDesglose, KpisWidget, SinDatosWidget } from './PiezasWidget';

export function PanelTransporteInicio({ datos }: { datos: TransporteInicio }) {
  const t = useTranslations('inicioWidgets');
  const tCausas = useTranslations('transporte.despachos.causas');
  const { formatTime } = useFormatDate();

  if (datos.estado === 'sinDatos') {
    return <SinDatosWidget titulo={t('transporte.vacio.titulo')} descripcion={t('transporte.vacio.descripcion')} acciones={datos.acciones} />;
  }

  // Hora de salida en la zona de la organización y nombre de la causa en el idioma de la persona.
  const parametros = (a: AtencionWidget) => {
    const p = a.detalle?.params;
    if (!p) return undefined;
    const extra: Record<string, string> = {};
    if (typeof p.salida === 'string') extra.salida = formatTime(p.salida);
    if (typeof p.causa === 'string') extra.causa = tCausas(p.causa);
    return extra;
  };

  return (
    <div className="flex flex-col gap-4" data-widget-inicio="transporte">
      <KpisWidget kpis={datos.kpis} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <AtencionLista id="inicio-transporte-atencion" items={datos.atencion} vacio={t('transporte.alDia')} parametros={parametros} parcial={datos.parcial} />
        {datos.porEstado && (
          <div className="flex min-w-0 flex-col gap-3">
            <BarraDesglose desglose={datos.porEstado} />
          </div>
        )}
      </div>
      <p className="text-xs leading-4 text-fg-secondary">{t('transporte.notaReportes')}</p>
    </div>
  );
}
