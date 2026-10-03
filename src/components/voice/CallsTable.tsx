"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  Download,
  Package,
  Phone,
  RefreshCw,
} from "lucide-react";
import { DataTable, type ColumnaTabla, type EstadoTabla } from "@/components/kit/DataTable";
import { PageHeader } from "@/components/kit/PageHeader";
import { RowActionsMenu } from "@/components/kit/RowActionsMenu";
import { KpiStrip } from "@/components/kit/KpiStrip";
import { StatCard } from "@/components/kit/StatCard";
import { EmptyState } from "@/components/kit/EmptyState";
import { Pagination } from "@/components/kit/Pagination";
import { clasesBoton } from "@/components/kit/botonClases";
import { useOrganization } from "@/lib/hooks/useOrganization";
import { useFormatDate } from "@/lib/context/OrganizationTimezoneContext";
import { addPlainDays } from "@/lib/utils/dateCore";
import { STATUS_LABELS } from "./CallRow";
import type { CallListRow } from "@/lib/services/crm/callManagementService";
import { ClienteLlamada, TipoLlamada, ResultadoLlamada, SentimientoLlamada, GrabacionLlamada, TarjetaLlamada, datosContactoLlamada } from "./CallsListCells";
import { CallDeepLinkDialog } from "./CallDeepLinkDialog";
import { CallsFilters } from "./CallsFilters";
import { useCallsData, leerLlamadas, type CallsResponse } from "./useCallsData";
import {
  EMPTY_FILTERS,
  parametrosLlamadas,
  csvLlamadas,
  formatDuration,
  type CallsTableFilters,
} from "./callsListadoLogica";
import { abrirMarcador } from "./softphoneUi";
import { useFormatoEntero } from '@/components/kit/useIdiomaKit';
export { STATUS_LABELS };
export type { CallsTableFilters } from "./callsListadoLogica";

interface CallsTableProps {
  initialFilters?: Partial<CallsTableFilters>;
  limit?: number;
  openCallId?: string | null;
  refreshKey?: number;
  cabecera?: { titulo: string; subtitulo: string; accion: ReactNode; accionMovil: ReactNode };
  onAbrirLlamada?: (id: string) => void;
}

/** Una consulta aplica el mismo ámbito a filas, indicadores y paginación. */
function CallsTableContenido({
  initialFilters,
  limit = 25,
  openCallId,
  refreshKey = 0,
  cabecera,
  onAbrirLlamada,
}: CallsTableProps) {
  const t = useTranslations("crm.llamadas");
  const formatNumber = useFormatoEntero();
  const { getToday, formatDateTime } = useFormatDate(null);
  const [defaultRange] = useState(() => ({ fromDate: addPlainDays(getToday(), -29), toDate: getToday() }));
  const [filters, setFilters] = useState<CallsTableFilters>(() => ({
    ...EMPTY_FILTERS,
    ...defaultRange,
    ...initialFilters,
  }));
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(limit);
  const [revision, setRevision] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(openCallId ?? null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(false);
  const exportAbort = useRef<AbortController | null>(null);
  useEffect(() => () => exportAbort.current?.abort(), []);
  const { result, loading, error, forbidden } = useCallsData(
    parametrosLlamadas(filters, page, size).toString(),
    revision + refreshKey,
  );
  const stats = result?.stats;
  const count = result?.count ?? 0;
  const filtered = Object.entries(filters).some(([key, value]) =>
    key !== 'fromDate' && key !== 'toDate' && !!(typeof value === 'string' ? value.trim() : value),
  ) || !!(filters.fromDate || filters.toDate) && (filters.fromDate !== defaultRange.fromDate || filters.toDate !== defaultRange.toDate);
  useEffect(() => {
    if (openCallId) setExpanded(openCallId);
  }, [openCallId]);
  useEffect(() => {
    if (result && page > Math.max(1, Math.ceil(count / size)))
      setPage(Math.max(1, Math.ceil(count / size)));
  }, [result, count, size, page]);
  const changeFilters = (value: CallsTableFilters) => {
    setFilters(value);
    setPage(1);
    setExpanded(null);
  };
  const refresh = () => setRevision((n) => n + 1);
  const exportCalls = async () => {
    if (exportAbort.current) return;
    const abort = new AbortController();
    exportAbort.current = abort;
    setExporting(true);
    setExportError(false);
    try {
      const rows: CallsResponse["data"] = [];
      for (let n = 1; ; n++) {
        const response = await leerLlamadas(
          parametrosLlamadas(filters, n, 200).toString(),
          abort.signal,
        );
        if (abort.signal.aborted) return;
        rows.push(...response.data);
        if (rows.length >= response.count || response.data.length === 0) break;
      }
      if (abort.signal.aborted) return;
      const csv = csvLlamadas(
        rows,
        [
          "fecha",
          "cliente",
          "numero",
          "modo",
          "usuario",
          "duracion_segundos",
          "resultado",
          "estado",
          "sentimiento",
        ],
        formatDateTime,
      );
      const url = URL.createObjectURL(
        new Blob([csv], { type: "text/csv;charset=utf-8" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `calls-${getToday()}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      if (!abort.signal.aborted) setExportError(true);
    } finally {
      if (!abort.signal.aborted) setExporting(false);
      if (exportAbort.current === abort) exportAbort.current = null;
    }
  };
  const abrir = (call: CallListRow) => onAbrirLlamada ? onAbrirLlamada(call.id) : setExpanded(call.id);
  const columnas: ColumnaTabla<CallListRow>[] = [
    { id: "fecha", encabezado: t("columnas.fecha"), ancho: "11%", celda: (call) => formatDateTime(call.started_at ?? call.created_at), className: "text-[13px] leading-[18px] text-fg-secondary" },
    { id: "cliente", encabezado: t("columnas.cliente"), ancho: "21%", celda: (call) => <ClienteLlamada call={call} /> },
    { id: "tipo", encabezado: t("columnas.tipo"), ancho: "14%", celda: (call) => <TipoLlamada call={call} /> },
    { id: "usuario", encabezado: t("columnas.usuario"), ancho: "14%", celda: (call) => [call.user?.first_name, call.user?.last_name].filter(Boolean).join(" ") || call.user?.email || "—", className: "text-[13px] leading-[18px]" },
    { id: "duracion", encabezado: t("columnas.duracion"), ancho: "7%", celda: (call) => formatDuration(call.duration_seconds), className: "tabular-nums text-[13px] leading-[18px]" },
    { id: "resultado", encabezado: t("columnas.resultado"), ancho: "14%", celda: (call) => <ResultadoLlamada call={call} /> },
    { id: "sentimiento", encabezado: t("columnas.sentimiento"), ancho: "10%", celda: (call) => <SentimientoLlamada call={call} /> },
    { id: "grabacion", encabezado: t("columnas.grabacion"), ancho: "9%", celda: (call) => <GrabacionLlamada call={call} /> },
  ];
  const estado: EstadoTabla = error ? forbidden ? "sinPermiso" : "error" : loading ? "cargando" : count ? "listo" : filtered ? "sinResultados" : "vacio";
  const exportButton = <button type="button" className={clasesBoton({ variante: "secundario", patron: "button" })} disabled={loading || error || !count || exporting} onClick={() => void exportCalls()}><Download className="size-4" aria-hidden="true" strokeWidth={1.5} />{t(exporting ? "exportando" : "exportar")}</button>;
  const menu = <RowActionsMenu orientacion="horizontal" tamano="md" titulo={t("titulo")} acciones={[
    { id: "refresh", etiqueta: t("actualizar"), icono: RefreshCw, onSelect: refresh, deshabilitada: loading },
    { id: "export", etiqueta: t(exporting ? "exportando" : "exportar"), icono: Download, onSelect: () => void exportCalls(), deshabilitada: loading || error || !count || exporting, oculta: false },
  ]} />;
  return (
    <div className="flex min-w-0 flex-col gap-4">
      {cabecera && <PageHeader titulo={cabecera.titulo} subtitulo={cabecera.subtitulo} icono={Phone} migas={[{ etiqueta: "CRM", href: "/app/crm" }, { etiqueta: cabecera.titulo }]} acciones={<>{exportButton}{cabecera.accion}<RowActionsMenu orientacion="horizontal" tamano="md" titulo={cabecera.titulo} acciones={[{ id: "refresh", etiqueta: t("actualizar"), icono: RefreshCw, onSelect: refresh, deshabilitada: loading }]} /></>} movil={{ accion: <>{cabecera.accionMovil}{menu}</> }} />}
      {!error && (loading || count > 0 || filtered) && <KpiStrip etiqueta={t("resumen")}>
        <StatCard
          etiqueta={t("total")}
          valor={stats ? formatNumber(stats.totalToday) : "—"}
          cargando={loading}
          varianteCarga="compacta"
          detalle={t("periodo")}
        />
        <StatCard
          etiqueta={t("contacto")}
          valor={
            stats
              ? `${formatNumber(stats.totalToday ? Math.round((100 * stats.answered) / stats.totalToday) : 0)} %`
              : "—"
          }
          cargando={loading}
          varianteCarga="compacta"
          detalle={t("humano")}
        />
        <StatCard
          etiqueta={t("promedio")}
          valor={stats ? formatDuration(stats.avgDuration) : "—"}
          cargando={loading}
          varianteCarga="compacta"
          detalle={t("contestadas")}
        />
        <StatCard
          etiqueta={t("voz")}
          valor={stats ? formatNumber(Math.ceil(stats.voiceSeconds / 60)) : "—"}
          cargando={loading}
          varianteCarga="compacta"
          detalle={
            !stats?.voiceConfigured
              ? t("sinPlan")
              : stats.remainingVoiceMinutes === null
                ? t("ilimitado")
                : t("saldo", { n: stats.remainingVoiceMinutes })
          }
        />
      </KpiStrip>}
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <CallsFilters filters={filters} onChange={changeFilters} />
        </div>
        {!cabecera && <button
          className={clasesBoton({ variante: "secundario" })}
          disabled={loading}
          onClick={refresh}
          aria-label={t("actualizar")}
        >
          <RefreshCw className="size-4" aria-hidden="true" />
        </button>}
        {!cabecera && exportButton}
      </div>
      {exportError && (
        <p role="alert" className="text-sm text-danger-text">
          {t("errorExportar")}
        </p>
      )}
      {estado !== 'listo' && estado !== 'cargando' ? <div className="overflow-hidden rounded-xl border border-line bg-surface">
        <EmptyState variante={estado === 'vacio' ? 'empty' : estado === 'sinResultados' ? 'search' : estado === 'sinPermiso' ? 'forbidden' : 'error'}
          titulo={t(estado === 'vacio' ? 'vacio' : estado === 'sinResultados' ? 'sinResultados' : estado === 'sinPermiso' ? 'sinPermiso' : 'error')}
          descripcion={estado === 'vacio' || estado === 'sinResultados' ? t('vacioDetalle') : undefined}
          icono={estado === 'vacio' ? Package : undefined}
          accion={estado === 'vacio' ? { etiqueta: t('llamar'), onClick: abrirMarcador, icono: Phone } : undefined}
          accionSecundaria={estado === 'vacio' ? { etiqueta: t('configurarTelefonia'), href: '/app/configuracion?modulo=crm&tab=proveedores' } : undefined}
          accionPrimaria={estado === 'error' ? true : undefined}
          onReintentar={refresh} onLimpiarFiltros={() => changeFilters(EMPTY_FILTERS)}
          className={estado === 'vacio' ? 'min-h-[300px] lg:min-h-[394px]' : 'min-h-[300px] lg:min-h-[374px]'} />
      </div> : <DataTable columnas={columnas} filas={result?.data ?? []} obtenerId={(call) => call.id} etiqueta={t("titulo")} estado={estado} onFilaClick={abrir} pieFuera
        atributosFila={(call) => ({ "data-phone": datosContactoLlamada(call).numero, "data-customer-id": call.customer?.id, "data-opportunity-id": call.opportunity_id ?? undefined, "data-display-name": datosContactoLlamada(call).nombre ?? undefined })}
        tarjetaMovil={(call) => <TarjetaLlamada call={call} onAbrir={() => abrir(call)} />}
        vacio={{ titulo: t("vacio"), descripcion: t("vacioDetalle"), accion: { etiqueta: t("llamar"), onClick: abrirMarcador } }}
        sinResultados={{ titulo: t("sinResultados"), descripcion: t("vacioDetalle") }} error={{ titulo: t("error") }} sinPermiso={{ titulo: t("sinPermiso") }}
        onReintentar={refresh} onLimpiarFiltros={() => changeFilters(EMPTY_FILTERS)} filasEsqueleto={8}
        mostrarCabeceraCargando={false} altoFilaEsqueleto={48} varianteEsqueleto="figma"
        pie={count > 0 ? <Pagination
              pagina={page}
              tamano={size}
              total={count}
              onPaginaChange={setPage}
              onTamanoChange={(v) => {
                setSize(v);
                setPage(1);
              }}
              cargando={loading}
              opcionesTamano={[25, 50, 100]}
              densidad="compacta"
            /> : undefined
        }
      />}
      {expanded && <CallDeepLinkDialog id={expanded} startMs={null} onClose={() => setExpanded(null)} />}
    </div>
  );
}

export function CallsTable(props: CallsTableProps) {
  const { organization } = useOrganization();
  return (
    <CallsTableContenido
      key={organization?.id ?? "sin-organizacion"}
      {...props}
    />
  );
}
