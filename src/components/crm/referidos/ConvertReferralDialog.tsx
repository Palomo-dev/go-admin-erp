"use client";

import { localeIntl } from "@/components/kit/idioma";
import { useRedText } from "@/components/crm/red/useRedText";

/** Convierte el referido mediante el alta compartida de Leads o enlaza su ficha existente. */

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/crm/red/RedButton";
import { Input } from "@/components/ui/input";
import { CampoNumero } from "@/components/kit/CampoNumero";
import { simboloMoneda } from "@/components/crm/kit/camposCrm";
import { contextoMoneda } from "@/lib/utils/moneda";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/ui/phone-input";
import { mensajeErrorTelefono } from "@/lib/utils/telefono";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/use-toast";
import { useReturnFocus } from "@/lib/hooks/useReturnFocus";
import type { ReferralView } from "@/lib/services/crm/referralsService";
import { EntitySearchList } from "@/components/crm/shared/EntitySearchList";
import { useCustomerSearch } from "@/components/crm/shared/useCustomerSearch";
import { useCatalogosCrm } from "@/components/crm/acciones/useCatalogosCrm";
import { FormField } from "@/components/kit";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowRight, Link as LinkIcon } from "lucide-react";
import { describeReward } from "@/lib/services/crm/referralReward";

interface Props {
  open: boolean;
  referral: ReferralView | null;
  onOpenChange: (open: boolean) => void;
  onConvert: (
    id: string,
    payload: Record<string, unknown>,
  ) => Promise<{ lead: { id: string; name: string } }>;
  returnFocusFallback: () => HTMLElement | null;
  currency?: string | null;
}

export function ConvertReferralDialog({
  open,
  referral,
  onOpenChange,
  onConvert,
  returnFocusFallback,
  currency = null,
}: Props) {
  const { tr, locale: language } = useRedText();
  const locale = localeIntl(language);
  const catalog = useCatalogosCrm();
  const [owner, setOwner] = useState("__auto__");
  const [amount, setAmount] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [useExisting, setUseExisting] = useState(false);
  const [query, setQuery] = useState("");
  const [existing, setExisting] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const onCloseAutoFocus = useReturnFocus(open, returnFocusFallback);
  const {
    hits,
    loading,
    error: searchError,
  } = useCustomerSearch(
    useExisting ? query : email,
    open && (useExisting || !!email.trim()),
  );

  useEffect(() => {
    if (!open) return;
    setEmail(referral?.referred_email ?? "");
    setPhone(referral?.referred_phone ?? "");
    setUseExisting(false);
    setQuery("");
    setExisting(null);
    setError(null);
    setOwner("__auto__");
    setAmount("");
  }, [open, referral?.id, referral?.referred_email, referral?.referred_phone]);

  useEffect(() => {
    if (!focusId) return;
    document.getElementById(focusId)?.focus();
    setFocusId(null);
  }, [focusId]);

  const duplicate =
    !useExisting && email.trim()
      ? hits.find(
          (h) => h.email?.trim().toLowerCase() === email.trim().toLowerCase(),
        )
      : undefined;
  const summary = describeReward(referral?.program, currency, {
    locale,
    translate: tr,
  });
  const contactMissing = !useExisting && !email.trim() && !phone.trim();

  const submit = async () => {
    if (!referral) return;
    if (useExisting && !existing) {
      setError(
        tr("Elige la ficha de cliente existente o desactiva esa opción."),
      );
      setFocusId("convert-existing");
      return;
    }
    if (contactMissing) {
      setError(tr("Para crear el lead hace falta al menos correo o teléfono."));
      setFocusId("convert-email");
      return;
    }
    const phoneError = useExisting ? null : mensajeErrorTelefono(phone);
    if (phoneError) {
      setError(tr(phoneError));
      setFocusId("convert-phone");
      return;
    }
    const parsedAmount = amount.trim() ? Number(amount) : undefined;
    if (
      parsedAmount !== undefined &&
      (!Number.isFinite(parsedAmount) || parsedAmount < 0)
    ) {
      setError(tr("El monto debe ser un número mayor o igual a 0."));
      setFocusId("convert-amount");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = useExisting
        ? { customer_id: existing!.id }
        : {
            referred_email: email.trim() || null,
            referred_phone: phone.trim() || null,
          };
      if (owner !== "__auto__") payload.salesperson_id = owner;
      if (parsedAmount !== undefined) {
        payload.amount = parsedAmount;
        if (currency) payload.currency = currency;
      }
      const { lead } = await onConvert(referral.id, payload);
      toast({
        title: tr(
          useExisting ? "Ficha vinculada" : "Referido convertido en lead",
        ),
        description: useExisting
          ? tr("«{p0}» quedó vinculado al referido.", { p0: lead.name })
          : tr("«{p0}» ya está en Leads.", { p0: lead.name }),
      });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : tr("Error desconocido"));
      setFocusId("convert-error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!saving) onOpenChange(next);
      }}
    >
      <DialogContent
        onCloseAutoFocus={onCloseAutoFocus}
        overlayClassName="bg-black/40 backdrop-blur-none"
        className="max-h-[90dvh] max-w-[600px] gap-5 overflow-y-auto rounded-2xl border-line bg-surface p-6 sm:rounded-2xl"
      >
        <DialogHeader className="pr-6 text-left">
          <DialogTitle className="text-lg leading-[25px] text-fg">
            {tr("Convertir en lead")}
          </DialogTitle>
          <DialogDescription className="text-fg-secondary ">
            {tr(
              "Se crea o enlaza la ficha de cliente con origen «Referido». El referido pasa a Convertido. La oportunidad se crea después, al calificar el lead.",
            )}{" "}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-5"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="space-y-1.5 rounded-xl bg-subtle p-4">
            <p className="font-semibold text-fg">{referral?.referred_name}</p>
            <p className="text-sm text-fg-secondary">
              {[referral?.referred_email, referral?.referred_phone]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <p className="text-xs text-fg-secondary">
              {tr("Referida por")} {referral?.referrer?.full_name ?? "—"} ·{" "}
              {referral?.program?.name ?? tr("Sin programa")}
              {summary ? ` (${summary.summary})` : ""}
            </p>
          </div>
          {duplicate && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line-warning bg-warning-subtle p-3">
              <div>
                <p className="text-sm font-medium text-warning-text">
                  {tr("Ya existe un cliente con este correo")}
                </p>
                <p className="mt-1 text-xs text-warning-text">
                  {duplicate.full_name}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={saving}
                onClick={() => {
                  setUseExisting(true);
                  setExisting({
                    id: duplicate.id,
                    title: duplicate.full_name ?? tr("Cliente sin nombre"),
                  });
                  setQuery(duplicate.full_name ?? email);
                }}
              >
                <LinkIcon className="size-4" />
                {tr("Enlazar esa ficha")}
              </Button>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Switch
              id="convert-existing-toggle"
              checked={useExisting}
              disabled={saving}
              onCheckedChange={setUseExisting}
            />
            <Label
              htmlFor="convert-existing-toggle"
              className="text-sm text-fg "
            >
              {tr("Ya existe como cliente: enlazar su ficha")}
            </Label>
          </div>
          {useExisting ? (
            <EntitySearchList
              id="convert-existing"
              label={tr("Ficha de cliente existente")}
              placeholder={tr("Buscar por nombre o correo…")}
              query={query}
              onQueryChange={setQuery}
              hits={hits.map((h) => ({
                id: h.id,
                title: h.full_name ?? tr("Cliente sin nombre"),
                subtitle: h.email ?? h.phone ?? null,
              }))}
              loading={loading}
              error={searchError}
              selectedId={existing?.id ?? null}
              onSelect={(h) => setExisting({ id: h.id, title: h.title })}
              hint={
                existing
                  ? tr("Elegido: {p0}", { p0: existing.title })
                  : tr("Se enlazará esa ficha sin crear otra.")
              }
            />
          ) : (
            <details className="rounded-lg border border-line px-3 py-2">
              <summary className="cursor-pointer text-sm text-fg-secondary">
                {tr("Editar datos de contacto")}
              </summary>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label
                    htmlFor="convert-email"
                    className="text-xs text-fg-secondary "
                  >
                    {tr("Correo")}
                  </Label>
                  <Input
                    className="h-10 border-line-strong bg-surface shadow-none"
                    id="convert-email"
                    type="email"
                    value={email}
                    autoComplete="off"
                    aria-invalid={contactMissing && !!error}
                    aria-describedby="convert-contact-hint"
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div>
                  <Label
                    htmlFor="convert-phone"
                    className="text-xs text-fg-secondary "
                  >
                    {tr("Teléfono")}
                  </Label>
                  <PhoneInput
                    className="h-10"
                    id="convert-phone"
                    value={phone}
                    autoComplete="off"
                    aria-describedby="convert-contact-hint"
                    onChange={setPhone}
                  />
                </div>
                <p
                  id="convert-contact-hint"
                  className="text-xs text-fg-secondary  sm:col-span-2"
                >
                  {tr(
                    "Al menos uno de los dos: un lead sin forma de contacto no sirve para nada.",
                  )}
                </p>
              </div>
            </details>
          )}
          <FormField
            id="convert-owner"
            etiqueta={tr("Responsable")}
            tamanoEtiqueta="sm"
            ayuda={tr(
              "Sin elegir, se aplica la regla de asignación de Equipo.",
            )}
          >
            {(field) => (
              <Select
                value={owner}
                onValueChange={setOwner}
                disabled={saving || catalog.cargando || !!catalog.error}
              >
                <SelectTrigger
                  id={field.id}
                  aria-describedby={field["aria-describedby"]}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__auto__">
                    {tr("Asignación automática")}
                  </SelectItem>
                  {catalog.usuarios.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
          {catalog.error != null && (
            <p role="alert" className="text-xs text-danger-text">
              {tr(
                "No se pudieron cargar los responsables. Puedes usar la asignación automática.",
              )}
            </p>
          )}
          <FormField
            id="convert-amount"
            etiqueta={tr("Monto estimado (opcional)")}
            tamanoEtiqueta="sm"
            ayuda={currency ?? undefined}
          >
            <CampoNumero
              valor={amount.trim() ? Number(amount) : null}
              onValorChange={(value) =>
                setAmount(value === null ? "" : String(value))
              }
              prefijo={
                currency
                  ? simboloMoneda(contextoMoneda(currency, { locale }))
                  : undefined
              }
              disabled={saving}
            />
          </FormField>
          {error && (
            <Alert id="convert-error" variant="destructive" tabIndex={-1}>
              <AlertTitle>{tr("No se pudo convertir")}</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <button
            type="submit"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
          >
            {tr("Convertir")}
          </button>
        </form>
        <DialogFooter className="gap-2 [&>button]:h-11 sm:[&>button]:h-9">
          <Button
            type="button"
            variant="outline"
            className="lg:!h-10"
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            {tr("Cancelar")}
          </Button>
          <Button
            type="button"
            className="lg:!h-10"
            disabled={saving}
            onClick={() => void submit()}
          >
            <ArrowRight className="size-4" />
            {saving
              ? tr("Convirtiendo…")
              : tr(useExisting ? "Vincular ficha" : "Crear lead")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
