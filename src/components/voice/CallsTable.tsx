'use client';

/**
 * Listado de Llamadas — /app/crm/llamadas (Figma 1351:18 listo, 1358:17
 * cargando, 1358:1082 vacío, 1358:1687 error). Una fila abre su detalle en
 * /app/crm/llamadas/[id] (Figma 1363:20, página propia: `LlamadaDetalle`).
 *
 * Todo del kit: `PageHeader`, `StatCard`, `ListToolbar`, `DataTable` (con sus
 * estados cargando / vacío / sin resultados / error / sin permiso y tarjetas en
 * móvil) y `Pagination`. Una sola petición (`GET /api/crm/calls`
 * → RPC `crm_calls_list`) trae filas, total y cifras con el MISMO ámbito: los
 * filtros, el permiso `crm.calls.view_all` y la sucursal, resueltos en la base.
 * La búsqueda también encuentra palabras dichas en la llamada (transcripción).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AlertTriangle, ArrowUp, Download, Phone, PhoneOutgoing, RefreshCw } from 'lucide-react';
import { PageHeader } from '@/components/kit/PageHeader';
import { KpiStrip } from '@/components/kit/KpiStrip';
import { StatCard } from '@/components/kit/StatCard';
import { DataTable, type ColumnaTabla, type EstadoTabla } from '@/components/kit/DataTable';
import { Pagination } from '@/components/kit/Pagination';
import { RowActionsMenu } from '@/components/kit/RowActionsMenu';
import { clasesBoton } from '@/components/kit/botonClases';
import { useFormatoEntero, useEtiquetaRango } from '@/components/kit/useIdiomaKit';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { addPlainDays } from '@/lib/utils/dateDisplay';
import type { CallListRow } from '@/lib/services/crm/callManagementService';
import { CallsFilters } from './CallsFilters';
import {
  ClienteLlamada,
  FechaLlamada,
  GrabacionLlamada,
  QuienLlamada,
  ResultadoLlamada,
  SentimientoLlamada,
  TarjetaLlamada,
  TipoLlamada,
  datosContactoLlamada,
  nombreContacto,
} from './CallRow';
import { leerLlamadas, useCallsData } from './useCallsData';
import {
  EMPTY_FILTERS,
  csvLlamadas,
  formatDuration,
  formatDurationMedia,
  hayFiltrosLlamadas,
  minutosDeVoz,
  numeroContraparte,
  parametrosLlamadas,
  porcentaje,
  type CallsTableFilters,
} from './callsListadoLogica';
import { abrirMarcador } from './softphoneUi';

export { STATUS_LABELS } from './CallRow';
export type { CallsTableFilters } from './callsListadoLogica';

/** Exportación: páginas de 200 (tope de la RPC) y como mucho 50 (10.000 llamadas). */
const PAGINA_EXPORTAR = 200;
const PAGINAS_EXPORTAR = 50;

interface CallsTableProps {
  initialFilters?: Partial<CallsTableFilters>;
  limit?: number;
  /** Al cambiar, recarga (p. ej. al cerrar el diálogo de disposición). */
  refreshKey?: number;
}

/** Ruta del detalle de una llamada (Figma 1363:20). */
export const rutaDetalleLlamada = (id: string) => `/app/crm/llamadas/${encodeURIComponent(id)}`;

export function CallsTable({ initialFilters, limit = 25, refreshKey = 0 }: CallsTableProps) {
  const t = useTranslations('crm.llamadas');
  const router = useRouter();
  const entero = useFormatoEntero();
  const etiquetaRango = useEtiquetaRango();
  const { getToday, formatDateTime } = useFormatDate();
  const hoy = getToday();
  const [rangoPorDefecto] = useState(() => ({ fromDate: addPlainDays(hoy, -29), toDate: hoy }));
  const [filters, setFilters] = useState<CallsTableFilters>(() => ({ ...EMPTY_FILTERS, ...rangoPorDefecto, ...initialFilters }));
  const [pagina, setPagina] = useState(1);
  const [tamano, setTamano] = useState(limit);
  const [revision, setRevision] = useState(0);
  const [exportando, setExportando] = useState(false);
  const [errorExportar, setErrorExportar] = useState(false);
  const abortExportar = useRef<AbortController | null>(null);
  useEffect(() => () => abortExportar.current?.abort(), []);

  const params = useMemo(() => parametrosLlamadas(filters, pagina, tamano).toString(), [filters, pagina, tamano]);
  const { result, loading, error, forbidden } = useCallsData(params, revision + refreshKey);
  const stats = result?.stats;
  const total = result?.count ?? 0;
  const filtrado = hayFiltrosLlamadas(filters, rangoPorDefecto);

  const cambiarFiltros = (v: CallsTableFilters) => {
    setFilters(v);
    setPagina(1);
  };
  const recargar = () => setRevision((n) => n + 1);

  // Si un filtro deja la página fuera de rango, vuelve a la última.
  useEffect(() => {
    const ultima = Math.max(1, Math.ceil(total / tamano));
    if (result && pagina > ultima) setPagina(ultima);
  }, [result, total, tamano, pagina]);

  const abrir = (c: CallListRow) => router.push(rutaDetalleLlamada(c.id));

  const exportar = async () => {
    if (abortExportar.current) return;
    const ctrl = new AbortController();
    abortExportar.current = ctrl;
    setExportando(true);
    setErrorExportar(false);
    try {
      const filas: CallListRow[] = [];
      for (let n = 1; n <= PAGINAS_EXPORTAR; n++) {
        const r = await leerLlamadas(parametrosLlamadas(filters, n, PAGINA_EXPORTAR).toString(), ctrl.signal);
        if (ctrl.signal.aborted) return;
        filas.push(...r.data);
        if (filas.length >= r.count || r.data.length === 0) break;
      }
      const csv = csvLlamadas(filas, t.raw('csv') as string[], formatDateTime);
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${t('archivoCsv')}-${hoy}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      if (!ctrl.signal.aborted) setErrorExportar(true);
    } finally {
      if (!ctrl.signal.aborted) setExportando(false);
      if (abortExportar.current === ctrl) abortExportar.current = null;
    }
  };

  const columnas: ColumnaTabla<CallListRow>[] = [
    { id: 'fecha', encabezado: t('columnas.fecha'), ancho: '11%', celda: (c) => <FechaLlamada call={c} />, className: 'text-[13px] text-fg-secondary' },
    { id: 'cliente', encabezado: t('columnas.cliente'), ancho: '20%', celda: (c) => <ClienteLlamada call={c} /> },
    { id: 'tipo', encabezado: t('columnas.tipo'), ancho: '14%', celda: (c) => <TipoLlamada call={c} /> },
    { id: 'quien', encabezado: t('columnas.quien'), ancho: '13%', celda: (c) => <QuienLlamada call={c} />, ocultarDebajo: 'xl' },
    { id: 'duracion', encabezado: t('columnas.duracion'), ancho: '7%', celda: (c) => formatDuration(c.duration_seconds), className: 'tabular-nums text-[13px]' },
    { id: 'resultado', encabezado: t('columnas.resultado'), ancho: '14%', celda: (c) => <ResultadoLlamada call={c} /> },
    { id: 'sentimiento', encabezado: t('columnas.sentimiento'), ancho: '10%', celda: (c) => <SentimientoLlamada call={c} /> },
    { id: 'grabacion', encabezado: t('columnas.grabacion'), ancho: '8%', celda: (c) => <GrabacionLlamada call={c} onOir={() => abrir(c)} /> },
  ];

  const estado: EstadoTabla = error ? (forbidden ? 'sinPermiso' : 'error') : loading && !result ? 'cargando' : total > 0 ? 'listo' : filtrado ? 'sinResultados' : 'vacio';
  const sinExportar = loading || error || total === 0 || exportando;

  const botonExportar = (
    <button type="button" className={clasesBoton({ variante: 'secundario' })} disabled={sinExportar} onClick={() => void exportar()}>
      <Download aria-hidden="true" className="size-4" strokeWidth={1.5} />
      {t(exportando ? 'exportando' : 'exportar')}
    </button>
  );
  const botonLlamar = (
    <button type="button" className={clasesBoton()} onClick={abrirMarcador}>
      <Phone aria-hidden="true" className="size-4" strokeWidth={1.5} />
      {t('llamar')}
    </button>
  );
  const menu = (
    <RowActionsMenu
      orientacion="horizontal"
      tamano="md"
      titulo={t('titulo')}
      acciones={[
        { id: 'actualizar', etiqueta: t('actualizar'), icono: RefreshCw, onSelect: recargar, deshabilitada: loading },
        { id: 'exportar', etiqueta: t('exportar'), icono: Download, onSelect: () => void exportar(), deshabilitada: sinExportar },
      ]}
    />
  );

  const restantes = stats?.remainingVoiceMinutes ?? null;
  const usados = stats ? minutosDeVoz(stats.voiceSeconds) : 0;
  const pocosMinutos = restantes !== null && restantes <= Math.max(60, usados * 0.25);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <PageHeader
        titulo={t('titulo')}
        subtitulo={result?.canViewAll === false ? t('subtituloPropias') : t('subtitulo')}
        icono={Phone}
        migas={[{ etiqueta: t('migas.crm'), href: '/app/crm' }, { etiqueta: t('titulo') }]}
        acciones={
          <>
            {botonExportar}
            {botonLlamar}
            {menu}
          </>
        }
        movil={{
          titulo: t('titulo'),
          accion: (
            <>
              <button type="button" aria-label={t('llamar')} onClick={abrirMarcador} className="flex size-10 items-center justify-center rounded-lg text-fg hover:bg-hover">
                <Phone aria-hidden="true" className="size-5" />
              </button>
              {menu}
            </>
          ),
        }}
      />

      {!error && (loading || total > 0 || filtrado) && (
        <KpiStrip etiqueta={t('kpi.aria')} columnas={4}>
          <StatCard etiqueta={t('kpi.llamadas')} valor={stats ? entero(stats.totalToday) : '—'} cargando={!stats && loading} detalle={etiquetaRango({ desde: filters.fromDate, hasta: filters.toDate })} />
          <StatCard
            etiqueta={t('kpi.contacto')}
            valor={stats ? `${entero(porcentaje(stats.answered, stats.totalToday))} %` : '—'}
            cargando={!stats && loading}
            detalle={stats ? t('kpi.contactoDetalle', { n: entero(stats.answered) }) : undefined}
            tono={stats && stats.answered > 0 ? 'exito' : 'neutro'}
            iconoDetalle={stats && stats.answered > 0 ? ArrowUp : undefined}
          />
          <StatCard etiqueta={t('kpi.duracion')} valor={stats ? formatDurationMedia(stats.avgDuration) : '—'} cargando={!stats && loading} detalle={t('kpi.duracionDetalle')} />
          <StatCard
            etiqueta={t('kpi.minutos')}
            valor={stats ? entero(usados) : '—'}
            cargando={!stats && loading}
            detalle={
              !stats ? undefined : !stats.voiceConfigured ? t('kpi.sinTelefonia') : restantes === null ? t('kpi.ilimitado') : t('kpi.quedan', { n: entero(restantes) })
            }
            tono={pocosMinutos ? 'advertencia' : 'neutro'}
            iconoDetalle={pocosMinutos ? AlertTriangle : undefined}
          />
        </KpiStrip>
      )}

      <CallsFilters filters={filters} onChange={cambiarFiltros} hoy={hoy} rangoPorDefecto={rangoPorDefecto} puedeVerTodas={result?.canViewAll !== false} />

      {errorExportar && (
        <p role="alert" className="text-sm text-danger-text">
          {t('errorExportar')}
        </p>
      )}

      <DataTable
        columnas={columnas}
        filas={result?.data ?? []}
        obtenerId={(c) => c.id}
        etiqueta={t('titulo')}
        estado={estado}
        onFilaClick={abrir}
        etiquetaFila={(c) => nombreContacto(c) ?? numeroContraparte(c)}
        atributosFila={datosContactoLlamada}
        tarjetaMovil={(c) => <TarjetaLlamada call={c} onAbrir={() => abrir(c)} />}
        termino={filters.q.trim() || undefined}
        vacio={{
          icono: PhoneOutgoing,
          titulo: t('vacio.titulo'),
          descripcion: t('vacio.descripcion'),
          accion: { etiqueta: t('llamar'), onClick: abrirMarcador, icono: Phone },
          accionSecundaria: { etiqueta: t('vacio.configurar'), href: '/app/configuracion?modulo=crm&tab=proveedores' },
        }}
        sinResultados={{ titulo: t('sinResultados.titulo'), descripcion: t('sinResultados.descripcion') }}
        error={{ titulo: t('error.titulo'), descripcion: t('error.descripcion') }}
        sinPermiso={{ titulo: t('sinPermiso.titulo'), descripcion: t('sinPermiso.descripcion') }}
        onReintentar={recargar}
        onLimpiarFiltros={() => cambiarFiltros({ ...EMPTY_FILTERS, ...rangoPorDefecto })}
        filasEsqueleto={8}
        pie={
          total > 0 ? (
            <Pagination
              pagina={pagina}
              tamano={tamano}
              total={total}
              onPaginaChange={setPagina}
              onTamanoChange={(v) => {
                setTamano(v);
                setPagina(1);
              }}
              opcionesTamano={[25, 50, 100]}
              cargando={loading}
            />
          ) : undefined
        }
      />

    </div>
  );
}
