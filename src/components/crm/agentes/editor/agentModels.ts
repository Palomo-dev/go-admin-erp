"use client";

/**
 * Modelos de lenguaje que puede usar un agente de voz (UX móvil ronda 1, UXM-D).
 *
 * Antes el campo «Modelo» era un `Input` libre con un nombre de modelo cableado. Ahora
 * sale del mismo catálogo que el resto del CRM: `GET /api/chat/ai/modelos`, que
 * une `ai_modelos_disponibles` con la tarifa vigente y con las credenciales de la
 * organización (propias o de la plataforma, vía variables de entorno). Aquí no
 * se cablea ningún nombre de modelo: si el catálogo falla, el campo vuelve a ser
 * de texto libre y se dice por qué.
 */

import { useEffect, useState } from "react";
import type { CatalogoModelos, ModeloIA } from "@/lib/services/aiSettingsService";

/**
 * Misma ruta que `fetchCatalogoModelos` de `aiSettingsService`. Se llama aquí
 * directamente porque ese módulo instancia el cliente de Supabase del navegador
 * al importarse, y esta lógica se prueba sin navegador.
 */
async function fetchCatalogoModelos(): Promise<CatalogoModelos> {
  const res = await fetch("/api/chat/ai/modelos", { cache: "no-store" });
  if (!res.ok) throw new Error("No se pudo cargar el catálogo de modelos");
  return res.json();
}

export interface ModelOption {
  value: string;
  label: string;
  provider: string;
  recomendado: boolean;
  /** Texto corto de ayuda (gama · nota). */
  hint: string | null;
  /** `true` cuando es el valor guardado y ya no figura en el catálogo. */
  fueraDeCatalogo: boolean;
}

const GAMA_LABELS: Record<ModeloIA["gama"], string> = {
  economico: "Económico",
  equilibrado: "Equilibrado",
  premium: "Premium",
  legacy: "Antiguo",
};

/**
 * Opciones del selector: solo modelos de proveedores con credenciales. Si el
 * valor actual (p. ej. de un agente antiguo) no está entre ellas, se añade al
 * final marcado como «fuera del catálogo» para no perderlo al guardar.
 */
export function resolveModelOptions(
  catalog: CatalogoModelos | null,
  current: string,
): ModelOption[] {
  if (!catalog) return [];
  const usable = new Set(catalog.proveedores.filter((p) => p.usable).map((p) => p.value));
  const options: ModelOption[] = catalog.modelos
    .filter((m) => usable.has(m.provider))
    .map((m) => ({
      value: m.value,
      label: m.label,
      provider: m.provider,
      recomendado: m.recomendado,
      hint: [GAMA_LABELS[m.gama] ?? m.gama, m.nota].filter(Boolean).join(" · ") || null,
      fueraDeCatalogo: false,
    }));
  const trimmed = current.trim();
  if (trimmed && !options.some((o) => o.value === trimmed)) {
    options.push({
      value: trimmed,
      label: trimmed,
      provider: "",
      recomendado: false,
      hint: "Guardado en el agente, pero ya no está en el catálogo",
      fueraDeCatalogo: true,
    });
  }
  return options;
}

/** Modelo con el que nace un agente nuevo: el recomendado utilizable; si no, el primero utilizable. */
export function defaultModel(catalog: CatalogoModelos | null): string | null {
  const options = resolveModelOptions(catalog, "");
  return (options.find((o) => o.recomendado) ?? options[0])?.value ?? null;
}

export interface AgentModelsState {
  options: ModelOption[];
  loading: boolean;
  /** El catálogo no se pudo leer: el campo pasa a texto libre. */
  error: string | null;
  defaultValue: string | null;
}

export function useAgentModels(current: string): AgentModelsState {
  const [catalog, setCatalog] = useState<CatalogoModelos | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchCatalogoModelos()
      .then((c) => {
        if (alive) setCatalog(c);
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : "Error desconocido");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  return {
    options: resolveModelOptions(catalog, current),
    loading,
    error,
    defaultValue: defaultModel(catalog),
  };
}
