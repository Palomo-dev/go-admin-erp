"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { Bot, RefreshCw, Pause, Power, Play, TriangleAlert } from "lucide-react";
import { useMigasAreaCrm } from '../migasCrm';
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
  const migas = useMigasAreaCrm('/app/crm/campanas');
  const t = useTranslations("crm.campanasVoz");
  const c = useTranslations("crm.campanasNuevo");
  const formatter = useFormatter();
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
  const intent = useRef<AbortController | null>(null);
  useEffect(() => () => intent.current?.abort(), []);
  const act = async (reason?: string) => {
    if (!data?.canManage || intent.current) return;
    const controller = new AbortController(); intent.current = controller;
    setBusy(true);
    setActionError(null);
    try {
      await pedirCrm(
        `/api/crm/voice-agents/campaigns/${campaignId}${reason ? "/stop" : ""}`,
        {
          method: reason ? "POST" : "PATCH",
          signal: controller.signal,
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
      if (!controller.signal.aborted) { setStop(false); refresh(); }
    } catch (e) {
      if (!controller.signal.aborted) setActionError(c(voiceCampaignErrorKey(e instanceof ErrorApiCrm ? e.codigo : null)));
    } finally {
      intent.current = null; if (!controller.signal.aborted) setBusy(false);
    }
  };
  const campaign = data?.campaign;
  const pct = (n: number, total: number, decimals = 0) => total > 0 ? formatter.number(n / total, { style: "percent", maximumFractionDigits: decimals }) : "—";
  const actions = (
    <>
      {data?.canManage && (
        <>
          <button
            disabled={busy || campaign?.status === "completed"}
            className={clasesBoton({ variante: "secundario" })}
            onClick={() => void act()}
          >
            {campaign?.status === "running" ? <Pause className="size-4" aria-hidden="true" strokeWidth={1.5} /> : <Play className="size-4" aria-hidden="true" strokeWidth={1.5} />}{t(campaign?.status === "running" ? "pausar" : "reanudar")}
          </button>
          {!campaign?.emergency_stop && <button
            disabled={busy || campaign?.emergency_stop || campaign?.status === "completed"}
            className={clasesBoton({ variante: "destructivo" })}
            onClick={() => {
              setActionError(null);
              setStop(true);
            }}
          >
            <Power className="size-4" aria-hidden="true" strokeWidth={1.5} />{c("detener")}
          </button>}
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
    <div className="space-y-4 bg-canvas p-4 sm:p-6">
      <PageHeader migas={migas}
        variante="detail" volverA="/app/crm/campanas"
        titulo={campaign?.name ?? t("titulo")}
        icono={Bot}
        subtitulo={campaign?.agent_name}
        badge={
          campaign && (
            <StatusBadge
              estado={campaign.emergency_stop ? "stopped" : campaign.status} tipografia="figma"
              etiqueta={c(
                `estados.${campaign.emergency_stop ? "stopped" : campaign.status}`,
              )}
            />
          )
        }
        acciones={actions}
      />
      <div className="flex flex-wrap gap-2 lg:hidden">{actions}</div>
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
              <p className="text-[13px] leading-[18px]"><span className="font-medium">{t("detenida")}</span>{" · "}<span>{campaign.stopped_reason}</span></p>
              {campaign.stopped_at && (
                <p className="text-xs">{formatDateTime(campaign.stopped_at)}</p>
              )}
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              etiqueta={t("intentos")}
              valor={`${formatter.number(data.stats.attempts, { useGrouping: true })} / ${formatter.number(data.stats.targets, { useGrouping: true })}`}
              detalle={t("hoy", { n: data.stats.today })}
            />
            <StatCard
              etiqueta={t("efectivos")}
              valor={pct(data.stats.effective, data.stats.attempts)}
              detalle={`${data.stats.effective} · ${t("efectivosNota")}`} tono="exito"
            />
            <StatCard etiqueta={t("reuniones")} valor={data.stats.meetings} detalle={pct(data.stats.meetings, data.stats.effective, 1)} />
            <StatCard
              etiqueta={t("minutos")} tono="advertencia" iconoDetalle={TriangleAlert}
              valor={formatter.number(data.stats.conversation_minutes, { maximumFractionDigits: 1 })}
              detalle={
                data.stats.remaining_minutes === null
                  ? t("sinLimite")
                  : t("saldo", { n: data.stats.remaining_minutes })
              }
            />
          </div>
          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <div className="space-y-5">
              <section className="rounded-xl border border-line bg-surface p-4">
                <div className="mb-3 flex items-center justify-between gap-2"><h2 className="text-base font-semibold leading-[22px] text-fg">{t("ahora", { n: data.stats.active_total })}</h2><StatusBadge estado={data.stats.active_total ? "active" : "paused"} etiqueta={`${data.stats.active_total} / ${campaign?.max_concurrent ?? "—"}`} tipografia="figma" /></div>
                {data.active.length ? (
                  <VozCampanaLlamadas rows={data.active} activas />
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
              <details className="rounded-xl border border-line bg-surface p-4">
                <summary className="cursor-pointer text-sm font-semibold text-fg">{t("historial")}</summary>
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
              </details>
            </div>
            <div className="space-y-5">
              <section className="space-y-3 rounded-xl border border-line bg-surface p-4">
                <h2 className="text-base font-semibold leading-[22px] text-fg">{t("resultados")}</h2>
                {Object.entries(data.stats.outcomes).map(([status, n]) => (
                  <div key={status} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-[13px] text-fg-secondary">{t.has(`outcomes.${status}`) ? t(`outcomes.${status}`) : status}</span>
                      <span className="tabular-nums text-fg-secondary">
                        {n} · {pct(n, data.stats.attempts)}
                      </span>
                    </div>
                    <Progress className="h-2 bg-subtle [&>div]:bg-brand"
                      value={
                        data.stats.attempts ? (n / data.stats.attempts) * 100 : 0
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
              <details className="rounded-xl border border-line bg-surface p-4"><summary className="cursor-pointer text-sm font-semibold text-fg">{c("verificarRne")}</summary><div className="mt-3"><CampaignRnePanel campaignId={campaignId} expectedUpdatedAt={campaign?.updated_at} onChanged={refresh} /></div></details>
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
      <div className="flex flex-wrap gap-2 lg:hidden">{actions}</div>
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
