"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Pencil } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Pagination } from "@/components/kit/Pagination";
import { EmptyState } from "@/components/kit/EmptyState";
import { clasesBoton } from "@/components/kit/botonClases";
import { CLASE_CAMPO } from "@/components/crm/kit/camposCrm";
import { useFormatDate } from "@/lib/context/OrganizationTimezoneContext";
import { formatMoneda } from "@/lib/utils/moneda";
import { formatearEn } from "@/components/crm/kit/monedaCrm";
import {
  FORECAST_CATEGORIES,
  type ForecastCategory,
} from "@/lib/services/crm/forecastLogica";
import type { ForecastResponse } from "./useForecastData";
import { ForecastSellerCard } from "./ForecastSellerCard";
export type ForecastRow = ForecastResponse["rows"][number];
export function ForecastSellers({
  data,
  onSeller,
  onAdjust,
}: {
  data: ForecastResponse;
  onSeller: (id: string) => void;
  onAdjust: (row: ForecastRow) => void;
}) {
  const t = useTranslations("crm.pronostico");
  if (!data.rows.length)
    return (
      <EmptyState
        titulo={t("vacio")}
        descripcion={t("vacioDetalle")}
        accion={{ etiqueta: t("crear"), href: "/app/crm/oportunidades" }}
      />
    );
  return (
    <>
      <div className="grid gap-3 lg:hidden">
        {data.rows.map((row) => (
          <ForecastSellerCard
            key={row.userId ?? "unassigned"}
            row={row}
            data={data}
            onSeller={onSeller}
            onAdjust={onAdjust}
          />
        ))}
      </div>
      <div className="hidden overflow-x-auto rounded-xl border border-line bg-surface lg:block">
        <Table>
          <TableHeader>
            <TableRow>
              {[
                "vendedor",
                "cuota",
                "ganado",
                "compromiso",
                "mejorCaso",
                "ponderado",
                "cobertura",
                "ajustar",
              ].map((k) => (
                <TableHead key={k}>{t(k)}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.rows.map((row) => {
              const name =
                [row.name?.first_name, row.name?.last_name]
                  .filter(Boolean)
                  .join(" ") ||
                t(row.userId ? "vendedorInactivo" : "sinVendedor");
              return (
                <TableRow key={row.userId ?? "unassigned"}>
                  <TableCell>
                    {row.userId && row.name ? (
                      <button
                        className="text-left font-medium text-link hover:underline focus-visible:ring-2 focus-visible:ring-brand"
                        onClick={() => onSeller(row.userId!)}
                      >
                        {name}
                      </button>
                    ) : (
                      name
                    )}
                  </TableCell>
                  {(
                    ["quota", "won", "commit", "bestCase", "weighted"] as const
                  ).map((k) => (
                    <TableCell
                      key={k}
                      className="whitespace-nowrap tabular-nums text-fg"
                    >
                      {formatMoneda(row[k].total, data.moneda)}
                      {row[k].sinTasa.length > 0 && (
                        <span
                          className="ml-1 text-warning-text"
                          title={t("parcial")}
                        >
                          *
                        </span>
                      )}
                      {k === "commit" && row.latestAdjustment && (
                        <span className="block text-xs text-fg-muted">
                          {t("ajustado", {
                            monto: formatMoneda(
                              row.adjustment.total,
                              data.moneda,
                            ),
                          })}
                        </span>
                      )}
                    </TableCell>
                  ))}
                  <TableCell className="tabular-nums">
                    {row.coverage === null
                      ? "—"
                      : `${Math.round(row.coverage * 100)}%`}
                  </TableCell>
                  <TableCell>
                    {data.canAdjust && row.userId && row.name && (
                      <button
                        className={clasesBoton({
                          variante: "fantasma",
                          tamano: "sm",
                        })}
                        onClick={() => onAdjust(row)}
                        aria-label={t("ajustarVendedor", { nombre: name })}
                        disabled={row.commit.sinTasa.length > 0}
                      >
                        <Pencil className="size-4" aria-hidden="true" />
                      </button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
export function ForecastOpportunities({
  data,
  page,
  onPage,
  onCategory,
  busy,
}: {
  data: ForecastResponse;
  page: number;
  onPage: (n: number) => void;
  onCategory: (
    id: string,
    category: ForecastCategory,
    updatedAt: string | null,
  ) => void;
  busy: boolean;
}) {
  const t = useTranslations("crm.pronostico");
  const { formatPlain } = useFormatDate(null);
  if (!data.opportunityCount)
    return (
      <EmptyState
        titulo={t("sinOportunidades")}
        accion={{ etiqueta: t("crear"), href: "/app/crm/oportunidades" }}
      />
    );
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {[
                "oportunidad",
                "etapa",
                "cierre",
                "monto",
                "probabilidad",
                "categoria",
              ].map((k) => (
                <TableHead key={k}>{t(k)}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.opportunities.map((o) => (
              <TableRow key={o.id}>
                <TableCell>
                  <Link
                    href={`/app/crm/oportunidades/${o.id}`}
                    className="font-medium text-link hover:underline"
                  >
                    {o.name}
                  </Link>
                </TableCell>
                <TableCell>{o.stage_name}</TableCell>
                <TableCell className="whitespace-nowrap">
                  {o.expected_close_date
                    ? formatPlain(o.expected_close_date)
                    : "—"}
                </TableCell>
                <TableCell className="whitespace-nowrap tabular-nums">
                  {formatearEn(
                    o.amount,
                    o.currency ?? data.moneda.code,
                    data.moneda,
                  )}
                </TableCell>
                <TableCell className="tabular-nums">
                  {o.probability ?? 0}%
                </TableCell>
                <TableCell>
                  <select
                    className={CLASE_CAMPO}
                    value={o.category}
                    disabled={busy || !o.canEdit}
                    aria-label={t("categoriaDe", { nombre: o.name })}
                    onChange={(e) =>
                      onCategory(
                        o.id,
                        e.target.value as ForecastCategory,
                        o.updated_at,
                      )
                    }
                  >
                    {FORECAST_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {t(`categorias.${c}`)}
                      </option>
                    ))}
                  </select>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Pagination
        pagina={page}
        tamano={25}
        total={data.opportunityCount}
        onPaginaChange={onPage}
        className="border-t border-line p-4"
      />
    </div>
  );
}
