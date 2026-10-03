"use client";

import { localeIntl } from "@/components/kit/idioma";
import { useRedText } from "@/components/crm/red/useRedText";

/** Campos de la persona referida y del programa (parte de `RegisterReferralDialog`). */

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { CLASE_CAMPO } from "@/components/crm/kit/camposCrm";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/ui/phone-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ReferralProgram } from "@/lib/services/crm/referralsService";
import { describeReward } from "@/lib/services/crm/referralReward";
import {
  REFERRED_NAME_MAX,
  type FormError,
  type RegisterReferralForm,
} from "@/lib/services/crm/referralModel";

const NO_PROGRAM = "__none__";

interface Props {
  form: RegisterReferralForm;
  errors: FormError[];
  programs: ReferralProgram[];
  currency: string | null;
  onChange: (next: RegisterReferralForm) => void;
}

export function ReferredPersonFields({
  form,
  errors,
  programs,
  currency,
  onChange,
}: Props) {
  const { tr, locale: language } = useRedText();
  const locale = localeIntl(language);
  const [showEmail, setShowEmail] = useState(false);
  const errorOf = (field: FormError["field"]) =>
    tr(errors.find((e) => e.field === field)?.message ?? "");
  const selectedProgram =
    programs.find((p) => p.id === form.program_id) ?? null;
  const reward = describeReward(selectedProgram, currency, {
    locale,
    translate: tr,
  });
  const nameError = errorOf("referred_name");
  const emailError = errorOf("referred_email");
  const phoneError = errorOf("referred_phone");

  return (
    <>
      <div>
        <Label
          htmlFor="referral-referred_name"
          className="mb-2 block text-sm text-fg"
        >
          {tr("Nombre de la persona referida")}{" "}
          <span className="text-danger">*</span>
        </Label>
        <Input
          className={`${CLASE_CAMPO} shadow-none aria-[invalid=true]:focus-visible:ring-danger`}
          id="referral-referred_name"
          value={form.referred_name}
          maxLength={REFERRED_NAME_MAX + 20}
          autoComplete="off"
          aria-invalid={!!nameError}
          aria-describedby={
            nameError ? "referral-referred_name-error" : undefined
          }
          onChange={(e) => onChange({ ...form, referred_name: e.target.value })}
        />
        {nameError && (
          <p
            id="referral-referred_name-error"
            role="alert"
            className="mt-1 text-xs text-danger-text"
          >
            {nameError}
          </p>
        )}
      </div>
      <div className="grid gap-5 lg:grid-cols-2 lg:gap-3">
        <div
          className={
            showEmail || form.referred_email
              ? "order-2 lg:order-1"
              : "hidden lg:block"
          }
        >
          <Label
            htmlFor="referral-referred_email"
            className="mb-1.5 block text-xs text-fg"
          >
            {tr("Correo (opcional)")}
          </Label>
          <Input
            className={`${CLASE_CAMPO} shadow-none aria-[invalid=true]:focus-visible:ring-danger`}
            id="referral-referred_email"
            type="email"
            value={form.referred_email}
            autoComplete="off"
            aria-invalid={!!emailError}
            aria-describedby={
              emailError
                ? "referral-referred_email-error"
                : "referral-contact-hint"
            }
            onChange={(e) =>
              onChange({ ...form, referred_email: e.target.value })
            }
          />
          {emailError && (
            <p
              id="referral-referred_email-error"
              role="alert"
              className="mt-1 text-xs text-danger-text"
            >
              {emailError}
            </p>
          )}
        </div>
        <div className="order-1 lg:order-2">
          <Label
            htmlFor="referral-referred_phone"
            className="mb-1.5 block text-xs text-fg"
          >
            {tr("Teléfono (opcional)")}
          </Label>
          <PhoneInput
            className="h-10"
            id="referral-referred_phone"
            value={form.referred_phone}
            autoComplete="off"
            aria-describedby="referral-contact-hint"
            error={phoneError}
            onChange={(v) => onChange({ ...form, referred_phone: v })}
          />
        </div>
      </div>
      {!showEmail && !form.referred_email && (
        <button
          type="button"
          className="text-xs text-brand-deep lg:hidden"
          onClick={() => setShowEmail(true)}
        >
          {tr("Agregar correo (opcional)")}
        </button>
      )}
      <div>
        <Label
          htmlFor="referral-program"
          className="mb-1.5 block text-xs text-fg"
        >
          {tr("Programa")}
        </Label>
        <Select
          value={form.program_id || NO_PROGRAM}
          onValueChange={(v) =>
            onChange({ ...form, program_id: v === NO_PROGRAM ? "" : v })
          }
        >
          <SelectTrigger
            id="referral-program"
            className="text-left [&>span]:line-clamp-1"
            aria-describedby="referral-program-hint"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_PROGRAM}>{tr("Sin programa")}</SelectItem>
            {programs.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name} ·{" "}
                {
                  describeReward(p, currency, { locale, translate: tr })
                    ?.summary
                }
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p id="referral-program-hint" className="sr-only">
          {reward
            ? tr("Recompensa: {p0}", { p0: reward.summary })
            : programs.length === 0
              ? tr(
                  "No hay programas activos; el referido se registra sin recompensa.",
                )
              : tr("Sin programa no hay recompensa que registrar.")}
        </p>
      </div>
    </>
  );
}
