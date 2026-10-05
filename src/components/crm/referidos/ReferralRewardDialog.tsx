"use client";
import { CircleAlert } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "../red/RedButton";
import { localeIntl } from "@/components/kit/idioma";
import { useRedText } from "../red/useRedText";
import { describeReward } from "@/lib/services/crm/referralReward";
import type { ReferralView } from "@/lib/services/crm/referralsService";

export function ReferralRewardDialog({
  open,
  referral,
  currency,
  busy,
  onOpenChange,
  onConfirm,
  onCloseAutoFocus,
}: {
  open: boolean;
  referral: ReferralView | null;
  currency: string | null;
  busy: boolean;
  onOpenChange: (o: boolean) => void;
  onConfirm: () => Promise<void>;
  onCloseAutoFocus: (e: Event) => void;
}) {
  const { tr, locale: language } = useRedText();
  const locale = localeIntl(language);
  const d = describeReward(referral?.program, currency, {
    locale,
    translate: tr,
  });
  const names =
    referral?.program?.reward_to === "both"
      ? [referral.referrer?.full_name, referral.referred_name]
          .filter(Boolean)
          .join(" · ")
      : referral?.program?.reward_to === "referred"
        ? referral.referred_name
        : referral?.referrer?.full_name;
  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent
        hideCloseButton
        onCloseAutoFocus={onCloseAutoFocus}
        overlayClassName="bg-black/40 backdrop-blur-none"
        className="max-w-[440px] gap-4 rounded-xl border-line bg-surface p-6 sm:rounded-xl"
      >
        <div className="flex gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-tint text-brand-deep">
            <CircleAlert className="size-5" strokeWidth={1.5} />
          </span>
          <div className="space-y-1">
            <DialogTitle className="text-base leading-[22px] text-fg">
              {tr("¿Registrar la recompensa como pagada?")}
            </DialogTitle>
            <DialogDescription className="text-sm leading-5 text-fg-secondary">
              {d?.summary} · {names}.{" "}
              {tr("Se anota como pagada con fecha de hoy; no se mueve dinero.")}
            </DialogDescription>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            {tr("Cancelar")}
          </Button>
          <Button disabled={busy} onClick={() => void onConfirm()}>
            {busy ? tr("Registrando…") : tr("Registrar pago")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
