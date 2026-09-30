"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Download, History, RefreshCw, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/kit/PageHeader";
import { EmptyState } from "@/components/kit/EmptyState";
import { Dialogo } from "@/components/kit/Dialogo";
import { DialogoMotivo } from "@/components/kit/DialogoMotivo";
import { clasesBoton } from "@/components/kit/botonClases";
import { Skeleton } from "@/components/ui/skeleton";
import { useOrganization } from "@/lib/hooks/useOrganization";
import { useFormatDate } from "@/lib/context/OrganizationTimezoneContext";
import {
  trimestreDelDia,
  type ForecastCategory,
} from "@/lib/services/crm/forecastLogica";
import { pedirCrm, ErrorApiCrm } from "@/components/crm/acciones/apiCrm";
import { filasACsv } from "@/lib/utils/csv";
import { useForecastData } from "./useForecastData";
import { ForecastFilters } from "./ForecastFilters";
import {
  ForecastSellers,
  ForecastOpportunities,
  type ForecastRow,
} from "./ForecastTables";
import { ForecastSummary } from "./ForecastSummary";
import { ForecastAdjustmentDialog } from "./ForecastAdjustmentDialog";
import { ForecastHistory } from "./ForecastHistory";
interface ForecastDashboardProps {
  currency: string | null;
}
function ForecastContent() {
  const t = useTranslations("crm.pronostico");
  const { getToday } = useFormatDate(null);
  const [period, setPeriod] = useState(() => trimestreDelDia(getToday()));
  const [team, setTeam] = useState("");
  const [seller, setSeller] = useState("");
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [adjust, setAdjust] = useState<ForecastRow | null>(null);
  const [history, setHistory] = useState(false);
  const [undo, setUndo] = useState<{ id: string; user: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const params = new URLSearchParams({
    period,
    page: String(page),
    ...(team ? { team_id: team } : {}),
    ...(seller ? { user_id: seller } : {}),
  });
  const { data, loading, error, forbidden } = useForecastData(
    params.toString(),
    revision,
  );
  const refresh = () => setRevision((n) => n + 1);
  const mutate = async (operation: () => Promise<unknown>) => {
    setBusy(true);
    setActionError(null);
    try {
      await operation();
      setAdjust(null);
      setUndo(null);
      refresh();
    } catch (e) {
      setActionError(
        t(
          e instanceof ErrorApiCrm && e.codigo === "sin_tasa"
            ? "errores.sinTasa"
            : e instanceof ErrorApiCrm && e.status === 409
              ? "errores.conflicto"
              : e instanceof ErrorApiCrm && e.status === 403
                ? "errores.sinPermiso"
                : "errores.generico",
        ),
      );
    } finally {
      setBusy(false);
    }
  };
  const category = (
    id: string,
    category: ForecastCategory,
    updatedAt: string | null,
  ) =>
    void mutate(() =>
      pedirCrm(`/api/crm/opportunities/${id}/forecast-category`, {
        method: "PATCH",
        cuerpo: { category, expected_updated_at: updatedAt },
      }),
    );
  const exportData = () => {
    if (!data) return;
    const csv = filasACsv(
      [
        t("vendedor"),
        t("cuota"),
        t("ganado"),
        t("compromiso"),
        t("mejorCaso"),
        t("ponderado"),
        t("moneda"),
      ],
      data.rows.map((r) => [
        [r.name?.first_name, r.name?.last_name].filter(Boolean).join(" ") ||
          t("sinVendedor"),
        r.quota.total,
        r.won.total,
        r.commit.total,
        r.bestCase.total,
        r.weighted.total,
        data.moneda.code,
      ]),
    );
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `forecast-${period}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const actions = (
    <>
      <button
        className={clasesBoton({ variante: "secundario" })}
        onClick={() => setHistory(true)}
        disabled={!data}
      >
        <History className="size-4" aria-hidden="true" />
        {t("historial")}
      </button>
      <button
        className={clasesBoton({ variante: "secundario" })}
        onClick={exportData}
        disabled={!data || loading}
      >
        <Download className="size-4" aria-hidden="true" />
        {t("exportar")}
      </button>
      <button
        className={clasesBoton({ variante: "fantasma" })}
        onClick={refresh}
        disabled={loading}
        aria-label={t("actualizar")}
      >
        <RefreshCw className="size-4" aria-hidden="true" />
      </button>
    </>
  );
  return (
    <div className="space-y-5">
      <PageHeader
        titulo={t("titulo")}
        subtitulo={period}
        icono={TrendingUp}
        acciones={actions}
        debajo={<div className="flex flex-wrap gap-2 lg:hidden">{actions}</div>}
      />
      <ForecastFilters
        data={data}
        period={period}
        team={team}
        seller={seller}
        busy={busy}
        setPeriod={setPeriod}
        setTeam={setTeam}
        setSeller={setSeller}
        setPage={setPage}
      />
      {actionError && (
        <p
          role="alert"
          className="rounded-lg bg-danger-subtle p-3 text-sm text-danger-text"
        >
          {actionError}
        </p>
      )}
      {error ? (
        <EmptyState
          variante={forbidden ? "forbidden" : "error"}
          titulo={t(forbidden ? "sinPermiso" : "error")}
          onReintentar={refresh}
        />
      ) : (
        <>
          <ForecastSummary data={data} loading={loading} />
          {loading ? (
            <Skeleton className="h-64" />
          ) : (
            data &&
            (seller || !data.canViewAll ? (
              <ForecastOpportunities
                data={data}
                page={page}
                onPage={setPage}
                onCategory={category}
                busy={busy}
              />
            ) : (
              <ForecastSellers
                data={data}
                onSeller={(id) => {
                  setSeller(id);
                  setPage(1);
                }}
                onAdjust={setAdjust}
              />
            ))
          )}
        </>
      )}
      {adjust && data && (
        <ForecastAdjustmentDialog
          key={adjust.userId}
          row={adjust}
          moneda={data.moneda}
          period={period}
          busy={busy}
          onClose={() => setAdjust(null)}
          onSave={(values) =>
            void mutate(() =>
              pedirCrm("/api/crm/forecast/adjustments", {
                method: "POST",
                cuerpo: {
                  ...values,
                  period,
                  user_id: adjust.userId,
                  expected_before: adjust.commit.total,
                  expected_adjustment_id: adjust.latestAdjustment?.id ?? null,
                },
              }),
            )
          }
        />
      )}
      <Dialogo
        abierto={history}
        onAbiertoChange={setHistory}
        titulo={t("historial")}
        primario={{ etiqueta: t("cerrar"), onClick: () => setHistory(false) }}
      >
        {data && (
          <ForecastHistory
            data={data}
            busy={busy}
            onUndo={(id, user) => setUndo({ id, user })}
          />
        )}
      </Dialogo>
      <DialogoMotivo
        abierto={Boolean(undo)}
        onAbiertoChange={(v) => {
          if (!v && !busy) setUndo(null);
        }}
        titulo={t("revertir")}
        textoConfirmar={t("revertir")}
        descripcion={t("notaReversion")}
        minimo={3}
        maximo={2000}
        cargando={busy}
        error={actionError}
        onConfirmar={(reason) => {
          const row = data?.rows.find((r) => r.userId === undo?.user);
          if (!row || !undo) return;
          return mutate(() =>
            pedirCrm("/api/crm/forecast/adjustments", {
              method: "POST",
              cuerpo: {
                period,
                user_id: undo.user,
                expected_before: row.commit.total,
                expected_adjustment_id: row.latestAdjustment?.id ?? null,
                reason_code: "reversal",
                reason_text: reason,
                reverses_id: undo.id,
              },
            }),
          );
        }}
      />
    </div>
  );
}
export function ForecastDashboard({ currency }: ForecastDashboardProps) {
  void currency; // Compatibilidad de Revenue OS: la nueva lectura resuelve su moneda en servidor.
  const { organization } = useOrganization();
  return <ForecastContent key={organization?.id ?? "sin-organizacion"} />;
}
