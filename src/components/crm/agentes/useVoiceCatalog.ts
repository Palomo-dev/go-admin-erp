"use client";

/**
 * useVoiceCatalog — estado compartido del catálogo de voces (FASE 06).
 *
 * Lo usan la pestaña «Voces» (`VoicesPanel`) y la pestaña «Voz» del editor de
 * agente (`AgentEditorDialog`), para que ambas pinten la MISMA lista, el mismo
 * estado de credencial y el mismo mensaje cuando no hay nada que elegir.
 *
 * Dos lecturas, ninguna silenciosa:
 *  - `GET /api/crm/voices` → catálogo de la organización (tabla `voices`).
 *  - `GET /api/crm/config/providers?category=tts` → si existe una credencial de
 *    TTS utilizable, propia de la organización (`configured`) o de la plataforma
 *    (`platform_available`). El registry ya descarta los placeholders de
 *    `.env.example`, así que una clave de ejemplo cuenta como "no hay".
 *
 * ⚠️ NO VERIFICADO: que una voz de ElevenLabs suene de verdad depende de una
 * `ELEVENLABS_API_KEY` real. En este entorno la clave es el marcador de ejemplo
 * y el proveedor devuelve 401, así que importar/clonar/probar no se ha podido
 * ejecutar contra el proveedor. El hook solo informa del estado; no lo disimula.
 */

import { useCallback, useEffect, useState } from "react";

export interface VoiceCatalogRow {
  id: string;
  provider: string;
  provider_voice_id: string;
  name: string;
  description: string | null;
  kind: string;
  language: string;
  model_id: string;
  consent_recorded_at: string | null;
  is_default: boolean;
  is_active: boolean;
}

export interface TtsCredentialStatus {
  /** Hay alguna credencial de TTS utilizable (propia o de la plataforma). */
  ready: boolean;
  /** Proveedores de TTS con credencial propia de la organización. */
  ownProviders: string[];
  /** Proveedores de TTS que funcionan con la clave de la plataforma. */
  platformProviders: string[];
  /** No se pudo consultar el registry (no es lo mismo que "no hay clave"). */
  unknown: boolean;
}

const TTS_UNKNOWN: TtsCredentialStatus = { ready: false, ownProviders: [], platformProviders: [], unknown: true };

/** Configuración › CRM › Proveedores e IA: donde se guardan las claves de voz e IA. */
export const PROVIDERS_SETTINGS_HREF = "/app/configuracion?modulo=crm&tab=proveedores";

interface ProviderItem {
  category: string;
  provider: string;
  configured?: boolean;
  platform_available?: boolean;
  is_active?: boolean;
}

export interface VoiceCatalogState {
  voices: VoiceCatalogRow[];
  /** La voz marcada por defecto para la organización, si existe. */
  defaultVoice: VoiceCatalogRow | null;
  loading: boolean;
  /** Error real de la lectura del catálogo (nunca se traga). */
  error: string | null;
  tts: TtsCredentialStatus;
  reload: () => Promise<void>;
}

export function useVoiceCatalog(): VoiceCatalogState {
  const [voices, setVoices] = useState<VoiceCatalogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tts, setTts] = useState<TtsCredentialStatus>(TTS_UNKNOWN);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/crm/voices", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.error || `Error ${res.status} al leer el catálogo de voces`);
      setVoices((json.data ?? []) as VoiceCatalogRow[]);
    } catch (err) {
      setVoices([]);
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }

    // El estado de la credencial es informativo: si falla, se declara "no se pudo
    // comprobar" en vez de afirmar que no hay clave.
    try {
      const res = await fetch("/api/crm/config/providers?category=tts", { cache: "no-store", credentials: "include" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.error || `Error ${res.status}`);
      const items = (json.items ?? []) as ProviderItem[];
      const own = items.filter((i) => i.configured).map((i) => i.provider);
      const platform = items.filter((i) => !i.configured && i.platform_available).map((i) => i.provider);
      setTts({ ready: own.length > 0 || platform.length > 0, ownProviders: own, platformProviders: platform, unknown: false });
    } catch {
      setTts(TTS_UNKNOWN);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return {
    voices,
    defaultVoice: voices.find((v) => v.is_default && v.is_active) ?? null,
    loading,
    error,
    tts,
    reload,
  };
}

/** Etiqueta corta del origen de una voz («De la biblioteca», «Clonada», «Diseñada»). */
export const VOICE_KIND_LABELS: Record<string, string> = {
  library: "De la biblioteca",
  cloned: "Clonada",
  designed: "Diseñada",
};
