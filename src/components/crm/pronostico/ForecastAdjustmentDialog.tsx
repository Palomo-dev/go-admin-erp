"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Dialog, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { FormField } from "@/components/kit/FormField";
import { CLASE_AREA, simboloMoneda } from "@/components/crm/kit/camposCrm";
import { clasesBoton } from "@/components/kit/botonClases";
import { CampoNumero } from "@/components/kit/CampoNumero";
import { formatMoneda, type ContextoMoneda } from "@/lib/utils/moneda";
import { ForecastSelect } from "./ForecastSelect";
import type { ForecastRow } from "./ForecastTables";
export function ForecastAdjustmentDialog({
  row,
  moneda,
  period,
  busy,
  onClose,
  onSave,
  error,
}: {
  row: ForecastRow;
  moneda: ContextoMoneda;
  period: string;
  busy: boolean;
  onClose: () => void;
  onSave: (values: {
    amount_after: number;
    reason_code: string;
    reason_text: string;
  }) => void;
  error?: string | null;
}) {
  const t = useTranslations("crm.pronostico");
  const [amount, setAmount] = useState<number | null>(
    Math.round(row.commit.total * 10 ** moneda.decimals) /
      10 ** moneda.decimals,
  );
  const [reason, setReason] = useState("verbal_agreement");
  const [detail, setDetail] = useState("");
  const valid =
    amount !== null &&
    Number.isFinite(amount) &&
    amount >= 0 &&
    amount <= 1e15 &&
    detail.trim().length >= 3;
  const name = [row.name?.first_name, row.name?.last_name]
    .filter(Boolean)
    .join(" ");
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-fg/45" />
        <DialogPrimitive.Content
          aria-modal="true"
          onEscapeKeyDown={(event) => {
            if (busy) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (busy) event.preventDefault();
          }}
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-32px)] w-[calc(100%-32px)] max-w-[520px] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-xl border border-line bg-surface p-6 text-fg shadow-xl"
        >
          <DialogTitle className="text-lg font-semibold leading-6 tracking-normal text-fg">
            {t("ajustarVendedor", { nombre: name })}
          </DialogTitle>
          <DialogDescription className="text-[13px] leading-[18px] text-fg-secondary">
            {t("importeCalculado", {
              periodo: period,
              monto: formatMoneda(row.calculatedCommit.total, moneda),
            })}
          </DialogDescription>
          <div className="space-y-3">
            <FormField
              etiqueta={t("nuevoCompromiso")}
              etiquetaOculta
              obligatorio
            >
              <CampoNumero
                valor={amount}
                onValorChange={setAmount}
                minimo={0}
                maximo={1e15}
                decimales={moneda.decimals}
                prefijo={simboloMoneda(moneda)}
                disabled={busy}
              />
            </FormField>
            <ForecastSelect
              label={t("motivo")}
              value={reason}
              onChange={setReason}
              disabled={busy}
              options={[
                "verbal_agreement",
                "deal_risk",
                "upside",
                "correction",
              ].map((value) => ({ value, label: t(`motivos.${value}`) }))}
            />
            <FormField
              etiqueta={t("detalle")}
              tamanoEtiqueta="sm"
              obligatorio
              ayuda={t("detalleAuditoria")}
            >
              <textarea
                className={`${CLASE_AREA.replace("min-h-[96px]", "min-h-10")} h-10 py-0.5`}
                maxLength={2000}
                value={detail}
                disabled={busy}
                onChange={(event) => setDetail(event.target.value)}
              />
            </FormField>
            <p className="rounded-lg bg-subtle p-3 text-xs leading-4 text-fg-secondary">
              {t("notaAjusteCalculado", {
                monto: `${(amount ?? row.calculatedCommit.total) >= row.calculatedCommit.total ? "+ " : ""}${formatMoneda((amount ?? row.calculatedCommit.total) - row.calculatedCommit.total, moneda)}`,
              })}
            </p>
            {error && (
              <p
                role="alert"
                className="rounded-lg bg-danger-subtle p-3 text-xs text-danger-text"
              >
                {error}
              </p>
            )}
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={busy}
              className={clasesBoton({ variante: "fantasma" })}
              onClick={onClose}
            >
              {t("cancelar")}
            </button>
            <button
              type="button"
              disabled={busy || !valid}
              className={clasesBoton({ variante: "primario" })}
              onClick={() => {
                if (valid && !busy)
                  onSave({
                    amount_after: amount!,
                    reason_code: reason,
                    reason_text: detail.trim(),
                  });
              }}
            >
              {t(busy ? "guardando" : "guardar")}
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </Dialog>
  );
}
