"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Merge, History, RefreshCw } from "lucide-react";
import { useOrganization } from "@/lib/hooks/useOrganization";
import { PageHeader } from "@/components/kit/PageHeader";
import { EmptyState } from "@/components/kit/EmptyState";
import { KpiStrip } from "@/components/kit/KpiStrip";
import { StatCard } from "@/components/kit/StatCard";
import { SearchInput } from "@/components/kit/SearchInput";
import { SegmentedControl } from "@/components/kit/SegmentedControl";
import { Pagination } from "@/components/kit/Pagination";
import { Dialogo } from "@/components/kit/Dialogo";
import { clasesBoton } from "@/components/kit/botonClases";
import { Skeleton } from "@/components/ui/skeleton";
import { claveErrorIdentidades } from "./identidadesLogica";
import type { GrupoDuplicado } from "@/lib/services/crm/customerDuplicatesLogica";
import { DuplicadosPanel } from "./DuplicadosPanel";
import { FusionClientesPanel } from "./FusionClientesPanel";
import { HistorialFusiones } from "./HistorialFusiones";
import { ExportarFusiones } from "./ExportarFusiones";
import { IdentidadesCanal } from "./IdentidadesCanal";
import {
  useIdentidadesData,
  type VistaIdentidades,
} from "./useIdentidadesData";
import {
  fusionarClientes,
  deshacerFusion,
  excluirPar,
  iniciarBusqueda,
  editarIdentidad,
  eliminarIdentidad,
} from "./IdentidadesService";

function IdentidadesContenido() {
  const t = useTranslations("crm.identidades");
  const [vista, setVista] = useState<VistaIdentidades>("duplicados");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<GrupoDuplicado | null>(null);
  const [undo, setUndo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const state = useIdentidadesData(vista, page, search, revision);
  const refresh = () => setRevision((n) => n + 1);
  const scanRunning =
    state.duplicates?.scan?.status === "queued" ||
    state.duplicates?.scan?.status === "running";
  useEffect(() => {
    if (!scanRunning || vista !== "duplicados") return;
    const timer = setInterval(() => setRevision((n) => n + 1), 4000);
    return () => clearInterval(timer);
  }, [scanRunning, vista]);
  const changeView = (v: VistaIdentidades) => {
    setVista(v);
    setPage(1);
    setSelected(null);
    setActionError(null);
  };
  const mutate = async (operation: () => Promise<unknown>) => {
    setBusy(true);
    setActionError(null);
    setSuccess(false);
    try {
      await operation();
      setSuccess(true);
      refresh();
      return true;
    } catch (error) {
      setActionError(t(`errores.${claveErrorIdentidades(error)}`));
      return false;
    } finally {
      setBusy(false);
    }
  };
  const actions = (
    <>
      {vista === "historial" && !state.forbidden && (
        <ExportarFusiones disabled={busy || state.loading || !!state.error} />
      )}
      {state.duplicates?.canMerge && (
        <button
          className={clasesBoton({ patron: "button", variante: "secundario" })}
          disabled={busy}
          onClick={() =>
            changeView(vista === "historial" ? "duplicados" : "historial")
          }
        >
          <History className="size-4" aria-hidden="true" />
          {t(vista === "historial" ? "volver" : "historial")}
        </button>
      )}
      {!selected && (
        <button
          className={clasesBoton({
            patron: "button",
            variante: state.duplicates?.canMerge ? "primario" : "secundario",
          })}
          disabled={busy || scanRunning}
          onClick={() =>
            state.duplicates?.canMerge
              ? void mutate(iniciarBusqueda)
              : refresh()
          }
        >
          <RefreshCw className="size-4" aria-hidden="true" />
          {t(state.duplicates?.canMerge ? "buscarAhora" : "actualizar")}
        </button>
      )}
    </>
  );
  return (
    <div className="space-y-4 p-4 md:p-6">
      {!selected && (
        <PageHeader
          titulo={t(
            selected
              ? "comparar"
              : vista === "historial"
                ? "historial"
                : "titulo",
          )}
          subtitulo={t(vista === "historial" ? "avisoHistorial" : "subtitulo")}
          icono={Merge}
          migas={[
            { etiqueta: "CRM", href: "/app/crm" },
            { etiqueta: t("titulo") },
          ]}
          acciones={actions}
          debajo={
            <div className="flex flex-wrap gap-2 lg:hidden">{actions}</div>
          }
        />
      )}
      {actionError && (
        <p
          role="alert"
          className="rounded-lg border border-line-danger bg-danger-subtle p-3 text-sm text-danger-text"
        >
          {actionError}
        </p>
      )}
      {success && (
        <p
          role="status"
          className="rounded-lg bg-success-subtle p-3 text-sm text-success-text"
        >
          {t("completado")}
        </p>
      )}
      {selected ? (
        <FusionClientesPanel
          key={selected.customers.map((c) => c.id).join(":")}
          group={selected}
          ocupado={busy}
          onCancelar={() => setSelected(null)}
          onFusionar={async (p, s, choices) => {
            if (await mutate(() => fusionarClientes(p, s, choices)))
              setSelected(null);
          }}
        />
      ) : (
        <>
          {vista !== "historial" && (
            <SegmentedControl
              opciones={[
                { valor: "duplicados", etiqueta: t("duplicados") },
                { valor: "canales", etiqueta: t("canales") },
              ]}
              valor={vista}
              onValorChange={changeView}
              etiqueta={t("titulo")}
            />
          )}
          {vista === "duplicados" && (
            <>
              <KpiStrip columnas={3}>
                {(["phone", "email", "document"] as const).map((kind) => (
                  <StatCard
                    key={kind}
                    etiqueta={t(`tipos.${kind}`)}
                    valor={state.duplicates?.stats[kind] ?? "—"}
                    cargando={state.loading}
                  />
                ))}
              </KpiStrip>
              <SearchInput
                value={search}
                onChange={(value) => {
                  setSearch(value);
                  setPage(1);
                }}
                etiqueta={t("buscar")}
                placeholder={t("buscar")}
              />
              {scanRunning && (
                <p
                  role="status"
                  className="rounded-lg bg-info-subtle p-3 text-sm text-info-text"
                >
                  {t("buscando")}
                </p>
              )}
              {state.duplicates?.scan?.status === "failed" && (
                <p role="alert" className="text-sm text-danger-text">
                  {t("errorBusqueda")}
                </p>
              )}
            </>
          )}
          {state.loading ? (
            <div aria-label={t("cargando")} className="space-y-3">
              {[1, 2, 3].map((n) => (
                <Skeleton key={n} className="h-24 rounded-xl" />
              ))}
            </div>
          ) : state.error ? (
            <EmptyState
              variante={state.forbidden ? "forbidden" : "error"}
              onReintentar={refresh}
            />
          ) : state.total === 0 ? (
            <EmptyState
              variante={search ? "search" : "empty"}
              titulo={t(
                vista === "duplicados"
                  ? "sinDuplicados"
                  : vista === "historial"
                    ? "sinFusiones"
                    : "sinIdentidades",
              )}
              onLimpiarFiltros={() => setSearch("")}
              accion={
                vista === "duplicados"
                  ? { etiqueta: t("actualizar"), onClick: refresh }
                  : undefined
              }
            />
          ) : (
            <>
              {vista === "duplicados" && (
                <DuplicadosPanel
                  groups={state.duplicates?.data ?? []}
                  canMerge={state.duplicates?.canMerge ?? false}
                  ocupado={busy}
                  onComparar={setSelected}
                  onExcluir={(group) =>
                    void mutate(() =>
                      excluirPar(group.customers[0].id, group.customers[1].id),
                    )
                  }
                />
              )}
              {vista === "historial" && (
                <HistorialFusiones
                  rows={state.merges}
                  canUndo={state.duplicates?.canUndo ?? false}
                  ocupado={busy}
                  onDeshacer={setUndo}
                />
              )}
              {vista === "canales" && (
                <IdentidadesCanal
                  rows={state.identities}
                  canEdit={state.canEdit}
                  ocupado={busy}
                  onEditar={(id, value, verified) =>
                    mutate(() => editarIdentidad(id, value, verified))
                  }
                  onEliminar={(id) => mutate(() => eliminarIdentidad(id))}
                />
              )}
              <Pagination
                pagina={page}
                tamano={25}
                total={state.total}
                onPaginaChange={setPage}
              />
            </>
          )}
        </>
      )}
      <Dialogo
        abierto={!!undo}
        onAbiertoChange={() => !busy && setUndo(null)}
        titulo={t("deshacer")}
        descripcion={t("avisoDeshacer")}
        primario={{
          etiqueta: t("deshacer"),
          cargando: busy,
          onClick: async () => {
            if (undo && (await mutate(() => deshacerFusion(undo))))
              setUndo(null);
          },
        }}
      />
    </div>
  );
}
export function IdentidadesPage() {
  const { organization } = useOrganization();
  return <IdentidadesContenido key={organization?.id ?? 0} />;
}
