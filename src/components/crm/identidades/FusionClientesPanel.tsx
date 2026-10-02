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
}: {
  group: GrupoDuplicado;
  ocupado: boolean;
  onFusionar: (
    primary: string,
    secondary: string,
    choices: Record<string, string>,
  ) => void;
  onCancelar: () => void;
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
      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full min-w-[540px] text-sm">
          <caption className="sr-only">{t("comparar")}</caption>
          <thead>
            <tr className="border-b border-line bg-subtle">
              <th scope="col" className="p-4 text-left text-fg-secondary">
                {t("campo")}
              </th>
              {group.customers.map((c) => (
                <th
                  key={c.id}
                  scope="col"
                  className={`p-4 text-left text-fg ${primary === c.id ? "bg-brand-tint ring-1 ring-inset ring-brand" : ""}`}
                >
                  <label className="flex cursor-pointer items-center gap-2">
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
                    className="p-4 text-left font-normal text-fg-secondary"
                  >
                    {t(`campos.${field}`)}
                  </th>
                  {group.customers.map((c) => (
                    <td
                      key={c.id}
                      className={`p-4 text-fg ${!equal && (choices[field] ?? primary) === c.id ? "bg-brand-tint" : ""}`}
                    >
                      <label className="flex cursor-pointer items-center gap-2">
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
