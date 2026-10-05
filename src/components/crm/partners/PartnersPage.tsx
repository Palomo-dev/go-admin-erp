"use client";

import { useLocaleIntl } from "@/components/kit/useIdiomaKit";
import { useRedText } from "@/components/crm/red/useRedText";

/**
 * /app/crm/partners — partners de la organización (FASE-12, brief UX). Una
 * acción principal («Nuevo partner»), búsqueda y filtro arriba, tarjetas con
 * tier/tasa/deals/comisión, deals y transiciones en hoja lateral, tiers en
 * otra. Rutas: `/api/crm/partners/**`; el navegador no escribe en la base y
 * ninguna comisión es dinero movido.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, RefreshCw, Download } from "lucide-react";
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
import { sortPartnerDirectory } from "./partnerDirectorySort";
import type { OrdenListado } from "@/components/kit/listadoUrl";
import { PartnersStats } from "./PartnersStats";
import { PartnersFilters } from "./PartnersFilters";
import { PartnersDirectoryState } from "./PartnersDirectoryState";
import { useTranslations } from "next-intl";
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

export function PartnersPage({
  partnerId,
  initialRegisterDeal = false,
}: { partnerId?: string; initialRegisterDeal?: boolean } = {}) {
  const router = useRouter();
  const { tr } = useRedText();
  const locale = useLocaleIntl();
  const tv = useTranslations("crm.partnersVisual");
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
  const [order, setOrder] = useState<OrdenListado | null>(null);
  const [size, setSize] = useState(25);
  const [statusFilter, setStatusFilter] = useState<
    "all" | "active" | "inactive"
  >("active");
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
      sortPartnerDirectory(
        filterPartners(partners, filters)
          .filter((p) => tierFilter === "all" || p.tier_id === tierFilter)
          .filter(
            (p) =>
              statusFilter === "all" ||
              p.is_active === (statusFilter === "active"),
          ),
        order,
        locale,
      ),
    [partners, filters, tierFilter, statusFilter, order, locale],
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
        subtitulo={tv("subtitulo")}
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
      {tab === "partners" && (loading || (loaded && partners.length > 0)) && (
        <PartnersStats stats={stats} loading={loading} />
      )}
      {statsError && loaded && partners.length > 0 && (
        <Alert variant="destructive">
          <AlertDescription>
            {tr("No se pudieron cargar las cifras")}
          </AlertDescription>
        </Alert>
      )}
      {error && loaded && (
        <Alert variant="destructive">
          <AlertTitle>{tr("No se pudo actualizar la lista")}</AlertTitle>
          <AlertDescription>
            {error}. {tr("Se muestra la última lista conocida; pulsa")}{" "}
            {tr("«Actualizar» para reintentar.")}
          </AlertDescription>
        </Alert>
      )}
      {tab === "partners" &&
        (loading || (!loaded && !!error) || partners.length > 0) && (
          <PartnersFilters
            query={filters.q}
            onQuery={(v) => setFilters({ ...filters, q: v })}
            status={statusFilter}
            onStatus={(v) => {
              setFilters({ ...filters, onlyActive: false });
              setStatusFilter(v);
            }}
            tier={tierFilter}
            onTier={setTierFilter}
            tiers={tiers}
            disabled={loading || (!loaded && !!error)}
          />
        )}

      <div
        role="tabpanel"
        id={idPanel("partners", tab)}
        aria-labelledby={idPestana("partners", tab)}
      >
        {tab === "deals" || tab === "commissions" ? (
          <PartnerNetworkDeals
            partners={partners}
            commissionsOnly={tab === "commissions"}
            tiers={tiers}
            baseCurrency={stats?.base_currency ?? null}
            onTiers={() => setTiersOpen(true)}
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
        ) : loading || (!loaded && !!error) || partners.length === 0 ? (
          <PartnersDirectoryState
            state={loading ? "loading" : !loaded && error ? "error" : "empty"}
            canManage={canManage}
            onCreate={() => openEditor(null)}
            onTiers={() => setTiersOpen(true)}
            onRetry={() => void refresh()}
          />
        ) : (
          <>
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
                tiers={tiers}
                order={order}
                onSort={(field) => {
                  setOrder((previous) => ({
                    campo: field,
                    direccion:
                      previous?.campo === field && previous.direccion === "asc"
                        ? "desc"
                        : "asc",
                  }));
                  setPage(1);
                }}
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
