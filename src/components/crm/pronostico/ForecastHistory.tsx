"use client";
import { useTranslations } from "next-intl";
import { EmptyState } from "@/components/kit/EmptyState";
import { clasesBoton } from "@/components/kit/botonClases";
import { useFormatDate } from "@/lib/context/OrganizationTimezoneContext";
import { formatearEn } from "@/components/crm/kit/monedaCrm";
import type { ForecastResponse } from "./useForecastData";
export function ForecastHistory({
  data,
  busy,
  onUndo,
}: {
  data: ForecastResponse;
  busy: boolean;
  onUndo: (id: string, userId: string) => void;
}) {
  const t = useTranslations("crm.pronostico");
  const { formatDateTime } = useFormatDate(null);
  if (!data.adjustments.length)
    return (
      <EmptyState
        titulo={t("sinAjustes")}
        descripcion={t("notaAjuste")}
        compacto
      />
    );
  return (
    <ul className="divide-y divide-line">
      {[...data.adjustments].reverse().map((a) => (
        <li key={a.id} className="space-y-2 py-3 text-sm text-fg">
          <p className="font-medium">
            {formatearEn(a.amount_before, a.currency, data.moneda)} →{" "}
            {formatearEn(a.amount_after, a.currency, data.moneda)}
          </p>
          <p>
            {t.has(`motivos.${a.reason_code}`)
              ? t(`motivos.${a.reason_code}`)
              : a.reason_code}{" "}
            · {a.reason_text}
          </p>
          <p className="text-xs text-fg-muted">
            {formatDateTime(a.created_at)} · {a.author || t("autor")}
          </p>
          {data.canAdjust &&
            data.rows.find((r) => r.userId === a.user_id)?.latestAdjustment
              ?.id === a.id && (
              <button
                className={clasesBoton({
                  variante: "secundario",
                  tamano: "sm",
                })}
                disabled={busy}
                onClick={() => onUndo(a.id, a.user_id)}
              >
                {t("revertir")}
              </button>
            )}
        </li>
      ))}
    </ul>
  );
}
