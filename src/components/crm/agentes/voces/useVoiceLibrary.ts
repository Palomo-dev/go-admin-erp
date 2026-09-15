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

  useEffect(() => {
    const t = setTimeout(() => setDebounced(filters), filters.search ? 300 : 0);
    return () => clearTimeout(t);
  }, [filters]);

  const fetchPage = useCallback(async (f: LibraryUiFilters, pageToLoad: number, append: boolean) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("page", String(pageToLoad));
      if (f.search.trim()) params.set("search", f.search.trim());
      if (f.language) params.set("language", f.language);
      if (f.gender) params.set("gender", f.gender);
      if (f.use_case) params.set("use_case", f.use_case);
      const json = await fetchJson<LibraryResponse>(`/api/crm/voices/library?${params.toString()}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!json?.success || !json.data) throw new Error(json?.error || "La respuesta no indicó éxito");
      const incoming = json.data.voices;
      setVoices((prev) => {
        if (!append) return incoming;
        const seen = new Set(prev.map((v) => v.voice_id));
        return [...prev, ...incoming.filter((v) => !seen.has(v.voice_id))];
      });
      setTotalCount(json.data.total_count);
      setHasMore(json.data.has_more);
      setPage(pageToLoad);
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(describeError(err));
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, []);

  useEffect(() => {
    void fetchPage(debounced, 0, false);
  }, [debounced, attempt, fetchPage]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const setFilter = useCallback((key: keyof LibraryUiFilters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const clearFilters = useCallback(() => setFilters(DEFAULT_LIBRARY_FILTERS), []);

  const loadMore = useCallback(() => {
    if (loading || loadingMore || !hasMore) return;
    void fetchPage(debounced, page + 1, true);
  }, [loading, loadingMore, hasMore, fetchPage, debounced, page]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return { filters, setFilter, clearFilters, voices, totalCount, hasMore, loading, loadingMore, error, loadMore, retry };
}
