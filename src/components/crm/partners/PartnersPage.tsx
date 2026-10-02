"use client";

import { useRedText } from "@/components/crm/red/useRedText";

/**
 * /app/crm/partners — partners de la organización (FASE-12, brief UX). Una
 * acción principal («Nuevo partner»), búsqueda y filtro arriba, tarjetas con
 * tier/tasa/deals/comisión, deals y transiciones en hoja lateral, tiers en
 * otra. Rutas: `/api/crm/partners/**`; el navegador no escribe en la base y
 * ninguna comisión es dinero movido.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Award, Plus, RefreshCw, Download } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/crm/red/RedButton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/use-toast";
import { FadeIn } from "@/components/shared/motion";
import {
  PageHeader,
  TabBar,
  idPanel,
  idPestana,
  DataTable,
  EmptyState,
} from "@/components/kit";
import { RedStats } from "../red/RedStats";
import { PartnerTable } from "./PartnerTable";
import { PartnerNetworkDeals } from "./PartnerNetworkDeals";
import { filasACsv } from "@/lib/utils/csv";
import { formatMoney, formatRate } from "@/lib/services/crm/partnerModel";
import { useReturnFocus } from "@/lib/hooks/useReturnFocus";
import type { PartnerView } from "@/lib/services/crm/partnerService";
import {
  EMPTY_PARTNER_FILTERS,
  filterPartners,
  type PartnerListFilters,
} from "@/lib/services/crm/partnerModel";
import { PartnerDealList } from "./PartnerDealList";
import { PartnerEditor } from "./PartnerEditor";
import { TierEditor } from "./TierEditor";
import { usePartners } from "./usePartners";
import { SearchInput } from "@/components/kit/SearchInput";

export function PartnersPage({
  partnerId,
  initialRegisterDeal = false,
}: { partnerId?: string; initialRegisterDeal?: boolean } = {}) {
  const router = useRouter();
  const { tr, locale } = useRedText();
  const {
    partners,
    tiers,
    canManage,
    canRegister,
    stats,
    statsError,
    loading,
    loaded,
    error,
    reload,
    savePartner,
    deletePartner,
    saveTier,
    deleteTier,
    loadDeals,
    registerDeal,
    transitionDeal,
  } = usePartners();
  const [tab, setTab] = useState<
    "partners" | "deals" | "commissions" | "levels"
  >("partners");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const [statusFilter, setStatusFilter] = useState<
    "all" | "active" | "inactive"
  >("all");
  const [tierFilter, setTierFilter] = useState("all");
  const [filters, setFilters] = useState<PartnerListFilters>(
    EMPTY_PARTNER_FILTERS,
  );
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<PartnerView | null>(null);
  const [tiersOpen, setTiersOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PartnerView | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const newButtonRef = useRef<HTMLButtonElement>(null);
  const tiersButtonRef = useRef<HTMLButtonElement>(null);
  const fallback = () => newButtonRef.current;
  const onDeleteClose = useReturnFocus(deleteTarget !== null, fallback);

  const shown = useMemo(
    () =>
      filterPartners(partners, filters)
        .filter((p) => tierFilter === "all" || p.tier_id === tierFilter)
        .filter(
          (p) =>
            statusFilter === "all" ||
            p.is_active === (statusFilter === "active"),
        ),
    [partners, filters, tierFilter, statusFilter],
  );
  useEffect(() => {
    setPage(1);
  }, [filters, tierFilter, statusFilter, size]);
  const currentPage = Math.min(
    page,
    Math.max(1, Math.ceil(shown.length / size)),
  );

  const openEditor = (p: PartnerView | null) => {
    setEditing(p);
    setEditorOpen(true);
  };

  const onDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deletePartner(deleteTarget.id);
      toast({
        title: tr("Partner «{p0}» eliminado", { p0: deleteTarget.name }),
      });
    } catch (err) {
      toast({
        title: tr("No se pudo eliminar"),
        description:
          err instanceof Error ? err.message : tr("Error desconocido"),
        variant: "destructive",
      });
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      await reload();
    } finally {
      setRefreshing(false);
    }
  };

  if (partnerId) {
    const partner = partners.find((p) => p.id === partnerId);
    return (
      <div className="space-y-4 p-4 lg:p-6">
        {loading ? (
          <div aria-busy="true">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="mb-4 h-28 rounded-xl" />
            ))}
          </div>
        ) : error ? (
          <EmptyState
            variante="error"
            titulo={tr("No se pudieron cargar los partners")}
            descripcion={error}
            onReintentar={() => void refresh()}
          />
        ) : partner ? (
          <PartnerDealList
            presentation="page"
            initialRegister={initialRegisterDeal}
            open
            partner={partner}
            tiers={tiers}
            canManage={canManage}
            canRegister={canRegister}
            onEdit={() => openEditor(partner)}
            onOpenChange={(o) => !o && router.push("/app/crm/partners")}
            loadDeals={loadDeals}
            onRegister={registerDeal}
            onTransition={transitionDeal}
            returnFocusFallback={fallback}
          />
        ) : (
          <EmptyState
            titulo={tr("Partner no encontrado")}
            accion={{
              etiqueta: tr("Partners"),
              onClick: () => router.push("/app/crm/partners"),
            }}
          />
        )}
        <PartnerEditor
          open={editorOpen}
          partner={editing}
          tiers={tiers}
          onOpenChange={setEditorOpen}
          onSave={savePartner}
          returnFocusFallback={fallback}
        />
      </div>
    );
  }
  return (
    <div className="space-y-4 p-4 lg:p-6">
      <PageHeader
        titulo={tr("Partners")}
        migas={[
          { etiqueta: "CRM", href: "/app/crm" },
          { etiqueta: tr("Partners") },
        ]}
        cargando={loading || refreshing}
        subtitulo={tr(
          "Consultores, integradores y revendedores que traen deals.",
        )}
        movil={{
          accion: canManage ? (
            <Button
              size="icon"
              variant="ghost"
              aria-label={tr("Nuevo partner")}
              onClick={() => openEditor(null)}
            >
              <Plus className="size-5" />
            </Button>
          ) : undefined,
        }}
        acciones={
          <div className="flex gap-2">
            <Button
              variant="outline"
              aria-label={tr("Actualizar")}
              disabled={refreshing}
              onClick={() => void refresh()}
            >
              <RefreshCw className="size-4" />
            </Button>
            <Button
              variant="outline"
              disabled={loading || !loaded || !!error}
              onClick={() => {
                const csv = filasACsv(
                  [
                    tr("Nombre"),
                    tr("Empresa (opcional)"),
                    tr("Correo"),
                    tr("Tier"),
                    tr("Comisión"),
                    tr("Deals"),
                    tr("Por pagar"),
                    tr("Estado"),
                  ],
                  shown.map((p) => [
                    p.name,
                    p.company_name,
                    p.email,
                    p.tier?.name,
                    formatRate(p.effective_rate, locale),
                    p.deals_count,
                    !p.currency_mixed && p.commissions_currency
                      ? formatMoney(
                          p.commissions.outstanding,
                          p.commissions_currency,
                          locale,
                        )
                      : "",
                    tr(p.is_active ? "Activo" : "Inactivo"),
                  ]),
                );
                const url = URL.createObjectURL(
                  new Blob([csv], { type: "text/csv;charset=utf-8" }),
                );
                const link = document.createElement("a");
                link.href = url;
                link.download = "partners.csv";
                link.click();
                URL.revokeObjectURL(url);
              }}
            >
              <Download className="size-4" />
              {tr("Exportar")}
            </Button>
            {canManage && (
              <Button ref={newButtonRef} onClick={() => openEditor(null)}>
                <Plus className="size-4" />
                {tr("Nuevo partner")}
              </Button>
            )}
          </div>
        }
        debajo={
          <TabBar
            id="partners"
            valor={tab}
            onValorChange={setTab}
            etiqueta={tr("Partners")}
            pestanas={[
              {
                valor: "partners",
                etiqueta: tr("Partners"),
                contador: partners.length,
              },
              { valor: "deals", etiqueta: tr("Deals") },
              { valor: "commissions", etiqueta: tr("Comisiones") },
              {
                valor: "levels",
                etiqueta: tr("Niveles"),
                contador: tiers.length,
              },
            ]}
          />
        }
      />
      <RedStats
        kind="partners"
        stats={stats}
        loading={loading}
        error={statsError}
      />
      {statsError && (
        <Alert variant="destructive">
          <AlertDescription>
            {tr("No se pudieron cargar las cifras")}
          </AlertDescription>
        </Alert>
      )}

      {error &&
        (!loaded ? (
          <EmptyState
            variante="error"
            titulo={tr("No se pudieron cargar los partners")}
            descripcion={error}
            onReintentar={() => void refresh()}
          />
        ) : (
          <Alert variant="destructive">
            <AlertTitle>
              {loaded
                ? tr("No se pudo actualizar la lista")
                : tr("No se pudieron cargar los partners")}
            </AlertTitle>
            <AlertDescription>
              {error}.{" "}
              {loaded
                ? tr("Se muestra la última lista conocida; pulsa")
                : tr("Pulsa")}{" "}
              {tr("«Actualizar» para reintentar.")}
            </AlertDescription>
          </Alert>
        ))}

      <div
        role="tabpanel"
        id={idPanel("partners", tab)}
        aria-labelledby={idPestana("partners", tab)}
      >
        {tab === "deals" || tab === "commissions" ? (
          <PartnerNetworkDeals
            partners={partners}
            commissionsOnly={tab === "commissions"}
            canManage={canManage}
            loadDeals={loadDeals}
            transition={transitionDeal}
          />
        ) : tab === "levels" ? (
          <div className="space-y-3">
            <DataTable
              etiqueta={tr("Niveles")}
              filas={tiers}
              obtenerId={(r) => r.id}
              columnas={[
                { id: "name", encabezado: tr("Nombre"), celda: (r) => r.name },
                {
                  id: "deals",
                  encabezado: tr("Deals mínimos"),
                  variante: "importe",
                  celda: (r) => r.min_deals,
                },
                {
                  id: "revenue",
                  encabezado: tr("Revenue mínimo"),
                  variante: "importe",
                  celda: (r) =>
                    stats?.base_currency
                      ? formatMoney(r.min_revenue, stats.base_currency, locale)
                      : "—",
                },
                {
                  id: "rate",
                  encabezado: tr("Comisión"),
                  variante: "importe",
                  celda: (r) => formatRate(r.commission_rate, locale),
                },
              ]}
            />
            <Button
              ref={tiersButtonRef}
              variant="outline"
              onClick={() => setTiersOpen(true)}
            >
              {tr(canManage ? "Editar" : "Niveles")}
            </Button>
          </div>
        ) : loading ? (
          <div
            className="space-y-4"
            aria-busy="true"
            aria-label={tr("Cargando partners")}
          >
            <Skeleton className="h-9 w-full max-w-md" />
            <div className="overflow-hidden rounded-xl border border-line bg-surface">
              <Skeleton className="h-10 w-full rounded-none" />
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="grid h-16 grid-cols-3 items-center gap-6 border-t border-line px-4"
                >
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              ))}
            </div>
          </div>
        ) : partners.length === 0 && (loaded || !error) ? (
          <FadeIn className="mx-auto max-w-xl rounded-xl border border-line bg-surface p-8 text-center shadow-sm  ">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-subtle ">
              <Award className="h-7 w-7 text-brand " aria-hidden="true" />
            </div>
            <h2 className="mt-4 text-lg font-semibold text-fg ">
              {tr("Vende con quien ya vende")}
            </h2>
            <p className="mt-1 text-sm text-fg-secondary ">
              {tr(
                "Da de alta a un consultor o integrador, asígnale un tier y registra los deals que trae: la comisión se calcula sola y el tier sube con los resultados.",
              )}
            </p>
            <Button
              type="button"
              className="mt-5 "
              disabled={!canManage}
              onClick={() => openEditor(null)}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />{" "}
              {tr("Crear el primer partner")}
            </Button>
          </FadeIn>
        ) : partners.length === 0 ? null : (
          <>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <SearchInput
                  value={filters.q}
                  onChange={(v) => setFilters({ ...filters, q: v })}
                  onValueChange={(v) => setFilters({ ...filters, q: v })}
                  placeholder={tr("Nombre, empresa, correo o tier")}
                  id="partners-search"
                />
              </div>
              <select
                className="h-10 rounded-lg border border-line-strong bg-surface px-3 text-sm"
                aria-label={tr("Estado")}
                value={statusFilter}
                onChange={(e) => {
                  setFilters({ ...filters, onlyActive: false });
                  setStatusFilter(e.target.value as typeof statusFilter);
                }}
              >
                <option value="all">{tr("Estado: todos")}</option>
                <option value="active">{tr("Activo")}</option>
                <option value="inactive">{tr("Inactivo")}</option>
              </select>
              <select
                className="h-10 rounded-lg border border-line-strong bg-surface px-3 text-sm"
                aria-label={tr("Tier")}
                value={tierFilter}
                onChange={(e) => setTierFilter(e.target.value)}
              >
                <option value="all">{tr("Nivel: todos")}</option>
                {tiers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <p className="sr-only" aria-live="polite">
                {shown.length === partners.length
                  ? tr("{p0} partner{p1}", {
                      p0: partners.length,
                      p1: partners.length === 1 ? "" : "s",
                    })
                  : tr("{p0} de {p1} partners", {
                      p0: shown.length,
                      p1: partners.length,
                    })}
              </p>
            </div>
            {shown.length === 0 ? (
              <FadeIn className="rounded-xl border border-dashed border-line-strong p-8 text-center ">
                <p className="font-medium text-fg ">
                  {tr("Ningún partner coincide con los filtros")}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-3"
                  onClick={() => {
                    setFilters(EMPTY_PARTNER_FILTERS);
                    setTierFilter("all");
                    setStatusFilter("all");
                  }}
                >
                  {tr("Quitar filtros")}
                </Button>
              </FadeIn>
            ) : (
              <PartnerTable
                rows={shown.slice((currentPage - 1) * size, currentPage * size)}
                total={shown.length}
                page={currentPage}
                size={size}
                onPage={setPage}
                onSize={setSize}
                canManage={canManage}
                canRegister={canRegister}
                onEdit={openEditor}
                onRegisterDeal={(p) =>
                  router.push(
                    `/app/crm/partners/${encodeURIComponent(p.id)}?registrar=1`,
                  )
                }
                onDeals={(p) =>
                  router.push(`/app/crm/partners/${encodeURIComponent(p.id)}`)
                }
                onDelete={setDeleteTarget}
              />
            )}
          </>
        )}
      </div>

      <PartnerEditor
        open={editorOpen}
        partner={editing}
        tiers={tiers}
        onOpenChange={setEditorOpen}
        onSave={savePartner}
        returnFocusFallback={fallback}
      />
      <TierEditor
        open={tiersOpen}
        tiers={tiers}
        canManage={canManage}
        onOpenChange={setTiersOpen}
        onSave={saveTier}
        onDelete={deleteTier}
        returnFocusFallback={() => tiersButtonRef.current}
      />
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null);
        }}
        title={tr("Eliminar partner")}
        description={tr(
          "Se eliminará «{p0}» y sus {p1} deal{p2} con sus comisiones registradas. Esta acción no se puede deshacer.",
          {
            p0: deleteTarget?.name ?? "",
            p1: deleteTarget?.commissions.count ?? 0,
            p2: deleteTarget?.commissions.count === 1 ? "" : "s",
          },
        )}
        confirmLabel={tr("Eliminar")}
        variant="destructive"
        onConfirm={onDelete}
        onCloseAutoFocus={onDeleteClose}
      />
    </div>
  );
}
