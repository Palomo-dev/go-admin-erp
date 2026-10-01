"use client";
import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Plus, RefreshCw, Send, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/kit/PageHeader";
import { SegmentedControl } from "@/components/kit/SegmentedControl";
import { FormField } from "@/components/kit/FormField";
import { EmptyState } from "@/components/kit/EmptyState";
import { Pagination } from "@/components/kit/Pagination";
import { Dialogo } from "@/components/kit/Dialogo";
import { CampaignRnePanel } from "@/components/crm/agentes/campanas/CampaignRnePanel";
import { CampaignCompliancePanel } from "./CampaignCompliancePanel";
import { DialogoMotivo } from "@/components/kit/DialogoMotivo";
import { clasesBoton } from "@/components/kit/botonClases";
import { Skeleton } from "@/components/ui/skeleton";
import { CLASE_CAMPO } from "@/components/crm/kit/camposCrm";
import { pedirCrm, ErrorApiCrm } from "@/components/crm/acciones/apiCrm";
import { useOrganization } from "@/lib/hooks/useOrganization";
import { CampanasService } from "./CampanasService";
import { ApiError } from "@/components/crm/whatsapp/api";
import { voiceCampaignErrorKey } from "@/lib/services/crm/voiceCampaignWriteLogica";
import { useCampanasData } from "./useCampanasData";
import { CampanasTable, type CampanaFila } from "./CampanasTable";
function CampanasContent() {
  const t = useTranslations("crm.campanasNuevo");
  const d = useTranslations("crm.campanasDetalle");
  const [channel, setChannel] = useState("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [rne, setRne] = useState(false);
  const [rneId, setRneId] = useState("");
  const [rneSource, setRneSource] = useState("voice");
  const [target, setTarget] = useState<{
    row: CampanaFila;
    action: string;
  } | null>(null);
  const { data, loading, error, forbidden } = useCampanasData(
    new URLSearchParams({ channel, q, page: String(page) }).toString(),
    revision,
  );
  const refresh = () => setRevision((n) => n + 1);
  const act = async (row: CampanaFila, action: string, reason?: string) => {
    setBusy(true);
    setActionError(null);
    try {
      if (row.source === "voice") {
        await pedirCrm(
          `/api/crm/voice-agents/campaigns/${row.id}${action === "stop" ? "/stop" : ""}`,
          {
            method: action === "delete" ? "DELETE" : "POST",
            cuerpo: { ...(action === "stop" ? { reason } : {}), expected_updated_at: row.updatedAt },
          },
        );
      } else if (action === "pause") await CampanasService.pause(row.id);
      else if (action === "resume") await CampanasService.resume(row.id);
      else if (action === "cancel") await CampanasService.cancel(row.id);
      else if (action === "delete")
        await CampanasService.deleteCampaign(row.id);
      setTarget(null);
      refresh();
    } catch (error) {
      const code = error instanceof ApiError ? error.code : error instanceof ErrorApiCrm ? error.codigo : null;
      setActionError(t(row.source === "voice" ? voiceCampaignErrorKey(code) : code === "RECONCILIATION_REQUIRED" ? "archivoConciliacion" : code === "CAMPAIGN_MODIFIED" ? "archivoConflicto" : "errorAccion"));
    } finally {
      setBusy(false);
    }
  };
  const actions = (
    <>
      <button
        onClick={() => { setRneId(""); setRne(true); }}
        className={clasesBoton({ variante: "secundario" })}
      >
        <ShieldCheck className="size-4" aria-hidden="true" />
        {t("verificarRne")}
      </button>
      {data?.canManage && (
        <Link
          href="/app/crm/campanas/nuevo"
          className={clasesBoton({ variante: "primario" })}
        >
          <Plus className="size-4" aria-hidden="true" />
          {t("nueva")}
        </Link>
      )}
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
    <div className="space-y-5 bg-canvas p-4 sm:p-6 lg:p-8">
      <PageHeader
        titulo={t("titulo")}
        subtitulo={t("subtitulo")}
        icono={Send}
        acciones={actions}
        debajo={<div className="flex flex-wrap gap-2 lg:hidden">{actions}</div>}
      />
      <div className="flex flex-wrap items-end gap-3">
        <SegmentedControl
          etiqueta={t("canal")}
          valor={channel}
          onValorChange={(v) => {
            setChannel(v);
            setPage(1);
          }}
          opciones={["all", "voice", "messages"].map((valor) => ({
            valor,
            etiqueta: t(`filtros.${valor}`),
          }))}
        />
        <div className="w-full sm:max-w-xs">
          <FormField etiqueta={t("buscar")}>
            <input
              className={CLASE_CAMPO}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              type="search"
            />
          </FormField>
        </div>
      </div>
      {actionError && !target && (
        <p
          role="alert"
          className="rounded-lg bg-danger-subtle p-3 text-sm text-danger-text"
        >
          {actionError}
        </p>
      )}
      {loading ? (
        <Skeleton className="h-72" />
      ) : error ? (
        <EmptyState
          variante={forbidden ? "forbidden" : "error"}
          titulo={t(forbidden ? "sinPermiso" : "error")}
          onReintentar={refresh}
        />
      ) : !data?.rows.length ? (
        <EmptyState
          titulo={t(q ? "sinResultados" : "vacio")}
          descripcion={t("vacioDetalle")}
          accion={
            q
              ? {
                  etiqueta: t("limpiar"),
                  onClick: () => {
                    setQ("");
                    setPage(1);
                  },
                }
              : data?.canManage
                ? { etiqueta: t("nueva"), href: "/app/crm/campanas/nuevo" }
                : { etiqueta: t("actualizar"), onClick: refresh }
          }
        />
      ) : (
        <>
          <CampanasTable
            data={data}
            busy={busy}
            onAction={(row, action) => {
              if (["stop", "cancel", "delete"].includes(action)) {
                setActionError(null);
                setTarget({ row, action });
              } else void act(row, action);
            }}
          />
          <Pagination
            pagina={page}
            tamano={25}
            total={data.total}
            onPaginaChange={setPage}
          />
        </>
      )}
      <Dialogo
        abierto={rne}
        onAbiertoChange={setRne}
        titulo={t("verificarRne")}
        descripcion={d("elegirCampana")}
        primario={{ etiqueta: t("cerrar"), onClick: () => setRne(false) }}
      >
        <FormField etiqueta={t("campana")}>
          <select
            className={CLASE_CAMPO}
            value={rneId ? `${rneSource}:${rneId}` : ""}
            onChange={(e) => {
              const row = data?.rows.find((item) => `${item.source}:${item.id}` === e.target.value);
              setRneId(row?.id ?? "");
              setRneSource(row?.source ?? "messages");
            }}
          >
            <option value="">{d("elegirCampana")}</option>
            {data?.rows.map((r) => (
                <option key={`${r.source}:${r.id}`} value={`${r.source}:${r.id}`}>
                  {r.name}
                </option>
              ))}
          </select>
        </FormField>
        {rneId ? (
          rneSource === "voice"
            ? <CampaignRnePanel key={rneId} campaignId={rneId} expectedUpdatedAt={data?.rows.find(r => r.id === rneId && r.source === 'voice')?.updatedAt} onChanged={refresh} />
            : <CampaignCompliancePanel key={rneId} campaignId={rneId} />
        ) : (
          <p className="my-3 text-sm text-fg-muted">{d(data?.rows.length ? "elegirCampana" : "sinCampanas")}</p>
        )}
        <Link
          className="text-sm text-link underline"
          href="/app/configuracion?modulo=crm&tab=telefonia"
        >
          {t("configurar")}
        </Link>
      </Dialogo>
      <Dialogo
        abierto={Boolean(target && target.action !== "stop")}
        onAbiertoChange={(open) => {
          if (!open && !busy) setTarget(null);
        }}
        titulo={t(target?.action === "delete" ? "eliminar" : "cancelarCampana")}
        descripcion={t(target?.action === "delete" ? "confirmarArchivo" : "confirmarDestructivo")}
        primario={{
          etiqueta: t(
            target?.action === "delete" ? "eliminar" : "cancelarCampana",
          ),
          destructiva: true,
          cargando: busy,
          onClick: () => {
            if (target) void act(target.row, target.action);
          },
        }}
      >
        {actionError && (
          <p role="alert" className="text-sm text-danger-text">
            {actionError}
          </p>
        )}
      </Dialogo>
      <DialogoMotivo
        abierto={target?.action === "stop"}
        onAbiertoChange={(open) => {
          if (!open && !busy) setTarget(null);
        }}
        titulo={t(
          target?.action === "stop"
            ? "detener"
            : target?.action === "delete"
              ? "eliminar"
              : "cancelarCampana",
        )}
        descripcion={
          target?.action === "stop"
            ? t("notaParada")
            : t("confirmarDestructivo")
        }
        textoConfirmar={t(
          target?.action === "stop"
            ? "detener"
            : target?.action === "delete"
              ? "eliminar"
              : "cancelarCampana",
        )}
        minimo={3}
        maximo={2000}
        cargando={busy}
        error={actionError}
        onConfirmar={(reason) =>
          target ? act(target.row, target.action, reason) : undefined
        }
      />
    </div>
  );
}
export function CampanasPage() {
  const { organization } = useOrganization();
  return <CampanasContent key={organization?.id ?? "sin-org"} />;
}
