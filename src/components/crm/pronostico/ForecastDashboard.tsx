"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { moduloPorCodigo } from "@/lib/navigation/catalog";
import { useNombresNav } from "@/lib/navigation/useNombresNav";
import { TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/kit/PageHeader";
import { Dialogo } from "@/components/kit/Dialogo";
import { DialogoMotivo } from "@/components/kit/DialogoMotivo";

import { useOrganization } from "@/lib/hooks/useOrganization";
import { useFormatDate } from "@/lib/context/OrganizationTimezoneContext";
import {
  trimestreDelDia,
  type ForecastCategory,
} from "@/lib/services/crm/forecastLogica";
import { pedirCrm, ErrorApiCrm } from "@/components/crm/acciones/apiCrm";
import { formatMoneda } from "@/lib/utils/moneda";
import { useForecastData } from "./useForecastData";
import { ForecastFilters } from "./ForecastFilters";
import type { ForecastRow } from "./ForecastTables";
import { ForecastAdjustmentDialog } from "./ForecastAdjustmentDialog";
import { ForecastHistory } from "./ForecastHistory";
import { ForecastBody } from "./ForecastBody";
import { ForecastHeaderActions, ForecastMenu } from "./ForecastActions";
interface ForecastDashboardProps {
  currency: string | null;
  onAnalytics?: () => void;
}
function ForecastContent({ onAnalytics }: { onAnalytics?: () => void }) {
  const t = useTranslations("crm.pronostico");
  const tNav = useTranslations("nav");
  const navNames = useNombresNav();
  const pathname = usePathname();
  const navModule = moduloPorCodigo("crm");
  const navPage = navModule?.paginas.find((page) => page.href === pathname);
  const { getToday } = useFormatDate(null);
  const [period, setPeriod] = useState(() => trimestreDelDia(getToday()));
  const [team, setTeam] = useState("");
  const [seller, setSeller] = useState("");
  const [view, setView] = useState<"sellers" | "months">("sellers");
  const [mobile, setMobile] = useState(false);
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [adjust, setAdjust] = useState<ForecastRow | null>(null);
  const [history, setHistory] = useState(false);
  const [undo, setUndo] = useState<{ id: string; user: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const actionLatch = useRef(false);
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
  useEffect(() => {
    const media = window.matchMedia("(max-width: 1023px)");
    const update = () => setMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (mobile && data?.canViewAll && data.currentUserId && !seller) {
      setSeller(data.currentUserId);
      setPage(1);
    }
  }, [mobile, data, seller]);
  const periodParts = /^(\d{4})-Q([1-4])$/.exec(period);
  const periodLabel = periodParts
    ? t("trimestreEtiqueta", {
        n: Number(periodParts[2]),
        year: periodParts[1],
      })
    : period;
  const selectedSeller = data?.sellers.find((row) => row.id === seller);
  const selectedName = [selectedSeller?.first_name, selectedSeller?.last_name]
    .filter(Boolean)
    .join(" ");
  const waitingForPersonal = mobile && data?.canViewAll && !seller;
  const metadata =
    selectedName && data
      ? `${periodLabel} · ${t("cuota")} ${formatMoneda(data.summary.quota.total, data.moneda)} · ${t("compromiso")} ${formatMoneda(data.summary.commit.total, data.moneda)}`
      : periodLabel;
  const mutate = async (operation: () => Promise<unknown>) => {
    if (actionLatch.current) return;
    actionLatch.current = true;
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
      actionLatch.current = false;
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
  const actionProps = {
    data,
    loading,
    busy,
    period,
    refresh,
    setPeriod,
    setPage,
    onHistory: () => setHistory(true),
    onAnalytics,
  };
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        className="contents lg:flex"
        migas={
          navModule && navPage
            ? [
                {
                  etiqueta: tNav(navModule.etiqueta),
                  href: navModule.rutas[0],
                },
                { etiqueta: navNames.pagina(navPage) },
              ]
            : undefined
        }
        titulo={
          selectedName
            ? t("tituloVendedor", { nombre: selectedName })
            : t("titulo")
        }
        subtitulo={metadata}
        icono={TrendingUp}
        acciones={<ForecastHeaderActions {...actionProps} />}
        movil={{
          titulo: t("miPronostico"),
          subtitulo: "",
          accion: <ForecastMenu {...actionProps} />,
        }}
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
        view={view}
        onView={setView}
      />
      {actionError && (
        <p
          role="alert"
          className="rounded-lg bg-danger-subtle p-3 text-sm text-danger-text"
        >
          {actionError}
        </p>
      )}
      <ForecastBody
        data={data}
        loading={loading}
        error={error}
        forbidden={forbidden}
        refresh={refresh}
        busy={busy}
        seller={seller}
        view={view}
        page={page}
        setPage={setPage}
        setSeller={setSeller}
        category={category}
        setAdjust={setAdjust}
        periodLabel={periodLabel}
        waitingForPersonal={Boolean(waitingForPersonal)}
      />
      {adjust && data && (
        <ForecastAdjustmentDialog
          key={adjust.userId}
          row={adjust}
          moneda={data.moneda}
          period={periodLabel}
          error={actionError}
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
export function ForecastDashboard({
  currency,
  onAnalytics,
}: ForecastDashboardProps) {
  void currency; // Compatibilidad de Revenue OS: la nueva lectura resuelve su moneda en servidor.
  const { organization } = useOrganization();
  return (
    <ForecastContent
      key={organization?.id ?? "sin-organizacion"}
      onAnalytics={onAnalytics}
    />
  );
}
