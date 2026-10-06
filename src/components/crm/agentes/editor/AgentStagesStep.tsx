"use client";

/**
 * Paso 2 «Guion por etapas» del editor de agentes (Figma CRM 1313:773766):
 * asigna el agente a las etapas del embudo y dice qué debe conseguir en cada
 * una. Una fila de `stage_agents` (canal voz) por etapa; las de cierre (ganada
 * o perdida) no admiten agente.
 *
 * Lee y escribe por `/api/crm/stage-agents` (organización de la sesión). Solo
 * un administrador puede escribir: el GET lo dice en `puede_editar`, así que
 * aquí no se ofrecen controles que el servidor rechazaría. Cada etapa se
 * guarda sola; el resto del agente se guarda al final del editor.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Bot, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/use-toast";
import { FormField } from "@/components/kit/FormField";
import { AvisoTonal } from "@/components/kit/AvisoTonal";
import { EmptyState } from "@/components/kit/EmptyState";
import { clasesBoton } from "@/components/kit/botonClases";
import { CLASE_AREA, CLASE_CAMPO } from "@/components/crm/kit/camposCrm";
import { pedirCrm } from "@/components/crm/acciones/apiCrm";
import { useCrmLookups } from "@/components/crm/shared/useCrmLookups";
import { STAGE_AGENT_OBJECTIVES, STAGE_AGENT_TRIGGERS } from "@/lib/services/crm/stageAgentService";
import {
  cuerpoAsignacion,
  faltaEnAsignacion,
  filasEtapas,
  objetivoInicial,
  resumenEtapas,
  type AsignacionEtapa,
  type FilaEtapa,
} from "./pasosEditorLogica";
import type { EtapaPrueba } from "./AgentTestStep";

interface Props {
  agentId: string | null;
  purposeType: string;
  /** Etapas donde actúa este agente: las usa el paso «Probar». */
  onEtapasChange?: (etapas: EtapaPrueba[]) => void;
}

export function AgentStagesStep({ agentId, purposeType, onEtapasChange }: Props) {
  const t = useTranslations("crm.agentesIa.editor.etapas");
  const lookups = useCrmLookups();
  const [pipelineId, setPipelineId] = useState<string>("");
  const [asignaciones, setAsignaciones] = useState<AsignacionEtapa[]>([]);
  const [puedeEditar, setPuedeEditar] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);

  const efectivo = pipelineId || lookups.pipelines.find((p) => p.is_default)?.id || lookups.pipelines[0]?.id || "";

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(false);
    try {
      const { data, extra } = await pedirCrm<AsignacionEtapa[]>("/api/crm/stage-agents");
      setAsignaciones(data ?? []);
      setPuedeEditar(extra.puede_editar === true);
    } catch {
      setError(true);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const filas = useMemo(() => filasEtapas(lookups.stages, asignaciones, efectivo || null, agentId), [lookups.stages, asignaciones, efectivo, agentId]);
  const resumen = resumenEtapas(filasEtapas(lookups.stages, asignaciones, null, agentId));

  useEffect(() => {
    if (!onEtapasChange) return;
    const todas = filasEtapas(lookups.stages, asignaciones, null, agentId).filter((f) => f.estado === "este" && f.asignacion?.is_active);
    onEtapasChange(todas.map((f) => ({ stageAgentId: f.asignacion!.id, nombre: f.etapa.name })));
  }, [lookups.stages, asignaciones, agentId, onEtapasChange]);

  if (!agentId) {
    return <AvisoTonal tono="informacion" titulo={t("nuevo.titulo")} descripcion={t("nuevo.descripcion")} />;
  }
  if (cargando || lookups.loading) {
    return (
      <div aria-busy="true" aria-label={t("cargando")} className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl border border-line bg-subtle" />
        ))}
      </div>
    );
  }
  if (error || lookups.error) {
    return <EmptyState variante="error" titulo={t("error.titulo")} descripcion={t("error.descripcion")} onReintentar={() => { void cargar(); void lookups.reload(); }} />;
  }
  if (lookups.pipelines.length === 0) {
    return <EmptyState variante="empty" icono={Bot} titulo={t("sinEmbudo.titulo")} descripcion={t("sinEmbudo.descripcion")} accion={{ etiqueta: t("sinEmbudo.ir"), href: "/app/crm/pipeline" }} />;
  }

  return (
    <div className="space-y-4">
      <FormField etiqueta={t("embudo")} ayuda={t("embudoAyuda")}>
        <select className={CLASE_CAMPO} value={efectivo} onChange={(e) => setPipelineId(e.target.value)}>
          {lookups.pipelines.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </FormField>
      {!puedeEditar && <AvisoTonal tono="advertencia" compacto titulo={t("soloLectura.titulo")} descripcion={t("soloLectura.descripcion")} />}
      <p className="text-[13px] text-fg-secondary" aria-live="polite">
        {t("resumen", { este: resumen.este, otro: resumen.otro })}
      </p>
      {filas.length === 0 ? (
        <EmptyState variante="empty" compacto titulo={t("sinEtapas")} />
      ) : (
        <ol className="space-y-3">
          {filas.map((f, i) => (
            <TarjetaEtapa key={f.etapa.id} fila={f} numero={i + 1} agentId={agentId} purposeType={purposeType} puedeEditar={puedeEditar} onCambio={cargar} />
          ))}
        </ol>
      )}
    </div>
  );
}

function TarjetaEtapa({ fila, numero, agentId, purposeType, puedeEditar, onCambio }: {
  fila: FilaEtapa;
  numero: number;
  agentId: string;
  purposeType: string;
  puedeEditar: boolean;
  onCambio: () => Promise<void>;
}) {
  const t = useTranslations("crm.agentesIa.editor.etapas");
  const a = fila.asignacion;
  const [borrador, setBorrador] = useState(() => ({
    objective: a?.objective ?? objetivoInicial(purposeType, STAGE_AGENT_OBJECTIVES),
    objective_prompt: a?.objective_prompt ?? "",
    trigger_on: a?.trigger_on ?? "manual",
    action_policy: a?.action_policy ?? "suggest",
    is_active: a?.is_active ?? true,
  }));
  const [ocupado, setOcupado] = useState(false);
  const falta = faltaEnAsignacion({ ...borrador, product_id: a?.product_id ?? null });

  const guardar = async (cambios: Partial<typeof borrador> = {}) => {
    setOcupado(true);
    try {
      await pedirCrm("/api/crm/stage-agents", { method: "POST", cuerpo: cuerpoAsignacion(fila.etapa.id, agentId, a, { ...borrador, ...cambios }) });
      toast({ title: t("ok.guardada", { etapa: fila.etapa.name }) });
      await onCambio();
    } catch (e) {
      toast({ title: t("errores.guardar"), description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    } finally {
      setOcupado(false);
    }
  };
  const quitar = async () => {
    if (!a) return;
    setOcupado(true);
    try {
      await pedirCrm(`/api/crm/stage-agents?id=${encodeURIComponent(a.id)}`, { method: "DELETE" });
      toast({ title: t("ok.quitada", { etapa: fila.etapa.name }) });
      await onCambio();
    } catch (e) {
      toast({ title: t("errores.guardar"), description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    } finally {
      setOcupado(false);
    }
  };

  const titulo = (
    <p className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">
      {numero} · {fila.etapa.name}
    </p>
  );

  if (fila.estado !== "este") {
    return (
      <li className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface p-4">
        <div className="min-w-0 flex-1">
          {titulo}
          <p className="text-xs text-fg-secondary">{fila.estado === "otro" ? t("deOtro") : t("libre")}</p>
        </div>
        {fila.estado === "otro" && <Badge tono="neutro" tamano="sm">{t("otroAgente")}</Badge>}
        {puedeEditar && (
          <button type="button" className={clasesBoton({ variante: "secundario", tamano: "sm" })} disabled={ocupado || !!falta} onClick={() => void guardar()}>
            <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {fila.estado === "otro" ? t("reasignar") : t("asignar")}
          </button>
        )}
      </li>
    );
  }

  const set = (p: Partial<typeof borrador>) => setBorrador((b) => ({ ...b, ...p }));
  return (
    <li className="space-y-3 rounded-xl border border-line-brand bg-surface p-4">
      <div className="flex items-center gap-3">
        {titulo}
        <Badge tono={borrador.is_active ? "exito" : "neutro"} tamano="sm">{borrador.is_active ? t("activa") : t("pausada")}</Badge>
        <Switch checked={borrador.is_active} disabled={!puedeEditar || ocupado} onCheckedChange={(v) => set({ is_active: v })} aria-label={t("activaAria", { etapa: fila.etapa.name })} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <FormField etiqueta={t("objetivo")}>
          <select className={CLASE_CAMPO} value={borrador.objective} disabled={!puedeEditar} onChange={(e) => set({ objective: e.target.value })}>
            {STAGE_AGENT_OBJECTIVES.map((o) => (
              <option key={o} value={o}>
                {t(`objetivos.${o}`)}
              </option>
            ))}
          </select>
        </FormField>
        <FormField etiqueta={t("cuando")}>
          <select className={CLASE_CAMPO} value={borrador.trigger_on} disabled={!puedeEditar} onChange={(e) => set({ trigger_on: e.target.value })}>
            {STAGE_AGENT_TRIGGERS.map((o) => (
              <option key={o} value={o}>
                {t(`disparadores.${o}`)}
              </option>
            ))}
          </select>
        </FormField>
        <FormField etiqueta={t("acciones")}>
          <select className={CLASE_CAMPO} value={borrador.action_policy} disabled={!puedeEditar} onChange={(e) => set({ action_policy: e.target.value })}>
            <option value="suggest">{t("politicas.suggest")}</option>
            <option value="auto">{t("politicas.auto")}</option>
          </select>
        </FormField>
      </div>
      <FormField etiqueta={t("conseguir")} error={falta ? t(`faltan.${falta}`) : null}>
        <textarea className={CLASE_AREA} value={borrador.objective_prompt} disabled={!puedeEditar} placeholder={t("conseguirPlaceholder")} onChange={(e) => set({ objective_prompt: e.target.value })} />
      </FormField>
      {puedeEditar && (
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button type="button" className={clasesBoton({ variante: "fantasma", tamano: "sm" })} disabled={ocupado} onClick={() => void quitar()}>
            {t("quitar")}
          </button>
          <button type="button" className={clasesBoton({ tamano: "sm" })} disabled={ocupado || !!falta} onClick={() => void guardar()}>
            {t("guardar")}
          </button>
        </div>
      )}
    </li>
  );
}
