"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Dialogo } from "@/components/kit/Dialogo";
import { FormField } from "@/components/kit/FormField";
import { CLASE_CAMPO, CLASE_AREA } from "@/components/crm/kit/camposCrm";
import { CampoNumero } from "@/components/kit/CampoNumero";
import { formatMoneda, type ContextoMoneda } from "@/lib/utils/moneda";
import type { ForecastRow } from "./ForecastTables";
export function ForecastAdjustmentDialog({
  row,
  moneda,
  period,
  busy,
  onClose,
  onSave,
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
}) {
  const t = useTranslations("crm.pronostico");
  const [amount, setAmount] = useState<number | null>(
    Math.round(row.commit.total * 10 ** moneda.decimals) /
      10 ** moneda.decimals,
  );
  const [reason, setReason] = useState("verbal_agreement");
  const [detail, setDetail] = useState("");
  const value = amount;
  const valid =
    value !== null &&
    Number.isFinite(value) &&
    value >= 0 &&
    detail.trim().length >= 3;
  const name = [row.name?.first_name, row.name?.last_name]
    .filter(Boolean)
    .join(" ");
  return (
    <Dialogo
      abierto
      onAbiertoChange={(v) => {
        if (!v && !busy) onClose();
      }}
      titulo={t("ajustarVendedor", { nombre: name })}
      descripcion={`${period} · ${formatMoneda(row.commit.total, moneda)}`}
      textoCancelar={t("cancelar")}
      primario={{
        etiqueta: t(busy ? "guardando" : "guardar"),
        cargando: busy,
        deshabilitada: !valid,
        onClick: () =>
          onSave({
            amount_after: value!,
            reason_code: reason,
            reason_text: detail.trim(),
          }),
      }}
    >
      <div className="space-y-4">
        <FormField etiqueta={t("nuevoCompromiso")} obligatorio>
          <CampoNumero
            valor={amount}
            onValorChange={setAmount}
            minimo={0}
            maximo={1e15}
            decimales={moneda.decimals}
            prefijo={moneda.code}
          />
        </FormField>
        <FormField etiqueta={t("motivo")} obligatorio>
          <select
            className={CLASE_CAMPO}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          >
            {["verbal_agreement", "deal_risk", "upside", "correction"].map(
              (v) => (
                <option key={v} value={v}>
                  {t(`motivos.${v}`)}
                </option>
              ),
            )}
          </select>
        </FormField>
        <FormField etiqueta={t("detalle")} obligatorio>
          <textarea
            className={CLASE_AREA}
            maxLength={2000}
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
          />
        </FormField>
        <p className="rounded-lg bg-info-subtle p-3 text-sm text-info-text">
          {t("notaAjuste")}
        </p>
      </div>
    </Dialogo>
  );
}
