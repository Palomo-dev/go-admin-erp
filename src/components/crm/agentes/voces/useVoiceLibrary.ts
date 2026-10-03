"use client";

/**
 * useVoiceLibrary — biblioteca pública de ElevenLabs con filtros y scroll
 * incremental (brief UX 6.1). Llama a `GET /api/crm/voices/library`; la clave
 * del proveedor nunca llega aquí.
 *
 * La búsqueda se retrasa 300 ms y cada cambio de filtros aborta la petición
 * anterior, para que una respuesta lenta no pise a la nueva.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { LibraryVoice } from "@/lib/services/crm/voiceLibrary";
import { fetchJson } from "@/lib/utils/fetchJson";
import { describeError } from "@/lib/utils/errorMessage";
import { getOrganizationId, ORGANIZATION_CHANGED_EVENT } from "@/lib/hooks/useOrganization";

export interface LibraryUiFilters {
  search: string;
  language: string;
  gender: string;
  use_case: string;
}

export const DEFAULT_LIBRARY_FILTERS: LibraryUiFilters = { search: "", language: "es", gender: "", use_case: "" };

interface LibraryResponse {
  success?: boolean;
  error?: string;
  data?: { voices: LibraryVoice[]; has_more: boolean; total_count: number; page: number };
}

export interface VoiceLibraryState {
  filters: LibraryUiFilters;
  setFilter: (key: keyof LibraryUiFilters, value: string) => void;
  clearFilters: () => void;
  voices: LibraryVoice[];
  totalCount: number;
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  loadMore: () => void;
  retry: () => void;
}

export function useVoiceLibrary(): VoiceLibraryState {
  const [filters, setFilters] = useState<LibraryUiFilters>(DEFAULT_LIBRARY_FILTERS);
  const [debounced, setDebounced] = useState<LibraryUiFilters>(DEFAULT_LIBRARY_FILTERS);
  const [voices, setVoices] = useState<LibraryVoice[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const revision = useRef(0);
  const pending = useRef<{ key: string; promise: Promise<void> } | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(filters), filters.search ? 300 : 0);
    return () => clearTimeout(t);
  }, [filters]);

  const fetchPage = useCallback((f: LibraryUiFilters, pageToLoad: number, append: boolean): Promise<void> => {
    const scope = getOrganizationId();
    const params = new URLSearchParams();
    params.set("page", String(pageToLoad));
    if (f.search.trim()) params.set("search", f.search.trim());
    if (f.language) params.set("language", f.language);
    if (f.gender) params.set("gender", f.gender);
    if (f.use_case) params.set("use_case", f.use_case);
    const key = `${scope}:${params.toString()}`;
    if (pending.current?.key === key && !abortRef.current?.signal.aborted) return pending.current.promise;
    abortRef.current?.abort();
    const controller = new AbortController(), current = ++revision.current;
    abortRef.current = controller;
    const active = () => current === revision.current && !controller.signal.aborted && scope === getOrganizationId();
    if (append) setLoadingMore(true);
    else {
      setLoading(true); setLoadingMore(false);
      setVoices([]); setTotalCount(0); setHasMore(false); setPage(0);
    }
    setError(null);
    const read = async () => {
      try {
        const json = await fetchJson<LibraryResponse>(`/api/crm/voices/library?${params.toString()}`, {
          cache: "no-store", signal: controller.signal,
        });
        if (!active()) return;
        if (!json?.success || !json.data || !Array.isArray(json.data.voices)) throw new Error(json?.error || "La respuesta no indicó éxito");
        const incoming = json.data.voices;
        setVoices((prev) => {
          const seen = new Set(append ? prev.map((v) => v.voice_id) : []);
          const unique = incoming.filter((v) => { if (seen.has(v.voice_id)) return false; seen.add(v.voice_id); return true; });
          return append ? [...prev, ...unique] : unique;
        });
        setTotalCount(json.data.total_count); setHasMore(json.data.has_more); setPage(pageToLoad);
      } catch (err) {
        if (active()) setError(describeError(err));
      } finally {
        if (active()) { setLoading(false); setLoadingMore(false); }
      }
    };
    const promise = read().finally(() => { if (current === revision.current) pending.current = null; });
    pending.current = { key, promise };
    return promise;
  }, []);

  useEffect(() => {
    void fetchPage(debounced, 0, false);
  }, [debounced, attempt, fetchPage]);

  const invalidate = useCallback(() => {
    revision.current++; abortRef.current?.abort(); pending.current = null;
  }, []);

  useEffect(() => {
    const changed = () => {
      invalidate();
      setVoices([]); setTotalCount(0); setHasMore(false); setPage(0); setError(null);
      setLoading(true); setLoadingMore(false); setAttempt((n) => n + 1);
    };
    window.addEventListener(ORGANIZATION_CHANGED_EVENT, changed);
    return () => {
      invalidate();
      window.removeEventListener(ORGANIZATION_CHANGED_EVENT, changed);
    };
  }, [invalidate]);

  const setFilter = useCallback((key: keyof LibraryUiFilters, value: string) => {
    setFilters((prev) => prev[key] === value ? prev : { ...prev, [key]: value });
  }, []);

  const clearFilters = useCallback(() => setFilters((prev) =>
    Object.keys(DEFAULT_LIBRARY_FILTERS).every(key => prev[key as keyof LibraryUiFilters] === DEFAULT_LIBRARY_FILTERS[key as keyof LibraryUiFilters]) ? prev : DEFAULT_LIBRARY_FILTERS
  ), []);

  const loadMore = useCallback(() => {
    if (loading || loadingMore || error || !hasMore || pending.current) return;
    void fetchPage(debounced, page + 1, true);
  }, [loading, loadingMore, error, hasMore, fetchPage, debounced, page]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return { filters, setFilter, clearFilters, voices, totalCount, hasMore, loading, loadingMore, error, loadMore, retry };
}
