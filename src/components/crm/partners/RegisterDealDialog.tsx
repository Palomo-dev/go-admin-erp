"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Briefcase, Info } from "lucide-react";
import { Dialog, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CampoNumero } from "@/components/kit/CampoNumero";
import { SegmentedControl } from "@/components/kit/SegmentedControl";
import { simboloMoneda } from "@/components/crm/kit/camposCrm";
import { contextoMoneda } from "@/lib/utils/moneda";
import { toast } from "@/components/ui/use-toast";
import { useReturnFocus } from "@/lib/hooks/useReturnFocus";
import {
  DEAL_TYPES,
  DEAL_TYPE_LABELS,
  computePartnerCommission,
  type DealType,
} from "@/lib/services/crm/partnerCommission";
import type {
  PartnerDealInput,
  PartnerView,
  RegisterDealResult,
} from "@/lib/services/crm/partnerService";
import { formatMoney, formatRate } from "@/lib/services/crm/partnerModel";
import {
  useOpportunitySearch,
  type OpportunityHit,
} from "@/components/crm/automatizaciones/useOpportunitySearch";
import { Button } from "../red/RedButton";
import { useLocaleIntl } from "@/components/kit/useIdiomaKit";
import { useRedText } from "../red/useRedText";
import { DealOpportunityField } from "./DealOpportunityField";
interface Props {
  open: boolean;
  partner: PartnerView | null;
  canAdjust?: boolean;
  onOpenChange: (open: boolean) => void;
  onRegister: (
    partnerId: string,
    payload: PartnerDealInput,
  ) => Promise<RegisterDealResult>;
  returnFocusFallback: () => HTMLElement | null;
}
export function RegisterDealDialog({
  open,
  partner,
  canAdjust = false,
  onOpenChange,
  onRegister,
  returnFocusFallback,
}: Props) {
  const { tr } = useRedText();
  const locale = useLocaleIntl();
  const t = useTranslations("crm.partnersVisual");
  const [query, setQuery] = useState(""),
    [selected, setSelected] = useState<OpportunityHit | null>(null),
    [dealType, setDealType] = useState<DealType>("referral"),
    [commission, setCommission] = useState<number | null>(null),
    [error, setError] = useState<string | null>(null),
    [fieldError, setFieldError] = useState<string>(),
    [saving, setSaving] = useState(false);
  const latch = useRef(false),
    key = useRef<string | null>(null),
    onCloseAutoFocus = useReturnFocus(open, returnFocusFallback),
    search = useOpportunitySearch(query, open);
  const preview =
    selected && partner && selected.amount != null
      ? computePartnerCommission(selected.amount, partner.effective_rate)
      : null;
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelected(null);
    setDealType("referral");
    setCommission(null);
    setError(null);
    setFieldError(undefined);
    key.current = crypto.randomUUID();
  }, [open, partner?.id]);
  const changed = () => {
    key.current = crypto.randomUUID();
    setError(null);
  };
  const submit = async () => {
    if (!partner || latch.current) return;
    if (!selected) {
      setFieldError(tr("Elige la oportunidad del deal"));
      document.getElementById("deal-opportunity")?.focus();
      return;
    }
    if (
      preview === null ||
      commission === null ||
      !Number.isFinite(commission) ||
      commission < 0 ||
      commission > 1e12
    ) {
      setError(t("importeInvalido"));
      return;
    }
    latch.current = true;
    setSaving(true);
    setError(null);
    try {
      const payload: PartnerDealInput = {
        opportunity_id: selected.id,
        deal_type: dealType,
        idempotency_key: key.current ?? crypto.randomUUID(),
      };
      if (canAdjust && commission !== preview)
        payload.commission_amount = commission;
      const result = await onRegister(partner.id, payload);
      toast({
        title: tr("Deal registrado"),
        description: tr("Comisión {p0} ({p1}), pendiente de aprobar.{p2}", {
          p0: formatMoney(
            result.deal.commission_amount,
            result.deal.opportunity?.currency ?? null,
            locale,
          ),
          p1: formatRate(result.commission_rate, locale),
          p2: result.promoted_to
            ? tr(" {p0} sube al tier {p1}.", {
                p0: partner.name,
                p1: result.promoted_to.name,
              })
            : "",
        }),
      });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : tr("Error desconocido"));
    } finally {
      latch.current = false;
      setSaving(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!latch.current) onOpenChange(next);
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-fg/45" />
        <DialogPrimitive.Content
          onCloseAutoFocus={onCloseAutoFocus}
          onEscapeKeyDown={(e) => {
            if (saving) e.preventDefault();
          }}
          onPointerDownOutside={(e) => {
            if (saving) e.preventDefault();
          }}
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-32px)] w-[calc(100%-32px)] max-w-[560px] -translate-x-1/2 -translate-y-1/2 flex-col gap-5 overflow-y-auto rounded-xl border border-line bg-surface p-6 text-fg shadow-xl"
        >
          <div className="space-y-2">
            <DialogTitle className="text-lg font-semibold">
              {tr("Registrar deal")}
            </DialogTitle>
            <DialogDescription className="text-sm leading-5 text-fg-secondary">
              {t("registroDetalle", { name: partner?.name ?? "" })}
            </DialogDescription>
          </div>
          <form
            className="space-y-5"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <DealOpportunityField
              selected={selected}
              query={query}
              onQuery={setQuery}
              hits={search.hits}
              loading={search.loading}
              error={search.error}
              fieldError={fieldError}
              disabled={saving}
              onSelect={(hit) => {
                changed();
                setSelected(hit);
                setCommission(
                  hit.amount != null && partner
                    ? computePartnerCommission(
                        hit.amount,
                        partner.effective_rate,
                      )
                    : null,
                );
                setFieldError(undefined);
              }}
            />
            <div className="space-y-2">
              <span className="block text-sm font-medium">
                {tr("Tipo de deal")}
              </span>
              <SegmentedControl
                opciones={DEAL_TYPES.map((type) => ({
                  valor: type,
                  etiqueta: tr(DEAL_TYPE_LABELS[type]),
                }))}
                valor={dealType}
                onValorChange={(v) => {
                  changed();
                  setDealType(v);
                }}
                etiqueta={tr("Tipo de deal")}
                deshabilitado={saving}
                tamano="sm"
                className="gap-2 bg-transparent p-0 [&_button]:rounded-full [&_button]:border [&_button]:border-line-strong [&_button]:bg-surface [&_button[aria-checked=true]]:border-line-brand [&_button[aria-checked=true]]:bg-brand-tint [&_button[aria-checked=true]]:text-brand-deep"
              />
            </div>
            <dl className="space-y-2 rounded-lg bg-brand-tint p-4 text-xs">
              <div className="flex justify-between gap-3">
                <dt className="text-fg-secondary">{t("montoOportunidad")}</dt>
                <dd>
                  {selected?.amount != null
                    ? formatMoney(selected.amount, selected.currency, locale)
                    : "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-fg-secondary">
                  {t("tasaEfectiva")}
                  {partner?.tier ? ` · ${partner.tier.name}` : ""}
                </dt>
                <dd>
                  {partner ? formatRate(partner.effective_rate, locale) : "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-fg-secondary">{t("comisionSugerida")}</dt>
                <dd className="text-sm font-semibold">
                  {preview !== null
                    ? formatMoney(preview, selected?.currency ?? null, locale)
                    : "—"}
                </dd>
              </div>
            </dl>
            <div className="space-y-2">
              <label htmlFor="deal-commission" className="text-sm font-medium">
                {tr("Comisión")}
              </label>
              <CampoNumero
                id="deal-commission"
                valor={commission}
                onValorChange={(v) => {
                  changed();
                  setCommission(v);
                }}
                prefijo={
                  selected?.currency
                    ? simboloMoneda(contextoMoneda(selected.currency))
                    : undefined
                }
                minimo={0}
                maximo={1e12}
                decimales={2}
                disabled={saving || !selected || !canAdjust}
              />
              <p className="text-xs text-fg-muted">
                {t(canAdjust ? "ajusteAuditoria" : "comisionCalculada")}
              </p>
            </div>
            <p className="flex items-start gap-2 rounded-lg bg-info-subtle p-3 text-xs leading-4 text-info-text">
              <Info className="size-4 shrink-0" />
              {t("estadoRegistro")}
            </p>
            {error && (
              <Alert variant="destructive">
                <AlertTitle>{tr("No se pudo registrar")}</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => onOpenChange(false)}
              >
                {tr("Cancelar")}
              </Button>
              <Button
                type="submit"
                disabled={saving || !selected || commission === null}
              >
                <Briefcase className="size-4" />
                {saving ? tr("Registrando…") : tr("Registrar deal")}
              </Button>
            </div>
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </Dialog>
  );
}
