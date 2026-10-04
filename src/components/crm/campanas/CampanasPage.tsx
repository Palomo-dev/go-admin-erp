"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Plus, RefreshCw, Send, ShieldCheck } from "lucide-react";
import { useMigasAreaCrm } from './migasCrm';
import { PageHeader } from "@/components/kit/PageHeader";
import { SegmentedControl } from "@/components/kit/SegmentedControl";
import { FormField } from "@/components/kit/FormField";
import { EmptyState } from "@/components/kit/EmptyState";
import { Pagination } from "@/components/kit/Pagination";
import { Dialogo } from "@/components/kit/Dialogo";
import { CampaignCompliancePanel } from "./CampaignCompliancePanel";
import { DialogoMotivo } from "@/components/kit/DialogoMotivo";
import { clasesBoton } from "@/components/kit/botonClases";
import { DataTable } from "@/components/kit/DataTable";
import { SearchInput } from "@/components/kit/SearchInput";
import { CLASE_CAMPO } from "@/components/crm/kit/camposCrm";
import { pedirCrm, ErrorApiCrm } from "@/components/crm/acciones/apiCrm";
import { useOrganization } from "@/lib/hooks/useOrganization";
import { CampanasService } from "./CampanasService";
import { ApiError } from "@/components/crm/whatsapp/api";
import { voiceCampaignErrorKey } from "@/lib/services/crm/voiceCampaignWriteLogica";
import { useCampanasData } from "./useCampanasData";
import { CampanasTable, type CampanaFila } from "./CampanasTable";
function CampanasContent() {
  const migas = useMigasAreaCrm('/app/crm/campanas');
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
  const [rneSource, setRneSource] = useState("messages");
  const [target, setTarget] = useState<{
    row: CampanaFila;
    action: string;
  } | null>(null);
  const { data, loading, error, forbidden } = useCampanasData(
    new URLSearchParams({ channel, q, page: String(page) }).toString(),
    revision,
  );
  const refresh = () => setRevision((n) => n + 1);
  const intent = useRef<AbortController | null>(null);
  useEffect(() => () => intent.current?.abort(), []);
  const act = async (row: CampanaFila, action: string, reason?: string) => {
    if (!data?.canManage || intent.current) return;
    const controller = new AbortController(); intent.current = controller;
    setBusy(true);
    setActionError(null);
    try {
      if (row.source === "voice") {
        await pedirCrm(
          `/api/crm/voice-agents/campaigns/${row.id}${action === "stop" ? "/stop" : ""}`,
          {
            method: action === "delete" ? "DELETE" : action === "stop" ? "POST" : "PATCH",
            signal: controller.signal,
            cuerpo: { ...(action === "stop" ? { reason } : action === "pause" ? { status: "paused" } : action === "resume" ? { status: "running", emergency_stop: false } : {}), expected_updated_at: row.updatedAt },
          },
        );
      } else if (action === "pause") await CampanasService.pause(row.id);
      else if (action === "resume") await CampanasService.resume(row.id);
      else if (action === "cancel") await CampanasService.cancel(row.id);
      else if (action === "delete")
        await CampanasService.deleteCampaign(row.id);
      if (!controller.signal.aborted) { setTarget(null); refresh(); }
    } catch (error) {
      const code = error instanceof ApiError ? error.code : error instanceof ErrorApiCrm ? error.codigo : null;
      if (!controller.signal.aborted) setActionError(t(row.source === "voice" ? voiceCampaignErrorKey(code) : code === "RECONCILIATION_REQUIRED" ? "archivoConciliacion" : code === "CAMPAIGN_MODIFIED" ? "archivoConflicto" : "errorAccion"));
    } finally {
      intent.current = null; if (!controller.signal.aborted) setBusy(false);
    }
  };
  const actions = (
    <>
      {channel !== "voice" && <button
        onClick={() => { setRneId(""); setRne(true); }}
        className={clasesBoton({ variante: "secundario" })}
      >
        <ShieldCheck className="size-4" aria-hidden="true" />
        {t("verificarRne")}
      </button>}
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
    <div className="space-y-4 bg-canvas p-4 sm:p-6">
      <PageHeader migas={migas}
        titulo={t("titulo")}
        subtitulo={t("subtitulo")}
        icono={Send}
        acciones={actions}
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
        {(loading || error || (data?.rows.length ?? 0) > 0) && <SearchInput className="ml-auto w-full sm:max-w-xs" value={q} onChange={v => { setQ(v); setPage(1); }} pistaAtajo={false} etiqueta={t("buscar")} placeholder={t("buscar")} />}
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
        <DataTable columnas={["name", "channel", "audience", "progress", "status", "created", "actions"].map(id => ({ id, encabezado: "", celda: () => null }))} filas={[]} obtenerId={() => ""} etiqueta={t("titulo")} estado="cargando" filasEsqueleto={6} mostrarCabeceraCargando={false} altoFilaEsqueleto={48} varianteEsqueleto="figma" />
      ) : error ? (
        <EmptyState
          className="rounded-xl border border-line bg-surface min-h-[410px] pt-24 pb-12 [&>div:last-child]:mt-12"
          accionPrimaria
          variante={forbidden ? "forbidden" : "error"}
          titulo={t(forbidden ? "sinPermiso" : "error")}
          descripcion={forbidden ? undefined : t("errorDetalle")}
          onReintentar={refresh}
        />
      ) : !data?.rows.length ? (
        <EmptyState
          className="rounded-xl border border-line bg-surface min-h-[410px] pt-24 pb-12 [&>div:last-child]:mt-12"
          accionPrimaria
          variante={q ? "search" : "empty"}
          icono={Send}
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
                ? { etiqueta: t("nueva"), href: "/app/crm/campanas/nuevo", icono: Plus }
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
          {data.total > 25 && <Pagination
            layout="compact" densidad="compacta"
            pagina={page}
            tamano={25}
            total={data.total}
            onPaginaChange={setPage}
          />}
        </>
      )}
      <div className="flex flex-wrap gap-2 lg:hidden">{actions}</div>
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
            {data?.rows.filter(r => r.source !== "voice").map((r) => (
                <option key={`${r.source}:${r.id}`} value={`${r.source}:${r.id}`}>
                  {r.name}
                </option>
              ))}
          </select>
        </FormField>
        {rneId ? (
          <CampaignCompliancePanel key={rneId} campaignId={rneId} />
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
