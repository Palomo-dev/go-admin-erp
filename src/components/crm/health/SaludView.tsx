"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, Download, RefreshCw, Settings } from "lucide-react";
import { PageHeader } from "@/components/kit/PageHeader";
import { StatCard } from "@/components/kit/StatCard";
import { ChipsOpcion } from "@/components/kit/ChipsOpcion";
import { PanelAdaptable } from "@/components/kit/PanelAdaptable";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/kit/EmptyState";
import { clasesBoton } from "@/components/kit/botonClases";
import { useMonedaOrganizacion } from "@/lib/hooks/useOrgCurrency";
import { filasACsv } from "@/lib/utils/csv";
import { ORGANIZATION_CHANGED_EVENT } from "@/lib/hooks/useOrganization";
import { healthScoreService } from "@/lib/services/crm/healthScoreService";
import type {
  HealthDashboard,
  HealthListRow,
} from "@/lib/services/crm/healthReadService";
import { claveError } from "@/components/crm/acciones/apiCrm";
import { AccionesRapidasCrm } from "@/components/crm/acciones/AccionesRapidasCrm";
import { HealthDetailDrawer } from "./HealthDetailDrawer";
import { HealthTrend } from "./HealthTrend";
import { HealthRiskTable } from "./HealthRiskTable";
import { FactoresSalud } from "./FactoresSalud";

type Filter = "all" | "red" | "yellow" | "green" | "declined" | "mine";
export function SaludView({ organizationId }: { organizationId: number }) {
  const t = useTranslations("crm.salud");
  const errors = useTranslations("crm.accionesRapidas.errores");
  const { formatear } = useMonedaOrganizacion();
  const [data, setData] = useState<HealthDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [explanation, setExplanation] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sort, setSort] = useState<"revenue" | "score" | "decline">("revenue");
  const detailTrigger = useRef<HTMLElement | null>(null);
  const [filter, setFilter] = useState<Filter>("red");
  const [detail, setDetail] = useState<string | null>(null);
  useEffect(() => {
    if (!detail && detailTrigger.current?.isConnected) {
      detailTrigger.current.focus();
      detailTrigger.current = null;
    }
  }, [detail]);
  const [factors, setFactors] = useState(false);
  const [call, setCall] = useState<{ row: HealthListRow; key: number } | null>(
    null,
  );
  const revision = useRef(0);
  const load = useCallback(async () => {
    const current = ++revision.current;
    setLoading(true);
    setError(null);
    try {
      const result = await healthScoreService.getDashboard();
      if (current === revision.current) setData(result);
    } catch (e) {
      if (current === revision.current) setError(errors(claveError(e)));
    } finally {
      if (current === revision.current) setLoading(false);
    }
  }, [errors]);
  useEffect(() => {
    setData(null);
    setDetail(null);
    setFactors(false);
    setCall(null);
    setFilter("red");
    setBusy(false);
    setNotice(null);
    void load();
    return () => {
      revision.current += 1;
    };
  }, [organizationId, load]);
  useEffect(() => {
    const change = () => {
      revision.current += 1;
      setData(null);
      setDetail(null);
      setFactors(false);
      setCall(null);
      setBusy(false);
      setNotice(null);
    };
    window.addEventListener(ORGANIZATION_CHANGED_EVENT, change);
    return () => window.removeEventListener(ORGANIZATION_CHANGED_EVENT, change);
  }, []);
  const recalculate = async () => {
    if (busy) return;
    const current = revision.current;
    setBusy(true);
    setError(null);
    try {
      await healthScoreService.refreshAllHealthScores();
      if (current === revision.current) setNotice(t("recalculationQueued"));
    } catch (e) {
      if (current === revision.current) setError(errors(claveError(e)));
    } finally {
      setBusy(false);
    }
  };
  const rows = data?.scores ?? [];
  const measurable = rows.filter(
    (row) =>
      row.raw &&
      (row.raw.invoices_12m > 0 || row.raw.days_since_last_activity !== null),
  );
  const counts = {
    green: measurable.filter((row) => row.band === "green").length,
    yellow: measurable.filter((row) => row.band === "yellow").length,
    red: measurable.filter((row) => row.band === "red").length,
  };
  const filtered = measurable
    .filter(
      (row) =>
        filter === "all" ||
        (filter === "mine"
          ? row.owner_id === data?.user_id
          : filter === "declined"
            ? row.previous_score !== null && row.score < row.previous_score
            : row.band === filter),
    )
    .sort((a, b) =>
      sort === "score"
        ? a.score - b.score
        : sort === "decline"
          ? a.score -
            (a.previous_score ?? a.score) -
            (b.score - (b.previous_score ?? b.score))
          : (b.raw?.revenue_12m ?? 0) - (a.raw?.revenue_12m ?? 0),
    );
  const exportCsv = () => {
    const csv = filasACsv(
      [t("customer"), t("score"), t("revenue")],
      filtered.map((row) => [
        row.customer_name,
        row.score,
        row.raw?.revenue_12m,
      ]),
    );
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "health.csv";
    a.click();
    URL.revokeObjectURL(url);
  };
  if (factors && data?.can_manage)
    return (
      <FactoresSalud
        scores={rows}
        onClose={() => setFactors(false)}
        onSaved={() => {
          setFactors(false);
          setNotice(t("recalculationQueued"));
          void load();
        }}
      />
    );
  const actions = (
    <>
      {data?.can_manage && (
        <button
          type="button"
          className={clasesBoton({ patron: "button", variante: "secundario" })}
          onClick={() => setFactors(true)}
        >
          <Settings aria-hidden className="size-4" />
          {t("factors")}
        </button>
      )}
      <button
        type="button"
        className={clasesBoton({ patron: "button", variante: "secundario" })}
        disabled={loading || !filtered.length}
        onClick={exportCsv}
      >
        <Download aria-hidden className="size-4" />
        {t("export")}
      </button>
      <button
        type="button"
        className={clasesBoton({ patron: "button", variante: "fantasma" })}
        disabled={loading || busy || !data?.can_manage}
        onClick={() => void recalculate()}
        aria-label={t("recalculate")}
      >
        <RefreshCw
          aria-hidden
          className={`size-4 ${busy ? "animate-spin" : ""}`}
        />
      </button>
    </>
  );
  return (
    <>
      <div
        className={`min-h-full space-y-4 bg-canvas p-4 lg:p-6 ${detail ? "hidden" : ""}`}
      >
        <PageHeader
          titulo={t("title")}
          subtitulo={t("subtitle")}
          icono={CheckCircle2}
          migas={[
            { etiqueta: "CRM", href: "/app/crm" },
            { etiqueta: t("title") },
          ]}
          cargando={loading}
          acciones={actions}
          movil={detail ? false : {}}
        />
        {notice && (
          <p
            role="status"
            className="rounded-lg bg-success-subtle p-3 text-sm text-success-text"
          >
            {notice}
          </p>
        )}
        {error ? (
          <EmptyState
            variante="error"
            titulo={t("loadError")}
            descripcion={error}
            onReintentar={() => void load()}
          />
        ) : !loading && !measurable.length ? (
          <div className="rounded-xl border border-line bg-surface">
            <EmptyState
              className="min-h-[340px]"
              accionPrimaria={false}
              icono={CheckCircle2}
              titulo={t("emptyTitle")}
              descripcion={t("emptyDescription")}
              accion={{
                etiqueta: t("howCalculated"),
                onClick: () => setExplanation(true),
              }}
            />
          </div>
        ) : (
          <>
            <div className="hidden gap-4 lg:grid lg:grid-cols-4">
              {(["green", "yellow", "red"] as const).map((band) => (
                <StatCard
                  key={band}
                  etiqueta={t(`bands.${band}`)}
                  valor={counts[band]}
                  cargando={loading}
                  varianteCarga="compacta"
                  tono={
                    band === "green"
                      ? "exito"
                      : band === "yellow"
                        ? "advertencia"
                        : "peligro"
                  }
                  detalle={
                    band === "red"
                      ? t("riskRevenue", {
                          revenue: formatear(
                            measurable
                              .filter((row) => row.band === "red")
                              .reduce(
                                (sum, row) => sum + (row.raw?.revenue_12m ?? 0),
                                0,
                              ),
                          ),
                        })
                      : t("percentage", {
                          percentage: measurable.length
                            ? Math.round(
                                (counts[band] / measurable.length) * 100,
                              )
                            : 0,
                        })
                  }
                  onClick={() => setFilter(band)}
                />
              ))}
              {loading ? <div className="flex h-[72px] items-center gap-3 rounded-xl border border-line bg-surface p-4" aria-hidden="true"><Skeleton className="size-9 rounded-lg" /><div className="flex-1 space-y-2"><Skeleton className="h-3 w-2/3" /><Skeleton className="h-4 w-1/3" /></div></div> : <div className="rounded-xl border border-line bg-surface p-4">
                <p className="mb-2 text-xs text-fg-secondary">
                  {t("meanTrend")}
                </p>
                {data?.trend_error ? (
                  <EmptyState
                    variante="error"
                    titulo={t("trend.error")}
                    onReintentar={() => void load()}
                  />
                ) : (
                  <HealthTrend
                    snapshots={data?.trend ?? []}
                    band={data?.trend.at(-1)?.band ?? "yellow"}
                  />
                )}
              </div>}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <ChipsOpcion
                className="[&>button:nth-child(n+3)]:hidden lg:[&>button:nth-child(n+3)]:inline-flex"
                etiqueta={t("filters")}
                valor={filter}
                onValorChange={setFilter}
                opciones={(
                  ["red", "yellow", "declined", "mine", "all"] as const
                ).map((value) => ({
                  valor: value,
                  etiqueta: t(`filtersLabels.${value}`),
                }))}
              />
              <div className="hidden lg:block">
                <Select value={sort} onValueChange={(value) => setSort(value as typeof sort)}>
                  <SelectTrigger aria-label={t("change")} className="h-8 w-[180px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{(["revenue", "score", "decline"] as const).map((value) => <SelectItem key={value} value={value}>{t(value === "decline" ? "change" : value)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <HealthRiskTable
              rows={filtered}
              loading={loading}
              onClearFilter={() => setFilter("all")}
              onSelect={(id) => {
                detailTrigger.current =
                  document.activeElement instanceof HTMLElement
                    ? document.activeElement
                    : null;
                setDetail(id);
              }}
              onCall={(row) => setCall({ row, key: Date.now() })}
            />
          </>
        )}
        <PanelAdaptable
          abierto={explanation}
          onAbiertoChange={setExplanation}
          titulo={t("howCalculated")}
          icono={CheckCircle2}
        >
          <p className="text-sm text-fg-secondary">
            {t("calculationDescription")}
          </p>
        </PanelAdaptable>
        {call && (
          <AccionesRapidasCrm
            sinBarra
            variante="tarjetaMovil"
            clienteId={call.row.customer_id}
            cliente={{
              id: call.row.customer_id,
              full_name: call.row.customer_name,
              phone: call.row.phone,
              email: call.row.email,
              do_not_call: call.row.do_not_call,
            }}
            abrirAccion={{ accion: "llamar", clave: call.key }}
            onCerrado={() => setCall(null)}
            onAccionCompletada={() => {
              setCall(null);
              void load();
            }}
          />
        )}
      </div>
      <HealthDetailDrawer
        presentation="page"
        customerId={detail}
        open={Boolean(detail)}
        onOpenChange={(open) => !open && setDetail(null)}
      />
    </>
  );
}
export default SaludView;
