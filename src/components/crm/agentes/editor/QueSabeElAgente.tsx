"use client";

/**
 * «Qué sabe el agente» (Figma CRM 1804:905093; vacío 1804:905573; cargando,
 * error y tope 1806:147282; móvil 1806:147338). Va justo bajo «Instrucciones
 * del agente»: es lo que el agente sabe además del guion. Solo lectura; se
 * edita en Chat › Base de conocimiento (una sola fuente para chat y voz).
 *
 * Los datos y el criterio (prioridad, tope de caracteres, `solo-chat` fuera)
 * vienen del servidor, el mismo que arma el prompt de la llamada. Un fallo al
 * leer no bloquea el editor: la llamada sigue solo con el guion.
 */

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { BookOpen, Clock, ExternalLink, Info, Plus, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { clasesBoton } from "@/components/kit/botonClases";
import { pedirCrm } from "@/components/crm/acciones/apiCrm";
import { cn } from "@/utils/Utils";
import { estadoQueSabe, listaExcluidos, porcentajeTope, type ConocimientoVozApi } from "./queSabeLogica";

/** Chat › Base de conocimiento: donde se editan los fragmentos. */
export const RUTA_BASE_CONOCIMIENTO = "/app/chat/conocimiento";

export function QueSabeElAgente() {
  const t = useTranslations("crm.agentesIa.conocimiento");
  const locale = useLocale();
  const numero = (n: number) => new Intl.NumberFormat(locale, { useGrouping: true }).format(n);
  const [datos, setDatos] = useState<ConocimientoVozApi | null>(null);
  const [error, setError] = useState(false);
  const [verTodos, setVerTodos] = useState(false);

  const cargar = useCallback(async () => {
    setError(false);
    setDatos(null);
    try {
      const { data } = await pedirCrm<ConocimientoVozApi>("/api/crm/voice-agents/conocimiento");
      setDatos(data);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const estado = estadoQueSabe(datos, error);
  const contador =
    datos && estado !== "vacio"
      ? t("contador", { n: datos.fragmentos.length, usados: numero(datos.caracteres), tope: numero(datos.tope) })
      : datos
        ? t("contadorVacio")
        : null;

  return (
    <div className="space-y-4">
      <section aria-labelledby="ag-que-sabe" className="space-y-3 rounded-xl border border-line bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="ag-que-sabe" className="flex items-center gap-2 text-sm font-medium text-fg">
            <BookOpen aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {t("titulo")}
          </h3>
          {contador && (
            <Badge tono={estado === "tope" ? "advertencia" : estado === "vacio" ? "neutro" : "marca"} tamano="sm">
              {contador}
            </Badge>
          )}
        </div>

        {estado === "cargando" && (
          <div aria-busy="true" className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-3 animate-pulse rounded bg-subtle" />
            ))}
            <p className="text-xs text-fg-secondary">{t("cargando")}</p>
          </div>
        )}

        {estado === "error" && (
          <div role="alert" className="flex flex-wrap items-start gap-3 rounded-lg border border-line-warning bg-warning-subtle p-3">
            <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning-text" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-warning-text">{t("error.titulo")}</p>
              <p className="text-xs text-fg-secondary">{t("error.descripcion")}</p>
            </div>
            <button type="button" onClick={() => void cargar()} className={clasesBoton({ variante: "secundario", tamano: "sm" })}>
              {t("error.reintentar")}
            </button>
          </div>
        )}

        {estado === "vacio" && (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-line-strong bg-subtle px-4 py-6 text-center">
            <BookOpen aria-hidden="true" className="size-5 text-fg-muted" strokeWidth={1.5} />
            <p className="text-sm font-medium text-fg">{t("vacio.titulo")}</p>
            <p className="max-w-md text-xs text-fg-secondary">{t("vacio.descripcion")}</p>
            <Link href={RUTA_BASE_CONOCIMIENTO} className={clasesBoton({ variante: "secundario", tamano: "sm" })}>
              <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t("vacio.accion")}
            </Link>
          </div>
        )}

        {datos && (estado === "listo" || estado === "tope") && (
          <>
            <p className="text-xs text-fg-secondary">{t("descripcion")}</p>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-fg-secondary">{t("caracteres")}</span>
                <span className="font-medium tabular-nums text-fg">{t("deTope", { usados: numero(datos.caracteres), tope: numero(datos.tope) })}</span>
              </div>
              <div
                role="progressbar"
                aria-label={t("caracteres")}
                aria-valuemin={0}
                aria-valuemax={datos.tope}
                aria-valuenow={datos.caracteres}
                className="h-1.5 overflow-hidden rounded-full bg-subtle"
              >
                <div className={cn("h-full rounded-full", estado === "tope" ? "bg-danger" : "bg-brand")} style={{ width: `${porcentajeTope(datos)}%` }} />
              </div>
            </div>
            {estado === "tope" && (
              <p className="text-xs text-fg-secondary">
                {t("noEntran", {
                  n: datos.fuera_del_tope.length,
                  lista: listaExcluidos(
                    datos.fuera_del_tope,
                    (titulo, prioridad) => t("excluidoConPrioridad", { titulo, prioridad }),
                    (titulo) => t("excluido", { titulo }),
                    t("y"),
                  ),
                })}
              </p>
            )}
            {/* Móvil (1806:147338): el bloque se resume; la lista se abre con un botón. */}
            <button type="button" aria-expanded={verTodos} onClick={() => setVerTodos((v) => !v)} className="text-xs font-medium text-brand-deep hover:underline sm:hidden">
              {verTodos ? t("ocultar") : t("verFragmentos", { n: datos.fragmentos.length })}
            </button>
            <ul aria-label={t("titulo")} className={cn("space-y-2", !verTodos && "max-sm:hidden")}>
              {datos.fragmentos.map((f, i) => (
                <li key={f.id ?? i} className="flex items-start gap-3 rounded-lg border border-line px-3 py-2">
                  {f.prioridad !== null && (
                    <Badge tono="neutro" tamano="sm" className="shrink-0">
                      {t("prioridad", { n: f.prioridad })}
                    </Badge>
                  )}
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-fg">{f.titulo || t("sinTitulo")}</span>
                    <span className="block truncate text-xs text-fg-secondary">{f.resumen}</span>
                  </span>
                </li>
              ))}
              {datos.solo_chat.map((f, i) => (
                <li key={`chat-${f.id ?? i}`} className="flex items-center gap-3 rounded-lg bg-subtle px-3 py-2">
                  <Badge tono="advertencia" tamano="sm" className="shrink-0">
                    solo-chat
                  </Badge>
                  <span className="min-w-0 truncate text-xs text-fg-muted">{t("soloChat", { titulo: f.titulo || t("sinTitulo") })}</span>
                </li>
              ))}
            </ul>
            <p className="flex items-start gap-2 text-xs text-fg-secondary">
              <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
              {t("nota", { tope: numero(datos.tope) })}
            </p>
          </>
        )}

        {datos && estado !== "vacio" && (
          <Link href={RUTA_BASE_CONOCIMIENTO} className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-deep hover:underline">
            <ExternalLink aria-hidden="true" className="size-3.5" />
            {t("editar")}
          </Link>
        )}
      </section>

      {datos && (
        <p className="flex flex-wrap items-center gap-2 rounded-lg bg-subtle px-3 py-2 text-xs text-fg-secondary">
          <Clock aria-hidden="true" className="size-3.5 shrink-0" />
          <span className="min-w-0 flex-1">
            {t("silencio", { frase: datos.silencio.frase, aviso: datos.silencio.aviso_s, cierre: datos.silencio.cierre_s })}
          </span>
          <Badge tono="neutro" tamano="sm">
            {t("delEntorno")}
          </Badge>
        </p>
      )}
    </div>
  );
}
