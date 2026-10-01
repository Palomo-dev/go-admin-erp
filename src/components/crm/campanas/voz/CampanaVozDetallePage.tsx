"use client";
import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Bot, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/kit/PageHeader";
import { StatCard } from "@/components/kit/StatCard";
import { StatusBadge } from "@/components/kit/StatusBadge";
import { EmptyState } from "@/components/kit/EmptyState";
import { Pagination } from "@/components/kit/Pagination";
import { DialogoMotivo } from "@/components/kit/DialogoMotivo";
import { clasesBoton } from "@/components/kit/botonClases";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { CampaignRnePanel } from "@/components/crm/agentes/campanas/CampaignRnePanel";
import { pedirCrm, ErrorApiCrm } from "@/components/crm/acciones/apiCrm";
import { useOrganization } from "@/lib/hooks/useOrganization";
import { useFormatDate } from "@/lib/context/OrganizationTimezoneContext";
import type { VozCampanaDetalle } from "@/lib/services/crm/voiceCampaignDetailService";
import { voiceCampaignErrorKey } from "@/lib/services/crm/voiceCampaignWriteLogica";
import { useCampanasLectura } from "../useCampanasData";
import { VozCampanaLlamadas } from "./VozCampanaLlamadas";
function Detalle({ campaignId }: { campaignId: string }) {
  const t = useTranslations("crm.campanasVoz");
  const c = useTranslations("crm.campanasNuevo");
  const { formatDateTime } = useFormatDate(null);
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [stop, setStop] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const { data, loading, error, forbidden } =
    useCampanasLectura<VozCampanaDetalle>(
      `/api/crm/voice-agents/campaigns/${campaignId}?page=${page}`,
      revision,
    );
  const refresh = () => setRevision((n) => n + 1);
  const act = async (reason?: string) => {
    setBusy(true);
    setActionError(null);
    try {
      await pedirCrm(
        `/api/crm/voice-agents/campaigns/${campaignId}${reason ? "/stop" : ""}`,
        {
          method: reason ? "POST" : "PATCH",
          cuerpo: reason
            ? { reason, expected_updated_at: data?.campaign.updated_at }
            : {
                status:
                  data?.campaign.status === "running" ? "paused" : "running",
                emergency_stop: false,
                expected_updated_at: data?.campaign.updated_at,
              },
        },
      );
      setStop(false);
      refresh();
    } catch (e) {
      setActionError(c(voiceCampaignErrorKey(e instanceof ErrorApiCrm ? e.codigo : null)));
    } finally {
      setBusy(false);
    }
  };
  const campaign = data?.campaign;
  const actions = (
    <>
      <Link
        className={clasesBoton({ variante: "secundario" })}
        href="/app/crm/campanas"
      >
        {t("volver")}
      </Link>
      {data?.canManage && (
        <>
          <button
            disabled={busy || campaign?.status === "completed"}
            className={clasesBoton({ variante: "secundario" })}
            onClick={() => void act()}
          >
            {t(campaign?.status === "running" ? "pausar" : "reanudar")}
          </button>
          <button
            disabled={busy || campaign?.emergency_stop || campaign?.status === "completed"}
            className={clasesBoton({ variante: "destructivo" })}
            onClick={() => {
              setActionError(null);
              setStop(true);
            }}
          >
            {c("detener")}
          </button>
        </>
      )}
      <button
        className={clasesBoton({ variante: "fantasma" })}
        aria-label={c("actualizar")}
        onClick={refresh}
        disabled={loading}
      >
        <RefreshCw className="size-4" />
      </button>
    </>
  );
  return (
    <div className="space-y-5 bg-canvas p-4 sm:p-6 lg:p-8">
      <PageHeader
        variante="detail"
        titulo={campaign?.name ?? t("titulo")}
        icono={Bot}
        subtitulo={campaign?.agent_name}
        badge={
          campaign && (
            <StatusBadge
              estado={campaign.emergency_stop ? "stopped" : campaign.status}
              etiqueta={c(
                `estados.${campaign.emergency_stop ? "stopped" : campaign.status}`,
              )}
            />
          )
        }
        acciones={actions}
        debajo={<div className="flex flex-wrap gap-2 lg:hidden">{actions}</div>}
      />
      {loading ? (
        <Skeleton className="h-72" />
      ) : error || !data ? (
        <EmptyState
          variante={forbidden ? "forbidden" : "error"}
          onReintentar={refresh}
        />
      ) : (
        <>
          {actionError && !stop && (
            <p role="alert" className="text-danger-text">
              {actionError}
            </p>
          )}
          {campaign?.emergency_stop && (
            <div
              role="status"
              className="rounded-xl border border-line-danger bg-danger-subtle p-4 text-danger-text"
            >
              <p className="font-medium">{t("detenida")}</p>
              <p>{campaign.stopped_reason}</p>
              {campaign.stopped_at && (
                <p className="text-xs">{formatDateTime(campaign.stopped_at)}</p>
              )}
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              etiqueta={t("intentos")}
              valor={data.stats.attempts}
              detalle={t("hoy", { n: data.stats.today })}
            />
            <StatCard
              etiqueta={t("efectivos")}
              valor={data.stats.effective}
              detalle={t("efectivosNota")}
            />
            <StatCard etiqueta={t("reuniones")} valor={data.stats.meetings} />
            <StatCard
              etiqueta={t("minutos")}
              valor={Number(data.stats.conversation_minutes).toFixed(1)}
              detalle={
                data.stats.remaining_minutes === null
                  ? t("sinLimite")
                  : t("saldo", { n: data.stats.remaining_minutes })
              }
            />
          </div>
          <div className="grid items-start gap-5 xl:grid-cols-[2fr_1fr]">
            <div className="space-y-5">
              <section className="rounded-xl border border-line bg-surface p-4">
                <h2 className="mb-3 font-semibold text-fg">
                  {t("ahora", { n: data.stats.active_total })}
                </h2>
                {data.active.length ? (
                  <VozCampanaLlamadas rows={data.active} />
                ) : (
                  <p className="text-sm text-fg-secondary">{t("sinActivas")}</p>
                )}
                <p className="mt-3 text-xs text-fg-secondary">
                  {t("cola", {
                    pending: data.stats.pending,
                    rescheduled: data.stats.rescheduled,
                  })}
                </p>
                <p className="mt-2 text-xs text-fg-muted">{t("franjaNota")}</p>
              </section>
              <section className="rounded-xl border border-line bg-surface p-4">
                <h2 className="mb-3 font-semibold text-fg">{t("historial")}</h2>
                {data.history.length ? (
                  <>
                    <VozCampanaLlamadas rows={data.history} />
                    <Pagination
                      pagina={page}
                      tamano={25}
                      total={data.stats.attempts}
                      onPaginaChange={setPage}
                    />
                  </>
                ) : (
                  <EmptyState
                    compacto
                    titulo={t("sinIntentos")}
                    accion={{
                      etiqueta: t("volver"),
                      href: "/app/crm/campanas",
                    }}
                  />
                )}
              </section>
            </div>
            <div className="space-y-5">
              <section className="space-y-3 rounded-xl border border-line bg-surface p-4">
                <h2 className="font-semibold text-fg">{t("resultados")}</h2>
                {Object.entries(data.stats.outcomes).map(([status, n]) => (
                  <div key={status} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <StatusBadge estado={status} />
                      <span className="tabular-nums text-fg-secondary">
                        {n} / {data.stats.targets}
                      </span>
                    </div>
                    <Progress
                      value={
                        data.stats.targets ? (n / data.stats.targets) * 100 : 0
                      }
                      aria-label={status}
                    />
                  </div>
                ))}
                <p className="text-xs text-fg-secondary">
                  {t("fallos", {
                    n: campaign?.consecutive_failures ?? 0,
                    max: data.failureThreshold,
                  })}
                </p>
                <p className="text-xs text-fg-muted">{t("buzonNota")}</p>
              </section>
              <CampaignRnePanel campaignId={campaignId} expectedUpdatedAt={campaign?.updated_at} onChanged={refresh} />
              <Link
                className="block text-sm text-link hover:underline"
                href="/app/crm/agentes-ia?tab=campanas"
              >
                {t("diagnostico")}
              </Link>
            </div>
          </div>
        </>
      )}
      <DialogoMotivo
        abierto={stop}
        onAbiertoChange={setStop}
        titulo={c("confirmarParada")}
        descripcion={c("notaParada")}
        textoConfirmar={c("detener")}
        onConfirmar={(reason) => act(reason)}
        cargando={busy}
        error={actionError}
      />
    </div>
  );
}
export function CampanaVozDetallePage({ campaignId }: { campaignId: string }) {
  const { organization } = useOrganization();
  return (
    <Detalle
      key={`${organization?.id ?? "none"}:${campaignId}`}
      campaignId={campaignId}
    />
  );
}
