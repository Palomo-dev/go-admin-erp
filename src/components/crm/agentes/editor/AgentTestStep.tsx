"use client";

/**
 * Paso 5 «Probar» del editor de agentes (Figma CRM 1318:775924): conversación
 * de prueba por texto con un cliente ficticio, con el agente TAL COMO ESTÁ EN
 * EL EDITOR (sin guardar). El servidor arma el mismo prompt, saludo,
 * conocimiento y herramientas que la llamada real; aquí no se marca a nadie ni
 * se ejecuta nada: lo que el agente haría sale como «sugerida».
 *
 * Estados: listo, enviando, sin créditos (402), sin permiso (403) y error.
 */

import React, { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { RotateCcw, SendHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { FormField } from "@/components/kit/FormField";
import { AvisoTonal } from "@/components/kit/AvisoTonal";
import { EmptyState } from "@/components/kit/EmptyState";
import { clasesBoton } from "@/components/kit/botonClases";
import { CLASE_CAMPO, CLASE_AREA } from "@/components/crm/kit/camposCrm";
import { pedirCrm, ErrorApiCrm } from "@/components/crm/acciones/apiCrm";
import { cn } from "@/utils/Utils";
import type { AgentFormState } from "./useAgentForm";
import {
  CLIENTES_PRUEBA,
  borradorParaPrueba,
  historialParaApi,
  type ClientePruebaId,
  type MensajePrueba,
} from "./pasosEditorLogica";

export interface EtapaPrueba {
  stageAgentId: string;
  nombre: string;
}

interface Props {
  form: AgentFormState;
  agentId: string | null;
  /** Etapas donde este agente actúa (paso 2). Vacío = prueba sin etapa. */
  etapas: readonly EtapaPrueba[];
}

interface Respuesta {
  greeting: string;
  reply: string;
  tool_calls: { id: string; name: string; status: "suggested" | "denied" }[];
}

type Problema = null | "sinCreditos" | "sinPermiso" | "incompleto" | "error";

export function AgentTestStep({ form, agentId, etapas }: Props) {
  const t = useTranslations("crm.agentesIa.editor.prueba");
  const [cliente, setCliente] = useState<ClientePruebaId>(CLIENTES_PRUEBA[0]);
  const [etapa, setEtapa] = useState<string>("");
  const [mensajes, setMensajes] = useState<MensajePrueba[]>([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [problema, setProblema] = useState<Problema>(null);
  const finRef = useRef<HTMLLIElement | null>(null);

  useEffect(() => {
    finRef.current?.scrollIntoView({ block: "nearest" });
  }, [mensajes.length]);

  const reiniciar = () => {
    setMensajes([]);
    setProblema(null);
  };

  const enviar = async () => {
    const mensaje = texto.trim();
    if (!mensaje || enviando) return;
    setEnviando(true);
    setProblema(null);
    const previos = mensajes;
    setMensajes([...previos, { rol: "cliente", texto: mensaje }]);
    setTexto("");
    try {
      const { data } = await pedirCrm<Respuesta>("/api/crm/voice-agents/test", {
        method: "POST",
        cuerpo: {
          agent_id: agentId,
          stage_agent_id: etapa || null,
          draft: borradorParaPrueba(form),
          customer: { name: t(`clientes.${cliente}.nombre`), context: t(`clientes.${cliente}.contexto`) },
          message: mensaje,
          history: historialParaApi(previos),
        },
      });
      setMensajes((m) => [
        ...(previos.length === 0 ? [{ rol: "agente" as const, texto: data.greeting }] : []),
        ...m,
        { rol: "agente", texto: data.reply, herramientas: data.tool_calls },
      ]);
    } catch (e) {
      // El mensaje no se perdió: vuelve al campo para reintentar.
      setMensajes(previos);
      setTexto(mensaje);
      const st = e instanceof ErrorApiCrm ? e.status : 0;
      setProblema(st === 402 ? "sinCreditos" : st === 403 ? "sinPermiso" : st === 400 ? "incompleto" : "error");
    } finally {
      setEnviando(false);
    }
  };

  if (problema === "sinPermiso") {
    return <EmptyState variante="forbidden" titulo={t("sinPermiso.titulo")} descripcion={t("sinPermiso.descripcion")} />;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField etiqueta={t("cliente")}>
          <select className={CLASE_CAMPO} value={cliente} onChange={(e) => { setCliente(e.target.value as ClientePruebaId); reiniciar(); }} aria-label={t("cliente")}>
            {CLIENTES_PRUEBA.map((c) => (
              <option key={c} value={c}>
                {t(`clientes.${c}.etiqueta`)}
              </option>
            ))}
          </select>
        </FormField>
        <FormField etiqueta={t("etapa")} ayuda={etapas.length === 0 ? t("sinEtapas") : undefined}>
          <select className={CLASE_CAMPO} value={etapa} onChange={(e) => { setEtapa(e.target.value); reiniciar(); }} aria-label={t("etapa")} disabled={etapas.length === 0}>
            <option value="">{t("sinEtapa")}</option>
            {etapas.map((s) => (
              <option key={s.stageAgentId} value={s.stageAgentId}>
                {s.nombre}
              </option>
            ))}
          </select>
        </FormField>
      </div>

      <AvisoTonal tono="informacion" compacto titulo={t("aviso.titulo")} descripcion={t("aviso.descripcion")} />

      {problema === "sinCreditos" && <AvisoTonal tono="peligro" rol="alert" compacto titulo={t("sinCreditos.titulo")} descripcion={t("sinCreditos.descripcion")} />}
      {problema === "incompleto" && <AvisoTonal tono="advertencia" rol="alert" compacto titulo={t("incompleto.titulo")} descripcion={t("incompleto.descripcion")} />}
      {problema === "error" && <AvisoTonal tono="peligro" rol="alert" compacto titulo={t("error.titulo")} descripcion={t("error.descripcion")} />}

      <div className="rounded-xl border border-line bg-subtle">
        <ol className="max-h-[50dvh] min-h-40 space-y-3 overflow-y-auto p-3" aria-label={t("conversacion")} aria-live="polite">
          {mensajes.length === 0 && <li className="py-6 text-center text-[13px] text-fg-secondary">{t("vacio")}</li>}
          {mensajes.map((m, i) => (
            <li key={i} className={cn("flex flex-col gap-1", m.rol === "cliente" ? "items-end" : "items-start")}>
              <span className="text-xs font-medium text-fg-secondary">
                {m.rol === "agente" ? t("agente", { nombre: form.name.trim() || t("agenteSinNombre") }) : t("tu")}
              </span>
              <p className={cn("max-w-[85%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm", m.rol === "cliente" ? "bg-brand-tint text-fg" : "bg-surface text-fg")}>{m.texto}</p>
              {m.herramientas && m.herramientas.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-fg-secondary">
                  {t("herramientas")}
                  {m.herramientas.map((h) => (
                    <Badge key={h.id} tono={h.status === "suggested" ? "informacion" : "neutro"} tamano="sm">
                      {t(h.status === "suggested" ? "sugerida" : "rechazada", { nombre: h.name })}
                    </Badge>
                  ))}
                </div>
              )}
            </li>
          ))}
          {enviando && <li className="text-xs text-fg-secondary">{t("escribiendo")}</li>}
          <li ref={finRef} aria-hidden="true" />
        </ol>
        <form
          className="flex items-end gap-2 border-t border-line p-2"
          onSubmit={(e) => {
            e.preventDefault();
            void enviar();
          }}
        >
          <label className="sr-only" htmlFor="prueba-agente-texto">
            {t("escribe")}
          </label>
          <textarea
            id="prueba-agente-texto"
            className={cn(CLASE_AREA, "min-h-10 flex-1 resize-none")}
            rows={1}
            value={texto}
            placeholder={t("escribe")}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void enviar();
              }
            }}
          />
          <button type="submit" className={clasesBoton()} disabled={enviando || !texto.trim()} aria-label={t("enviar")}>
            <SendHorizontal aria-hidden="true" className="size-4" strokeWidth={1.5} />
          </button>
          <button type="button" className={clasesBoton({ variante: "secundario" })} disabled={enviando || mensajes.length === 0} onClick={reiniciar}>
            <RotateCcw aria-hidden="true" className="size-4" strokeWidth={1.5} />
            <span className="hidden sm:inline">{t("reiniciar")}</span>
          </button>
        </form>
      </div>
    </div>
  );
}
