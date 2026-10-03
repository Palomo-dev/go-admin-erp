"use client";

import { useTranslations } from "next-intl";
import { useLocaleIntl } from "@/components/kit/useIdiomaKit";
import { useRedText } from "@/components/crm/red/useRedText";

/**
 * Deals de un partner en hoja lateral: tabla (datos tabulares reales, brief
 * §3) con oportunidad, tipo, comisión y estado, más las transiciones que la
 * máquina permite (`pending → approved → paid | rejected`), solo para
 * admin/manager (`can_manage` lo decide el servidor; el botón oculto no es la
 * barrera). «Registrar pago» es un registro: no se mueve dinero.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Briefcase, Plus, RefreshCw, Pencil } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/crm/red/RedButton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/use-toast";
import { useReturnFocus } from "@/lib/hooks/useReturnFocus";
import {
  nextCommissionStatuses,
  type CommissionStatus,
} from "@/lib/services/crm/partnerCommission";
import type {
  PartnerDealInput,
  PartnerDealView,
  PartnerView,
  RegisterDealResult,
} from "@/lib/services/crm/partnerService";
import { formatMoney, formatRate } from "@/lib/services/crm/partnerModel";
import { cn } from "@/utils/Utils";
import { PartnerDealTable, dealActionId } from "./PartnerDealTable";
import { RegisterDealDialog } from "./RegisterDealDialog";
import { PageHeader, TabBar, idPanel, idPestana } from "@/components/kit";
import { PartnerSummary } from "./PartnerSummary";
import type { PartnerTier } from "@/lib/services/crm/partnerService";
import { COMMISSION_META } from "./partnerMeta";

interface Props {
  presentation?: "sheet" | "page";
  initialRegister?: boolean;
  tiers?: PartnerTier[];
  onEdit?: () => void;
  open: boolean;
  partner: PartnerView | null;
  canManage: boolean;
  canRegister?: boolean;
  onOpenChange: (open: boolean) => void;
  loadDeals: (partnerId: string) => Promise<PartnerDealView[]>;
  onRegister: (
    partnerId: string,
    payload: PartnerDealInput,
  ) => Promise<RegisterDealResult>;
  onTransition: (
    partnerId: string,
    dealId: string,
    status: CommissionStatus,
  ) => Promise<PartnerDealView>;
  returnFocusFallback: () => HTMLElement | null;
}

export function PartnerDealList({
  open,
  partner,
  canManage,
  canRegister = true,
  onOpenChange,
  loadDeals,
  onRegister,
  onTransition,
  returnFocusFallback,
  presentation = "sheet",
  tiers = [],
  onEdit,
  initialRegister = false,
}: Props) {
  const { tr } = useRedText();
  const tv = useTranslations("crm.partnersVisual");
  const locale = useLocaleIntl();
  const canRegisterDeal = canRegister && !!partner?.is_active;
  const [tab, setTab] = useState<"deals" | "commissions" | "data">("deals");
  const [deals, setDeals] = useState<PartnerDealView[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registerOpen, setRegisterOpen] = useState(
    initialRegister && canRegisterDeal,
  );
  const [confirm, setConfirm] = useState<{
    deal: PartnerDealView;
    to: CommissionStatus;
  } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const registerButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseAutoFocus = useReturnFocus(open, returnFocusFallback);
  // Tras confirmar, el botón pulsado desaparece (cambia el estado): el foco va al
  // siguiente botón de la misma fila y, si no hay (terminal), a «Registrar deal».
  const nextActionId = useRef<string | null>(null);
  const onConfirmClose = useReturnFocus(
    confirm !== null,
    () =>
      (nextActionId.current
        ? document.getElementById(nextActionId.current)?.offsetParent
          ? document.getElementById(nextActionId.current)
          : document.getElementById(
              nextActionId.current.replace("deal-", "deal-mobile-"),
            )
        : null) ?? registerButtonRef.current,
  );

  const loadRevision = useRef(0);
  const load = useCallback(async () => {
    if (!partner) return;
    const current = ++loadRevision.current;
    setLoading(true);
    setError(null);
    try {
      const result = await loadDeals(partner.id);
      if (current === loadRevision.current) setDeals(result);
    } catch (err) {
      if (current === loadRevision.current)
        setError(err instanceof Error ? err.message : tr("Error desconocido"));
    } finally {
      if (current === loadRevision.current) setLoading(false);
    }
  }, [partner, loadDeals, tr]);

  useEffect(() => {
    if (open) void load();
    return () => {
      loadRevision.current += 1;
    };
  }, [open, load]);

  const apply = async () => {
    if (!partner || !confirm) return;
    setBusyId(confirm.deal.id);
    try {
      const row = await onTransition(partner.id, confirm.deal.id, confirm.to);
      setDeals((prev) => prev.map((d) => (d.id === row.id ? row : d)));
      const next = nextCommissionStatuses(row.commission_status)[0];
      nextActionId.current = next ? dealActionId(row.id, next) : null;
      toast({
        title: tr("Comisión {p0}", {
          p0: tr(COMMISSION_META[confirm.to].label).toLowerCase(),
        }),
        description: tr("{p0} · {p1}{p2}", {
          p0: confirm.deal.opportunity?.name ?? "Deal",
          p1: formatMoney(
            confirm.deal.commission_amount,
            confirm.deal.opportunity?.currency ?? null,
            locale,
          ),
          p2:
            confirm.to === "paid"
              ? tr(". Es un registro: aquí no se mueve dinero.")
              : "",
        }),
      });
    } catch (err) {
      toast({
        title: tr("No se pudo cambiar la comisión"),
        description:
          err instanceof Error ? err.message : tr("Error desconocido"),
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  };

  const content = (
    <>
      {presentation === "page" && partner && (
        <>
          <PageHeader
            className="contents lg:flex"
            titulo={partner.name}
            subtitulo={[partner.company_name, partner.email, partner.phone]
              .filter(Boolean)
              .join(" · ")}
            migas={[
              { etiqueta: "CRM", href: "/app/crm" },
              { etiqueta: tr("Partners"), href: "/app/crm/partners" },
              { etiqueta: partner.name },
            ]}
            movil={{
              subtitulo: [partner.company_name, partner.tier?.name]
                .filter(Boolean)
                .join(" · "),
              accion: canRegisterDeal ? (
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={tr("Registrar deal")}
                  onClick={() => setRegisterOpen(true)}
                >
                  <Plus className="size-5" />
                </Button>
              ) : undefined,
            }}
            acciones={
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={tr("Actualizar deals")}
                  disabled={loading}
                  onClick={() => void load()}
                >
                  <RefreshCw
                    className={cn(
                      "h-4 w-4",
                      loading && "motion-safe:animate-spin",
                    )}
                    aria-hidden="true"
                  />
                </Button>
                {canManage && onEdit && (
                  <Button variant="outline" onClick={onEdit}>
                    <Pencil className="size-4" />
                    {tr("Editar")}
                  </Button>
                )}
                {canRegisterDeal && (
                  <Button
                    ref={registerButtonRef}
                    onClick={() => setRegisterOpen(true)}
                  >
                    <Briefcase className="size-4" />
                    {tr("Registrar deal")}
                  </Button>
                )}
              </div>
            }
          />
          <PartnerSummary partner={partner} tiers={tiers} />
          <TabBar
            className="hidden lg:flex"
            id="partner-detail"
            valor={tab}
            onValorChange={setTab}
            etiqueta={tr("Partners")}
            pestanas={[
              { valor: "deals", etiqueta: tr("Deals"), contador: deals.length },
              { valor: "commissions", etiqueta: tr("Comisiones") },
              { valor: "data", etiqueta: tr("Datos del partner") },
            ]}
          />
        </>
      )}
      {presentation === "sheet" && (
        <SheetHeader className="border-b border-line bg-surface px-6 py-4  ">
          <SheetTitle className="text-fg ">
            {tr("Deals de")} {partner?.name}
          </SheetTitle>
          <SheetDescription className="text-fg-secondary ">
            {partner?.tier ? tr("Tier {p0} · ", { p0: partner.tier.name }) : ""}
            {tr("comisión")}{" "}
            {partner ? formatRate(partner.effective_rate, locale) : ""}
            {tr(
              ". La comisión es un registro por deal; aprobarla o marcarla pagada no mueve dinero.",
            )}{" "}
          </SheetDescription>
        </SheetHeader>
      )}
      <div
        className={
          presentation === "page" ? "space-y-4" : "space-y-4 px-6 py-4"
        }
        role={presentation === "page" ? "tabpanel" : undefined}
        id={
          presentation === "page" ? idPanel("partner-detail", tab) : undefined
        }
        aria-labelledby={
          presentation === "page" ? idPestana("partner-detail", tab) : undefined
        }
      >
        {tab === "data" && partner ? (
          <dl className="grid gap-4 rounded-xl border border-line bg-surface p-4 sm:grid-cols-2">
            {[
              [tr("Nombre"), partner.name],
              [tr("Empresa (opcional)"), partner.company_name],
              [tr("Correo"), partner.email],
              [tr("Teléfono"), partner.phone],
              [tr("Tier"), partner.tier?.name],
              [tr("Comisión"), formatRate(partner.effective_rate, locale)],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-fg-secondary">{label}</dt>
                <dd className="mt-1 break-words text-sm text-fg">
                  {value ?? "—"}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <>
            <h2 className="text-sm font-medium lg:hidden">
              {tv("dealsRegistrados")}
            </h2>
            <div className={presentation === "page" ? "hidden" : "hidden flex-wrap items-center justify-end gap-2 lg:flex"}>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={tr("Actualizar deals")}
                  disabled={loading}
                  onClick={() => void load()}
                >
                  <RefreshCw
                    className={cn(
                      "h-4 w-4",
                      loading && "motion-safe:animate-spin",
                    )}
                    aria-hidden="true"
                  />
                </Button>
                {presentation === "sheet" && canRegisterDeal && (
                  <Button
                    ref={registerButtonRef}
                    type="button"
                    size="sm"
                    onClick={() => setRegisterOpen(true)}
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />{" "}
                    {tr("Registrar deal")}{" "}
                  </Button>
                )}
              </div>
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertTitle>{tr("No se pudieron cargar los deals")}</AlertTitle>
                <AlertDescription>
                  {error}
                  {tr(". Pulsa «Actualizar deals» para reintentar.")}
                  <Button className="mt-2 lg:hidden" size="sm" variant="outline" disabled={loading} onClick={() => void load()}>{tr("Actualizar deals")}</Button>
                </AlertDescription>
              </Alert>
            )}
            {loading && deals.length === 0 ? (
              <div
                className="space-y-2"
                aria-busy="true"
                aria-label={tr("Cargando deals")}
              >
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : deals.length === 0 && !error ? (
              <div className="rounded-xl border border-dashed border-line-strong p-6 text-center ">
                <p className="font-medium text-fg ">
                  {tr("Este partner aún no tiene deals")}
                </p>
                <p className="mt-1 text-sm text-fg-secondary ">
                  {tr(
                    "Registra la oportunidad que trajo o ayudó a cerrar y la comisión quedará calculada.",
                  )}
                </p>
              </div>
            ) : (
              <PartnerDealTable
                deals={deals}
                canManage={canManage}
                busyId={busyId}
                onTransition={(deal, to) => setConfirm({ deal, to })}
              />
            )}
          </>
        )}
      </div>
      <RegisterDealDialog
        open={registerOpen}
        partner={partner}
        onOpenChange={setRegisterOpen}
        onRegister={async (id, payload) => {
          const r = await onRegister(id, payload);
          await load();
          return r;
        }}
        returnFocusFallback={() => registerButtonRef.current}
        canAdjust={canManage}
      />
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => {
          if (!o) setConfirm(null);
        }}
        title={
          confirm
            ? tr("{p0} la comisión", { p0: COMMISSION_META[confirm.to].action })
            : ""
        }
        description={
          confirm
            ? tr("{p0} · {p1}. {p2}", {
                p0: confirm.deal.opportunity?.name ?? "Deal",
                p1: formatMoney(
                  confirm.deal.commission_amount,
                  confirm.deal.opportunity?.currency ?? null,
                  locale,
                ),
                p2:
                  confirm.to === "paid"
                    ? tr(
                        "Se anota como pagada con fecha de hoy; no se mueve dinero.",
                      )
                    : confirm.to === "rejected"
                      ? tr("Quedará rechazada y no contará para el tier.")
                      : tr("Quedará aprobada, pendiente de registrar el pago."),
              })
            : ""
        }
        confirmLabel={confirm ? COMMISSION_META[confirm.to].action : ""}
        variant={confirm?.to === "rejected" ? "destructive" : "default"}
        onConfirm={apply}
        onCloseAutoFocus={onConfirmClose}
      />
    </>
  );
  if (presentation === "page")
    return <section className="flex flex-col gap-4">{content}</section>;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        onCloseAutoFocus={onCloseAutoFocus}
        className="flex w-full flex-col gap-0 overflow-y-auto bg-subtle p-0 sm:max-w-2xl"
      >
        {content}
      </SheetContent>
    </Sheet>
  );
}
