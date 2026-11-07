'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowLeftRight } from 'lucide-react';
import { DataTable, KpiStrip, ListCard, StatCard, StatusBadge, type ColumnaTabla } from '@/components/kit';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { crearFormateadorMoneda } from '@/lib/utils/moneda';
import { importesDispersion, kpisDispersiones, type Dispersion, type ResumenDispersiones } from './cobrosLogica';
import { DetalleDispersionHoja } from './DetalleDispersionHoja';

interface Props {
  resumen: ResumenDispersiones | null;
  dispersiones: readonly Dispersion[];
  filtradas: readonly Dispersion[];
  cargando: boolean;
  error: string | null;
  onReintentar: () => void;
  hayFiltros: boolean;
  busqueda: string;
  onLimpiarFiltros: () => void;
  onRevisarCuenta: () => void;
  etiquetaEstado: (estado: string) => string;
  etiquetaMedio: (medio: string) => string;
}

/** Pestaña «Dispersiones»: KPIs, tabla y panel de detalle (A7, A8). */
export function DispersionesPestana({
  resumen,
  dispersiones,
  filtradas,
  cargando,
  error,
  onReintentar,
  hayFiltros,
  busqueda,
  onLimpiarFiltros,
  onRevisarCuenta,
  etiquetaEstado,
  etiquetaMedio,
}: Props) {
  const t = useTranslations('finanzasCobrosR2');
  const { formatDate } = useFormatDate();
  const monedaOrg = useMonedaOrganizacion();
  const [abierta, setAbierta] = useState<Dispersion | null>(null);

  // PayFac liquida en la moneda de cada dispersión; los totales, en la de la
  // primera (todas iguales) o, sin dispersiones, en la de la organización.
  const formatearTotales = useMemo(
    () => crearFormateadorMoneda(dispersiones[0]?.currency ?? monedaOrg.code),
    [dispersiones, monedaOrg.code],
  );
  const kpis = kpisDispersiones(resumen, dispersiones);
  const periodo = (d: Dispersion) => `${formatDate(d.period_start)} – ${formatDate(d.period_end)}`;

  const columnas: ColumnaTabla<Dispersion>[] = [
    { id: 'referencia', encabezado: t('dispersiones.columnas.referencia'), celda: (d) => <span className="font-medium text-fg">{d.payout_reference}</span>, variante: 'mono' },
    { id: 'periodo', encabezado: t('dispersiones.columnas.periodo'), celda: periodo, ocultarDebajo: 'md' },
    { id: 'recaudado', encabezado: t('dispersiones.columnas.recaudado'), celda: (d) => crearFormateadorMoneda(d.currency)(importesDispersion(d).bruto), variante: 'importe' },
    { id: 'comision', encabezado: t('dispersiones.columnas.comision'), celda: (d) => crearFormateadorMoneda(d.currency)(importesDispersion(d).comision), variante: 'importe', ocultarDebajo: 'lg' },
    { id: 'neto', encabezado: t('dispersiones.columnas.neto'), celda: (d) => crearFormateadorMoneda(d.currency)(importesDispersion(d).neto), variante: 'importe' },
    { id: 'medio', encabezado: t('dispersiones.columnas.medio'), celda: (d) => etiquetaMedio(d.payout_method), ocultarDebajo: 'lg' },
    { id: 'estado', encabezado: t('dispersiones.columnas.estado'), celda: (d) => <StatusBadge estado={d.status} etiqueta={etiquetaEstado(d.status)} tamano="sm" /> },
    { id: 'fecha', encabezado: t('dispersiones.columnas.fecha'), celda: (d) => formatDate(d.processed_at ?? d.scheduled_at ?? d.created_at), ocultarDebajo: 'md' },
  ];

  return (
    <div className="flex flex-col gap-4">
      <KpiStrip columnas={4} etiqueta={t('dispersiones.kpis.etiqueta')}>
        <StatCard
          tamano="sm"
          cargando={cargando}
          etiqueta={t('dispersiones.kpis.recaudado')}
          valor={formatearTotales(kpis.recaudado)}
          detalle={t('dispersiones.kpis.recaudadoDetalle')}
        />
        <StatCard
          tamano="sm"
          cargando={cargando}
          etiqueta={t('dispersiones.kpis.comision')}
          valor={formatearTotales(kpis.comision)}
          detalle={kpis.porcentajeComision === null ? undefined : t('dispersiones.kpis.comisionDetalle', { pct: kpis.porcentajeComision })}
        />
        <StatCard tamano="sm" cargando={cargando} etiqueta={t('dispersiones.kpis.dispersado')} valor={formatearTotales(kpis.dispersado)} />
        <StatCard
          tamano="sm"
          cargando={cargando}
          etiqueta={t('dispersiones.kpis.pendiente')}
          valor={formatearTotales(kpis.pendiente)}
          tono={kpis.pendiente > 0 ? 'advertencia' : 'neutro'}
          detalle={kpis.proxima ? t('dispersiones.kpis.proxima', { fecha: formatDate(kpis.proxima) }) : undefined}
        />
      </KpiStrip>

      <DataTable
        etiqueta={t('dispersiones.tabla')}
        columnas={columnas}
        filas={filtradas}
        obtenerId={(d) => d.id}
        estado={error ? 'error' : cargando ? 'cargando' : filtradas.length === 0 ? (hayFiltros ? 'sinResultados' : 'vacio') : 'listo'}
        onFilaClick={setAbierta}
        etiquetaFila={(d) => d.payout_reference}
        tonoFila={(d) => (d.status === 'failed' ? 'peligro' : undefined)}
        vacio={{ titulo: t('dispersiones.vacio.titulo'), descripcion: t('dispersiones.vacio.descripcion'), icono: ArrowLeftRight }}
        error={{ titulo: t('dispersiones.error.titulo'), descripcion: error ?? undefined }}
        onReintentar={onReintentar}
        onLimpiarFiltros={onLimpiarFiltros}
        termino={busqueda.trim() || undefined}
        tarjetaMovil={(d) => (
          <ListCard
            icono={ArrowLeftRight}
            titulo={d.payout_reference}
            subtitulo={`${periodo(d)} · ${etiquetaMedio(d.payout_method)}`}
            valor={crearFormateadorMoneda(d.currency)(importesDispersion(d).neto)}
            estado={<StatusBadge estado={d.status} etiqueta={etiquetaEstado(d.status)} tamano="sm" />}
            onClick={() => setAbierta(d)}
          />
        )}
      />

      <DetalleDispersionHoja
        dispersion={abierta}
        onCerrar={() => setAbierta(null)}
        onRevisarCuenta={() => {
          setAbierta(null);
          onRevisarCuenta();
        }}
        etiquetaEstado={etiquetaEstado}
        etiquetaMedio={etiquetaMedio}
      />
    </div>
  );
}
