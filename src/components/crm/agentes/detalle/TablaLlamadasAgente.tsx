"use client";

/**
 * Últimas llamadas del agente (Figma CRM 1311:86823, tabla inferior): cliente,
 * origen (etapa o campaña), estado, duración, resultado y fecha. Cada fila
 * abre la llamada en Llamadas (`?call=`); en el celular, tarjetas.
 */

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ExternalLink, Phone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { AvatarIniciales } from "@/components/kit/AvatarIniciales";
import { EmptyState } from "@/components/kit/EmptyState";
import type { TonoBadge } from "@/components/kit/estadoTono";
import type { LlamadaReciente } from "@/lib/services/crm/voiceAgentMetrics";

const TONO_LLAMADA: Record<string, TonoBadge> = {
  completed: "exito",
  voicemail: "neutro",
  no_answer: "neutro",
  transferred: "informacion",
  skipped: "advertencia",
  failed: "peligro",
  in_progress: "marca",
};

export function TablaLlamadas({
  llamadas,
  cargando,
  duracion,
  fecha,
}: {
  llamadas: LlamadaReciente[];
  cargando: boolean;
  duracion: (s: number | null) => string;
  fecha: (v: string) => string;
}) {
  const t = useTranslations("crm.agentesIa.detalle");
  const origen = (l: LlamadaReciente) =>
    l.etapa ? t("tabla.origenEtapa", { nombre: l.etapa }) : l.campana ? t("tabla.origenCampana", { nombre: l.campana }) : t("tabla.origenDirecta");
  const estado = (s: string) => (t.has(`tabla.estados.${s}`) ? t(`tabla.estados.${s}`) : s);
  const resultado = (r: string | null) => (r ? (t.has(`resultados.${r}`) ? t(`resultados.${r}`) : r) : "—");
  const enlace = (l: LlamadaReciente) => (l.call_id ? `/app/crm/llamadas?call=${encodeURIComponent(l.call_id)}` : null);

  if (!cargando && llamadas.length === 0) {
    return (
      <section aria-label={t("tabla.titulo")} className="rounded-xl border border-line bg-surface">
        <EmptyState variante="empty" icono={Phone} titulo={t("tabla.vacioTitulo")} descripcion={t("tabla.vacioDescripcion")} compacto />
      </section>
    );
  }

  return (
    <section aria-label={t("tabla.titulo")} className="overflow-hidden rounded-xl border border-line bg-surface">
      {/* Escritorio: tabla. */}
      <table className="hidden w-full text-sm md:table">
        <thead className="bg-subtle text-left text-xs font-medium uppercase tracking-wide text-fg-secondary">
          <tr>
            <th scope="col" className="px-4 py-3">{t("tabla.cliente")}</th>
            <th scope="col" className="px-4 py-3">{t("tabla.origen")}</th>
            <th scope="col" className="px-4 py-3">{t("tabla.estado")}</th>
            <th scope="col" className="px-4 py-3">{t("tabla.duracion")}</th>
            <th scope="col" className="px-4 py-3">{t("tabla.resultado")}</th>
            <th scope="col" className="px-4 py-3">{t("tabla.fecha")}</th>
            <th scope="col" className="w-12 px-4 py-3"><span className="sr-only">{t("tabla.abrir", { cliente: "" })}</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {cargando
            ? [0, 1, 2, 3].map((i) => (
                <tr key={i}>
                  <td colSpan={7} className="px-4 py-4"><span className="block h-4 w-full animate-pulse rounded bg-subtle" /></td>
                </tr>
              ))
            : llamadas.map((l) => {
                const cliente = l.cliente ?? t("tabla.sinCliente");
                const href = enlace(l);
                return (
                  <tr key={l.id} className="hover:bg-hover">
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-3">
                        <AvatarIniciales nombre={cliente} tamano="sm" />
                        <span className="min-w-0 break-words text-fg">{cliente}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-fg">{origen(l)}</td>
                    <td className="px-4 py-3"><Badge tono={TONO_LLAMADA[l.status] ?? "neutro"} tamano="sm" apariencia="contorno">{estado(l.status)}</Badge></td>
                    <td className="px-4 py-3 tabular-nums text-fg">{l.duracion_segundos ? duracion(l.duracion_segundos) : "—"}</td>
                    <td className="px-4 py-3 text-fg">{resultado(l.resultado)}</td>
                    <td className="px-4 py-3 text-fg">{fecha(l.momento)}</td>
                    <td className="px-4 py-3 text-right">
                      {href && (
                        <Link href={href} aria-label={t("tabla.abrir", { cliente })} className="inline-flex size-8 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover hover:text-fg">
                          <ExternalLink aria-hidden="true" className="size-4" strokeWidth={1.5} />
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
        </tbody>
      </table>

      {/* Celular: tarjetas. */}
      <ul className="divide-y divide-line md:hidden">
        {llamadas.map((l) => {
          const cliente = l.cliente ?? t("tabla.sinCliente");
          const href = enlace(l);
          const cuerpo = (
            <span className="flex items-start gap-3">
              <AvatarIniciales nombre={cliente} tamano="sm" />
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium text-fg">{cliente}</span>
                  <Badge tono={TONO_LLAMADA[l.status] ?? "neutro"} tamano="sm" apariencia="contorno">{estado(l.status)}</Badge>
                </span>
                <span className="block text-sm text-fg-secondary">{origen(l)} · {fecha(l.momento)}</span>
                <span className="block text-sm text-fg">{resultado(l.resultado)}</span>
              </span>
            </span>
          );
          return (
            <li key={l.id}>
              {href ? (
                <Link href={href} className="block px-4 py-3 hover:bg-hover" aria-label={t("tabla.abrir", { cliente })}>
                  {cuerpo}
                </Link>
              ) : (
                <div className="px-4 py-3">{cuerpo}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
