'use client';

/**
 * Transporte › Viajes (Figma «23 Transporte» › 6, 2876:3844). El módulo abre aquí, en la
 * pestaña Despachos de hoy (decisiones 1 y 2: sin «Inicio del día»; Despachos de hoy es una
 * pestaña de Viajes, sin ítem propio en el submenú). Arriba, las StatCards del día (viajes de
 * hoy, despachados, por despachar y bloqueados); debajo, las pestañas:
 *
 * - Todos los viajes: la lista de siempre (`VistaTodosLosViajes`), con sus filtros y diálogos.
 * - Despachos de hoy: `DespachosHoy`.
 * - Novedades: la lista de incidentes de siempre (`VistaNovedades`); /app/transporte/incidentes
 *   redirige aquí con 308.
 */
import { useTranslations } from 'next-intl';
import { AlertTriangle, RefreshCw, Route } from 'lucide-react';
import { BranchBadgeActiva, KpiStrip, PageHeader, StatCard, clasesBoton } from '@/components/kit';
import { useFormatoEntero } from '@/components/kit/useIdiomaKit';
import { AtajoConfigurar } from '@/components/configuracion/AtajoConfigurar';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { PestanasTransporte, usePestana } from '../PestanasTransporte';
import { DespachosHoy } from '../despachos/DespachosHoy';
import { useDespachosHoy } from '../despachos/useDespachosHoy';
import VistaTodosLosViajes from './VistaTodosLosViajes';
import VistaNovedades from '../incidentes/VistaNovedades';

const PESTANAS = ['todos', 'despachos', 'novedades'] as const;

export function ViajesPage() {
  const t = useTranslations('transporte.viajes');
  const tp = useTranslations('transporte.pestanas');
  const entero = useFormatoEntero();
  const { formatPlain } = useFormatDate();
  const [pestana, setPestana] = usePestana(PESTANAS, 'despachos');
  const d = useDespachosHoy();
  const k = d.kpis;
  const cargandoKpis = d.cargando && d.filas.length === 0;

  return (
    <div className="flex flex-col gap-4 p-4 pb-28 sm:p-6 sm:pb-28 lg:gap-5">
      <PageHeader
        titulo={t('titulo')}
        icono={Route}
        subtitulo={t('subtitulo', { fecha: formatPlain(d.fecha), n: k.total })}
        migas={[{ etiqueta: t('migas.transporte'), href: '/app/transporte/viajes' }, { etiqueta: t('titulo') }]}
        debajo={<BranchBadgeActiva tamano="sm" />}
        acciones={
          <>
            <button type="button" className={clasesBoton({ variante: 'secundario', className: 'w-10 px-0' })} onClick={d.recargar} aria-label={t('actualizar')} title={t('actualizar')}>
              <RefreshCw aria-hidden="true" className="size-4" strokeWidth={1.5} />
            </button>
            <AtajoConfigurar seccion="transporte.general" ancla="excepciones" />
          </>
        }
        movil={{ accion: <AtajoConfigurar seccion="transporte.general" ancla="excepciones" soloIcono /> }}
      />

      <KpiStrip etiqueta={t('kpis.etiqueta')}>
        <StatCard
          etiqueta={t('kpis.hoy')}
          cargando={cargandoKpis}
          valor={entero(k.total)}
          detalle={t('kpis.hoyDetalle', { despachados: k.despachados, pendientes: k.porDespachar })}
          onClick={() => setPestana('todos')}
        />
        <StatCard etiqueta={t('kpis.despachados')} cargando={cargandoKpis} valor={entero(k.despachados)} detalle={t('kpis.despachadosDetalle')} />
        <StatCard
          etiqueta={t('kpis.porDespachar')}
          cargando={cargandoKpis}
          valor={entero(k.porDespachar)}
          detalle={t('kpis.porDespacharDetalle', { listos: k.listos, bloqueados: k.bloqueados })}
          onClick={k.porDespachar > 0 ? () => setPestana('despachos') : undefined}
        />
        <StatCard
          etiqueta={t('kpis.bloqueados')}
          cargando={cargandoKpis}
          valor={entero(k.bloqueados)}
          tono={k.bloqueados > 0 ? 'peligro' : 'neutro'}
          iconoDetalle={k.bloqueados > 0 ? AlertTriangle : undefined}
          detalle={k.bloqueados > 0 ? t('kpis.bloqueadosDetalle') : k.porVencer > 0 ? t('kpis.porVencer', { n: k.porVencer }) : t('kpis.bloqueadosVacio')}
          onClick={k.bloqueados > 0 ? () => setPestana('despachos') : undefined}
        />
      </KpiStrip>

      <PestanasTransporte
        id="transporte-viajes"
        etiqueta={tp('viajesAria')}
        sinMargen
        pestanas={[
          { valor: 'todos', etiqueta: tp('todos') },
          { valor: 'despachos', etiqueta: tp('despachos'), contador: k.porDespachar },
          { valor: 'novedades', etiqueta: tp('novedades') },
        ]}
        valor={pestana}
        onValorChange={setPestana}
      >
        {/* Las vistas de siempre traen su propio margen: se compensa para no duplicarlo. */}
        {pestana === 'todos' && (
          <div className="-mx-4 sm:-mx-6">
            <VistaTodosLosViajes incrustado />
          </div>
        )}
        {pestana === 'despachos' && (
          <div className="pt-4">
            <DespachosHoy organizationId={d.organizationId} filas={d.filas} cargando={d.cargando} error={d.error} recargar={d.recargar} />
          </div>
        )}
        {pestana === 'novedades' && (
          <div className="-mx-4 sm:-mx-6">
            <VistaNovedades />
          </div>
        )}
      </PestanasTransporte>
    </div>
  );
}
