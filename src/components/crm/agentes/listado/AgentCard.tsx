"use client";

/**
 * Tarjeta de un agente IA de voz (Figma CRM 1298:84133): icono, nombre,
 * «propósito · idioma · motor» e insignia de estado; la voz que usa; «Guion en
 * etapas» con sus etapas y la política (sugiere / ejecuta solo); las cifras de
 * los últimos días (llamadas, contacto efectivo, agendadas) y el pie con
 * «Editar», «Ver detalle» y el interruptor de activo.
 */

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Bot, Eye, Mic, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { clasesBoton } from "@/components/kit/botonClases";
import type { CifrasTarjeta, DescripcionVoz } from "./agenteVista";

export interface AgentCardProps {
  id: string;
  nombre: string;
  proposito: string;
  idioma: string;
  motor: string;
  activo: boolean;
  voz: DescripcionVoz;
  etapas: { id: string; nombre: string }[];
  politica: "auto" | "suggest";
  cifras: CifrasTarjeta | null;
  dias: number;
  cambiando?: boolean;
  onEditar: () => void;
  onCambiarActivo: () => void;
}

export function AgentCard({
  id,
  nombre,
  proposito,
  idioma,
  motor,
  activo,
  voz,
  etapas,
  politica,
  cifras,
  dias,
  cambiando,
  onEditar,
  onCambiarActivo,
}: AgentCardProps) {
  const t = useTranslations("crm.agentesIa.listado.tarjeta");
  const tx = useTranslations("crm.agentesIa");
  const motorTexto = t.has(`motores.${motor}`) ? t(`motores.${motor}`) : motor;
  const vozTexto =
    voz.tipo === "clonada"
      ? t("vozClonada", { nombre: voz.nombre })
      : voz.tipo === "catalogo"
        ? t("vozCatalogo", { nombre: voz.nombre })
        : voz.tipo === "id"
          ? t("vozId", { id: voz.id })
          : voz.tipo === "defectoOrg"
            ? t("vozDefectoOrg")
            : t("sinVoz");
  const idInterruptor = `agente-activo-${id}`;

  return (
    <article className="flex w-full min-w-0 flex-col gap-3 rounded-xl border border-line bg-surface p-4" aria-labelledby={`agente-${id}-nombre`}>
      <header className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${activo ? "bg-brand-tint text-brand" : "bg-subtle text-fg-muted"}`}
        >
          <Bot className="size-5" strokeWidth={1.5} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 id={`agente-${id}-nombre`} className="break-words text-base font-semibold leading-6 text-fg">
            {nombre}
          </h3>
          <p className="text-sm text-fg-secondary">
            {proposito} · {idioma} · {motorTexto}
          </p>
        </div>
        <Badge tono={activo ? "exito" : "neutro"} tamano="sm" className="shrink-0">
          {activo ? tx("activo") : tx("inactivo")}
        </Badge>
      </header>

      <p className="flex min-w-0 items-center gap-2 text-sm text-fg-secondary">
        <Mic aria-hidden="true" className="size-4 shrink-0 text-fg-muted" strokeWidth={1.5} />
        <span className="min-w-0 break-words">{vozTexto}</span>
      </p>

      <div className="flex flex-wrap items-center gap-1.5 text-sm text-fg-secondary">
        <span>{etapas.length > 0 ? t("guion") : t("sinEtapas")}</span>
        {etapas.map((e) => (
          <Badge key={e.id} tono="marca" tamano="sm" apariencia="contorno">
            {e.nombre}
          </Badge>
        ))}
        <Badge tono="neutro" tamano="sm" apariencia="contorno">
          {t(`politica.${politica}`)}
        </Badge>
      </div>

      <dl className="grid grid-cols-3 gap-2 rounded-lg bg-subtle px-4 py-3" aria-label={t("cifrasAria", { dias })}>
        <Cifra etiqueta={t("llamadas")} valor={cifras ? String(cifras.llamadas) : "—"} />
        <Cifra etiqueta={t("contacto")} valor={cifras?.contactoPct != null ? `${cifras.contactoPct} %` : "—"} />
        <Cifra etiqueta={t("agendadas")} valor={cifras?.agendadas != null ? String(cifras.agendadas) : "—"} />
      </dl>

      <footer className="mt-auto flex flex-wrap items-center gap-2">
        <button type="button" className={clasesBoton({ variante: "secundario", tamano: "sm" })} onClick={onEditar}>
          <Pencil aria-hidden="true" className="size-4" strokeWidth={1.5} />
          {tx("editar")}
        </button>
        <Link href={`/app/crm/agentes-ia/${id}`} className={clasesBoton({ variante: "fantasma", tamano: "sm" })}>
          <Eye aria-hidden="true" className="size-4" strokeWidth={1.5} />
          {t("verDetalle")}
        </Link>
        <span className="flex-1" />
        <label htmlFor={idInterruptor} className="text-sm text-fg-secondary">
          {activo ? tx("activo") : tx("inactivo")}
        </label>
        <Switch
          id={idInterruptor}
          checked={activo}
          disabled={cambiando}
          onCheckedChange={onCambiarActivo}
          aria-label={t("interruptor", { nombre })}
        />
      </footer>
    </article>
  );
}

function Cifra({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex min-w-0 flex-col-reverse">
      <dt className="truncate text-xs text-fg-secondary">{etiqueta}</dt>
      <dd className="text-lg font-semibold tabular-nums text-fg">{valor}</dd>
    </div>
  );
}
