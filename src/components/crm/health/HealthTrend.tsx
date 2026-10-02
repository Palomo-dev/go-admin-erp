"use client";
import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Minus, TrendingDown, TrendingUp, Table2 } from "lucide-react";
import { useLocaleIntl } from "@/components/kit/useIdiomaKit";
import { clasesBoton } from "@/components/kit/botonClases";
import { useOrgTimezone } from "@/lib/context/OrganizationTimezoneContext";
import { formatDateTimeInTz } from "@/lib/utils/dateDisplay";
import { trendDelta, type HealthBand } from "@/lib/services/crm/healthBands";
import { BAND_STYLES } from "./healthBandStyles";
export interface HealthTrendPoint {
  id?: string;
  score: number;
  band: HealthBand;
  created_at: string;
}
export interface HealthTrendProps {
  snapshots: HealthTrendPoint[];
  band: HealthBand;
  className?: string;
}
const H = 40;
export function HealthTrend({ snapshots, className = "" }: HealthTrendProps) {
  const locale = useLocaleIntl();
  const t = useTranslations("crm.salud");
  const { timezone } = useOrgTimezone();
  const [showTable, setShowTable] = useState(false);
  const tableId = useId();
  const ordered = [...snapshots].sort(
    (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at),
  );
  const fmt = (value: string) =>
    formatDateTimeInTz(value, timezone, {
      locale,
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  if (ordered.length < 2)
    return (
      <p className={`text-xs text-fg-secondary ${className}`}>
        {t("trend.empty")}
      </p>
    );
  const delta = trendDelta(ordered) ?? 0;
  const last = ordered[ordered.length - 1];
  const first = ordered[0];
  const Icon = delta === 0 ? Minus : delta > 0 ? TrendingUp : TrendingDown;
  return (
    <div className={className}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs text-fg-secondary">
          {t("trend.count", { count: ordered.length })}
        </span>
        <span
          className={`inline-flex items-center gap-1 text-xs font-medium ${delta === 0 ? "text-fg-secondary" : BAND_STYLES[delta > 0 ? "green" : "red"].text}`}
        >
          <Icon className="size-3.5" aria-hidden />
          {delta === 0
            ? t("trend.stable")
            : t("trend.delta", { delta: `${delta > 0 ? "+" : ""}${delta}` })}
        </span>
      </div>
      <div
        role="img"
        aria-label={t("trend.summary", {
          first: first.score,
          start: fmt(first.created_at),
          last: last.score,
          end: fmt(last.created_at),
          count: ordered.length,
        })}
        className="flex items-end gap-1"
        style={{ height: H }}
      >
        {ordered.map((point, i) => (
          <span
            key={point.id ?? `${point.created_at}-${i}`}
            title={`${fmt(point.created_at)} · ${point.score} · ${t(`bands.${point.band}`)}`}
            className={`min-w-0 flex-1 rounded-t-sm ${BAND_STYLES[point.band].bar}`}
            style={{
              height: `${Math.max(2, Math.max(0, Math.min(100, point.score)))}%`,
            }}
          />
        ))}
      </div>
      <button
        type="button"
        className={`${clasesBoton({ patron: "button", variante: "fantasma", tamano: "sm" })} mt-2`}
        aria-expanded={showTable}
        aria-controls={tableId}
        onClick={() => setShowTable((value) => !value)}
      >
        <Table2 className="size-3.5" aria-hidden />
        {t(showTable ? "trend.hideTable" : "trend.showTable")}
      </button>
      {showTable && (
        <div
          id={tableId}
          className="mt-2 max-h-48 overflow-auto rounded-lg border border-line"
        >
          <table className="w-full text-xs">
            <caption className="sr-only">{t("trend.caption")}</caption>
            <thead className="bg-subtle text-fg-secondary">
              <tr>
                {(["date", "score", "band"] as const).map((key) => (
                  <th
                    key={key}
                    scope="col"
                    className="px-3 py-2 text-left font-medium"
                  >
                    {t(key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...ordered].reverse().map((point, i) => (
                <tr
                  key={point.id ?? `${point.created_at}-${i}`}
                  className="border-t border-line"
                >
                  <td className="px-3 py-2 text-fg-secondary">
                    {fmt(point.created_at)}
                  </td>
                  <td
                    className={`px-3 py-2 font-semibold tabular-nums ${BAND_STYLES[point.band].text}`}
                  >
                    {point.score}
                  </td>
                  <td className={`px-3 py-2 ${BAND_STYLES[point.band].text}`}>
                    {t(`bands.${point.band}`)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
export default HealthTrend;
