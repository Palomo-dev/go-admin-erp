"use client";

/**
 * useVoiceCatalog — lectura canónica del catálogo de voces (FASE 06).
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
 * El hook solo informa del estado de la credencial; no lo disimula. Desde el
 * 2026-09-14 la biblioteca, la previsualización y la clonación se han ejecutado
 * contra el proveedor real (ver `voiceLibraryService.ts`).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { getOrganizationId, ORGANIZATION_CHANGED_EVENT } from "@/lib/hooks/useOrganization";
import { fetchJson } from "@/lib/utils/fetchJson";
import { tiempoLecturaCrm } from "@/lib/utils/crmReadTimeout";
import { describeError } from "@/lib/utils/errorMessage";
import { libraryLabel, type LibraryTagKey } from "@/lib/services/crm/voiceLibrary";

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
  /** Enriquecido por el servidor con lo que sabe el proveedor (puede faltar). */
  preview_url?: string | null;
  labels?: Record<string, string>;
  provider_category?: string | null;
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

/** Plan del proveedor de voz, según el servidor; `null` cuando no se pudo saber. */
export interface VoiceAccountInfo {
  tier: string;
  free_tier: boolean;
  can_clone: boolean;
}

export interface VoiceCatalogState {
  voices: VoiceCatalogRow[];
  /** La voz marcada por defecto para la organización, si existe. */
  defaultVoice: VoiceCatalogRow | null;
  /** Primera carga (o reintento tras error): la lista aún no existe y se pinta esqueleto. */
  loading: boolean;
  /** Recarga con lista ya en pantalla: se refresca en sitio, sin esqueleto (R3). */
  refreshing: boolean;
  /** Error real de la lectura del catálogo (nunca se traga). */
  error: string | null;
  tts: TtsCredentialStatus;
  /** Comprobación pendiente; no implica un fallo del registry. */
  ttsLoading: boolean;
  account: VoiceAccountInfo | null;
  reload: (options?: { force?: boolean }) => Promise<void>;
}

export function useVoiceCatalog(): VoiceCatalogState {
  const [voices, setVoices] = useState<VoiceCatalogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tts, setTts] = useState<TtsCredentialStatus>(TTS_UNKNOWN);
  const [ttsLoading, setTtsLoading] = useState(true);
  const [account, setAccount] = useState<VoiceAccountInfo | null>(null);
  const loadedOnce = useRef(false);
  const readFailed = useRef(false);
  const revision = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const pending = useRef<{ scope: number; promise: Promise<void> } | null>(null);

  const invalidate = useCallback(() => {
    revision.current++;
    controllerRef.current?.abort();
    pending.current = null;
  }, []);

  const reload = useCallback((reloadOptions?: { force?: boolean }): Promise<void> => {
    const scope = getOrganizationId();
    // Dos clics o callbacks simultáneos comparten la lectura de esta instancia.
    if (!reloadOptions?.force && !readFailed.current && pending.current?.scope === scope && !controllerRef.current?.signal.aborted) return pending.current.promise;
    controllerRef.current?.abort();
    const controller = new AbortController(), current = ++revision.current;
    controllerRef.current = controller;
    const active = () => current === revision.current && !controller.signal.aborted && scope === getOrganizationId();
    if (loadedOnce.current) setRefreshing(true);
    else setLoading(true);
    readFailed.current = false;
    setError(null);
    setTtsLoading(true);
    const options = { cache: "no-store" as const, credentials: "include" as const, signal: controller.signal, timeoutMs: tiempoLecturaCrm() };
    const catalog = async () => {
      try {
        const json = await fetchJson<{ success?: boolean; error?: string; data?: VoiceCatalogRow[]; account?: VoiceAccountInfo | null }>("/api/crm/voices", options);
        if (!active()) return;
        if (!json?.success || !Array.isArray(json.data)) throw new Error(json?.error || "La respuesta del catálogo de voces no indicó éxito");
        setVoices(json.data);
        setAccount(json.account ?? null);
        loadedOnce.current = true;
      } catch (err) {
        if (!active()) return;
        readFailed.current = true;
        setVoices([]);
        setAccount(null);
        loadedOnce.current = false;
        setError(describeError(err));
      } finally {
        if (active()) { setLoading(false); setRefreshing(false); }
      }
    };
    const providers = async () => {
      try {
        const json = await fetchJson<{ success?: boolean; error?: string; items?: ProviderItem[] }>("/api/crm/config/providers?category=tts", options);
        if (!active()) return;
        if (!json?.success || !Array.isArray(json.items)) throw new Error(json?.error || "La respuesta de proveedores no indicó éxito");
        const own = json.items.filter((i) => i.configured).map((i) => i.provider);
        const platform = json.items.filter((i) => !i.configured && i.platform_available).map((i) => i.provider);
        setTts({ ready: own.length > 0 || platform.length > 0, ownProviders: own, platformProviders: platform, unknown: false });
      } catch {
        if (active()) { readFailed.current = true; setTts(TTS_UNKNOWN); }
      } finally {
        if (active()) setTtsLoading(false);
      }
    };
    // Una lectura lenta del proveedor no bloquea la comprobación de credenciales.
    const promise = Promise.all([catalog(), providers()]).then(() => undefined).finally(() => {
      if (current === revision.current) pending.current = null;
    });
    pending.current = { scope, promise };
    return promise;
  }, []);

  useEffect(() => {
    const reset = () => {
      invalidate();
      loadedOnce.current = false;
      setVoices([]); setAccount(null); setTts(TTS_UNKNOWN); setError(null);
      void reload();
    };
    void reload();
    window.addEventListener(ORGANIZATION_CHANGED_EVENT, reset);
    return () => {
      invalidate();
      window.removeEventListener(ORGANIZATION_CHANGED_EVENT, reset);
    };
  }, [reload, invalidate]);

  return {
    voices,
    defaultVoice: voices.find((v) => v.is_default && v.is_active) ?? null,
    loading, refreshing, error, tts, ttsLoading, account, reload,
  };
}

/** Etiqueta corta del origen de una voz («De la biblioteca», «Clonada», «Diseñada»). */
export const VOICE_KIND_LABELS: Record<string, string> = {
  library: "De la biblioteca",
  cloned: "Clonada",
  designed: "Diseñada",
};

const CATALOG_TAG_KEYS: LibraryTagKey[] = ["language", "gender", "age", "accent", "use_case"];

/** Etiquetas legibles (idioma, género, edad, acento, uso) de una voz del catálogo. */
export function catalogVoiceTags(voice: Pick<VoiceCatalogRow, "labels">): Array<{ key: string; label: string }> {
  return CATALOG_TAG_KEYS.map((k) => ({ key: k, value: voice.labels?.[k] ?? "" }))
    .filter((t) => t.value)
    .map((t) => ({ key: t.key, label: libraryLabel(t.key, t.value) }));
}
