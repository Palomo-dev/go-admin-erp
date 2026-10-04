"use client";
import { Merge } from "lucide-react";
import { PageHeader } from "@/components/kit/PageHeader";
import { StatusBadge } from "@/components/kit/StatusBadge";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { clasesBoton } from "@/components/kit/botonClases";
import { CAMPOS_FUSION } from "@/lib/services/crm/customerDuplicatesLogica";
import type { GrupoDuplicado } from "@/lib/services/crm/customerDuplicatesLogica";

export function FusionClientesPanel({
  group,
  ocupado,
  onFusionar,
  onCancelar,
  error,
}: {
  group: GrupoDuplicado;
  ocupado: boolean;
  onFusionar: (
    primary: string,
    secondary: string,
    choices: Record<string, string>,
  ) => void;
  onCancelar: () => void;
  error?: string | null;
}) {
  const t = useTranslations("crm.identidades");
  const [primary, setPrimary] = useState(group.customers[0].id);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const secondary = group.customers.find((c) => c.id !== primary)!;
  const actions = (
    <div className="flex flex-wrap justify-end gap-2">
      <button
        className={clasesBoton({ patron: "button", variante: "secundario" })}
        disabled={ocupado}
        onClick={onCancelar}
      >
        {t("cancelar")}
      </button>
      <button
        className={clasesBoton({ patron: "button" })}
        disabled={ocupado}
        onClick={() => onFusionar(primary, secondary.id, choices)}
      >
        {t(ocupado ? "guardando" : "fusionar")}
      </button>
    </div>
  );
  return (
    <section className="space-y-4">
      <PageHeader
        titulo={t("comparar")}
        subtitulo={`${group.identity_value} · ${group.customers.length}`}
        icono={Merge}
        migas={[
          { etiqueta: "CRM", href: "/app/crm" },
          { etiqueta: t("titulo"), href: "/app/crm/identidades" },
          { etiqueta: t("comparar") },
        ]}
        acciones={actions}
        debajo={<div className="lg:hidden">{actions}</div>}
      />
      {error && <p role="alert" className="rounded-lg border border-line-danger bg-danger-subtle p-3 text-sm text-danger-text">{error}</p>}
      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full min-w-[540px] text-[13px] leading-[18px]">
          <caption className="sr-only">{t("comparar")}</caption>
          <thead>
            <tr className="border-b border-line bg-subtle">
              <th scope="col" className="w-1/5 p-3 text-left font-medium text-fg-secondary">
                {t("campo")}
              </th>
              {group.customers.map((c) => (
                <th
                  key={c.id}
                  scope="col"
                  className="w-2/5 p-3 text-left text-fg"
                >
                  <label className={`flex min-h-[60px] cursor-pointer items-center gap-2 rounded-lg border p-3 ${primary === c.id ? 'border-brand bg-brand-tint' : 'border-line bg-surface'}`}>
                    <input
                      type="radio"
                      name="principal"
                      value={c.id}
                      checked={primary === c.id}
                      disabled={ocupado}
                      onChange={() => {
                        setPrimary(c.id);
                        setChoices({});
                      }}
                      className="accent-brand-action"
                    />
                    <span>
                      {c.full_name ?? t("sinNombre")}
                      <small className="block font-normal text-fg-secondary">
                        {t(primary === c.id ? "principal" : "secundario")}
                      </small>
                    </span>
                    {primary === c.id && <StatusBadge estado="principal" etiqueta={t("principal")} tono="marca" apariencia="contorno" tipografia="figma" className="ml-auto" />}
                  </label>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CAMPOS_FUSION.map((field) => {
              const equal =
                group.customers[0][field] === group.customers[1][field];
              return (
                <tr key={field} className="border-b border-line last:border-0">
                  <th
                    scope="row"
                    className="p-3 text-left font-normal text-fg-secondary"
                  >
                    {t(`campos.${field}`)}
                  </th>
                  {group.customers.map((c) => (
                    <td
                      key={c.id}
                      className="p-3 text-fg"
                    >
                      <label className={`flex min-h-7 cursor-pointer items-center gap-2 rounded-md px-2 py-1 ${!equal && (choices[field] ?? primary) === c.id ? 'bg-brand-tint' : ''}`}>
                        {!equal && (
                          <input
                            type="radio"
                            name={field}
                            value={c.id}
                            checked={(choices[field] ?? primary) === c.id}
                            disabled={ocupado}
                            aria-label={t("elegir", {
                              field: t(`campos.${field}`),
                              customer: c.full_name ?? t("sinNombre"),
                            })}
                            onChange={() =>
                              setChoices({ ...choices, [field]: c.id })
                            }
                            className="accent-brand-action"
                          />
                        )}
                        <span className="break-all">
                          {c[field] ?? "—"}
                          {equal && (
                            <StatusBadge
                              className="ml-2"
                              estado="igual"
                              etiqueta={t("igual")}
                              tono="neutro"
                              tipografia="figma"
                            />
                          )}
                        </span>
                      </label>
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="rounded-lg border border-line-warning bg-warning-subtle p-4 text-sm text-warning-text">
        {t("avisoFusion")}
      </p>
    </section>
  );
}
