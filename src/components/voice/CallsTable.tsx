"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Clock,
  Download,
  Phone,
  RefreshCw,
  UserCheck,
  Mic,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { KpiStrip } from "@/components/kit/KpiStrip";
import { StatCard } from "@/components/kit/StatCard";
import { EmptyState } from "@/components/kit/EmptyState";
import { Pagination } from "@/components/kit/Pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { clasesBoton } from "@/components/kit/botonClases";
import { useOrganization } from "@/lib/hooks/useOrganization";
import { useFormatDate } from "@/lib/context/OrganizationTimezoneContext";
import { addPlainDays } from "@/lib/utils/dateCore";
import { CallRow, STATUS_LABELS } from "./CallRow";
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
export { STATUS_LABELS };
export type { CallsTableFilters } from "./callsListadoLogica";

interface CallsTableProps {
  initialFilters?: Partial<CallsTableFilters>;
  limit?: number;
  openCallId?: string | null;
  refreshKey?: number;
}

/** Una consulta aplica el mismo ámbito a filas, indicadores y paginación. */
function CallsTableContenido({
  initialFilters,
  limit = 25,
  openCallId,
  refreshKey = 0,
}: CallsTableProps) {
  const t = useTranslations("crm.llamadas");
  const { getToday, formatDateTime } = useFormatDate(null);
  const [filters, setFilters] = useState<CallsTableFilters>(() => ({
    ...EMPTY_FILTERS,
    fromDate: addPlainDays(getToday(), -29),
    toDate: getToday(),
    ...initialFilters,
  }));
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(limit);
  const [revision, setRevision] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(openCallId ?? null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(false);
  const { result, loading, error, forbidden } = useCallsData(
    parametrosLlamadas(filters, page, size).toString(),
    revision + refreshKey,
  );
  const stats = result?.stats;
  const count = result?.count ?? 0;
  const filtered = Object.values(filters).some(Boolean);
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
    setExporting(true);
    setExportError(false);
    try {
      const rows: CallsResponse["data"] = [];
      for (let n = 1; ; n++) {
        const response = await leerLlamadas(
          parametrosLlamadas(filters, n, 200).toString(),
        );
        rows.push(...response.data);
        if (rows.length >= response.count || response.data.length === 0) break;
      }
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
      setExportError(true);
    } finally {
      setExporting(false);
    }
  };
  return (
    <div className="space-y-5">
      <KpiStrip etiqueta={t("resumen")}>
        <StatCard
          etiqueta={t("total")}
          valor={stats?.totalToday ?? "—"}
          icono={Phone}
          cargando={loading}
          detalle={t("periodo")}
        />
        <StatCard
          etiqueta={t("contacto")}
          valor={
            stats
              ? `${stats.totalToday ? Math.round((100 * stats.answered) / stats.totalToday) : 0}%`
              : "—"
          }
          icono={UserCheck}
          cargando={loading}
          detalle={t("humano")}
        />
        <StatCard
          etiqueta={t("promedio")}
          valor={stats ? formatDuration(stats.avgDuration) : "—"}
          icono={Clock}
          cargando={loading}
          detalle={t("contestadas")}
        />
        <StatCard
          etiqueta={t("voz")}
          valor={stats ? Math.ceil(stats.voiceSeconds / 60) : "—"}
          icono={Mic}
          cargando={loading}
          detalle={
            !stats?.voiceConfigured
              ? t("sinPlan")
              : stats.remainingVoiceMinutes === null
                ? t("ilimitado")
                : t("saldo", { n: stats.remainingVoiceMinutes })
          }
        />
      </KpiStrip>
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <CallsFilters filters={filters} onChange={changeFilters} />
        </div>
        <button
          className={clasesBoton({ variante: "secundario" })}
          disabled={loading}
          onClick={refresh}
          aria-label={t("actualizar")}
        >
          <RefreshCw className="size-4" aria-hidden="true" />
        </button>
        <button
          className={clasesBoton({ variante: "secundario" })}
          disabled={loading || error || !count || exporting}
          onClick={() => void exportCalls()}
        >
          <Download className="size-4" aria-hidden="true" />
          {t(exporting ? "exportando" : "exportar")}
        </button>
      </div>
      {exportError && (
        <p role="alert" className="text-sm text-danger-text">
          {t("errorExportar")}
        </p>
      )}
      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        {error ? (
          <EmptyState
            variante={forbidden ? "forbidden" : "error"}
            titulo={t(forbidden ? "sinPermiso" : "error")}
            onReintentar={refresh}
          />
        ) : !loading && !count ? (
          <EmptyState
            variante={filtered ? "search" : "empty"}
            titulo={t(filtered ? "sinResultados" : "vacio")}
            descripcion={t("vacioDetalle")}
            onLimpiarFiltros={() => changeFilters(EMPTY_FILTERS)}
            accion={
              !filtered
                ? { etiqueta: t("llamar"), onClick: abrirMarcador }
                : undefined
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">
                      <span className="sr-only">{t("detalle")}</span>
                    </TableHead>
                    {[
                      "fecha",
                      "tipo",
                      "cliente",
                      "usuario",
                      "duracion",
                      "resultado",
                      "estado",
                      "sentimiento",
                      "grabacion",
                    ].map((key) => (
                      <TableHead key={key}>{t(`columnas.${key}`)}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading
                    ? Array.from({ length: 5 }, (_, i) => (
                        <TableRow key={i}>
                          {Array.from({ length: 10 }, (_, j) => (
                            <TableCell key={j}>
                              <Skeleton className="h-4 w-20" />
                            </TableCell>
                          ))}
                        </TableRow>
                      ))
                    : result?.data.map((call) => (
                        <CallRow
                          key={call.id}
                          call={call}
                          isOpen={expanded === call.id}
                          onToggle={() =>
                            setExpanded(expanded === call.id ? null : call.id)
                          }
                        />
                      ))}
                </TableBody>
              </Table>
            </div>
            <Pagination
              pagina={page}
              tamano={size}
              total={count}
              onPaginaChange={setPage}
              onTamanoChange={(v) => {
                setSize(v);
                setPage(1);
              }}
              cargando={loading}
              className="border-t border-line p-4"
            />
          </>
        )}
      </div>
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
