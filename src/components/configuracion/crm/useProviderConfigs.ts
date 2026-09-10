'use client';

/**
 * Hook de estado para la pestaña "Proveedores e IA" (sin react-query).
 * Consume GET/PUT /api/crm/config/providers y POST …/providers/test.
 * Nunca recibe ni envía valores existentes de credenciales.
 */

import { useCallback, useEffect, useState } from 'react';
import type { ProviderConfigSafe } from '@/lib/services/providerRegistry';
import type { ProviderCategory } from '@/lib/crm/providerCatalog';

export interface PutProviderInput {
  category: ProviderCategory;
  provider: string;
  settings?: Record<string, unknown>;
  credentials?: Record<string, string | null>;
  is_active?: boolean;
  priority?: number;
}

export interface TestResult {
  ok: boolean;
  detail: string;
  latencyMs?: number;
  provider?: string;
  source?: 'org' | 'env' | 'none';
}

interface State {
  items: ProviderConfigSafe[];
  canEdit: boolean;
  loading: boolean;
  error: string | null;
}

async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Respuesta inválida (${res.status})`);
  }
}

export function useProviderConfigs() {
  const [state, setState] = useState<State>({ items: [], canEdit: false, loading: true, error: null });

  const refresh = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await fetch('/api/crm/config/providers', { cache: 'no-store', credentials: 'include' });
      const json = await readJson<{ success: boolean; items?: ProviderConfigSafe[]; can_edit?: boolean; error?: string }>(res);
      if (!res.ok || !json.success) throw new Error(json.error || `Error ${res.status}`);
      setState({ items: json.items ?? [], canEdit: !!json.can_edit, loading: false, error: null });
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: err instanceof Error ? err.message : 'Error desconocido' }));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = useCallback(async (input: PutProviderInput): Promise<ProviderConfigSafe> => {
    const res = await fetch('/api/crm/config/providers', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(input),
    });
    const json = await readJson<{ success: boolean; item?: ProviderConfigSafe; error?: string }>(res);
    if (!res.ok || !json.success || !json.item) throw new Error(json.error || `Error ${res.status}`);
    const item = json.item;
    setState((s) => {
      const idx = s.items.findIndex((i) => i.category === item.category && i.provider === item.provider);
      const items = idx >= 0 ? s.items.map((i, k) => (k === idx ? item : i)) : [...s.items, item];
      return { ...s, items };
    });
    return item;
  }, []);

  const test = useCallback(async (category: ProviderCategory, provider: string): Promise<TestResult> => {
    const res = await fetch('/api/crm/config/providers/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ category, provider }),
    });
    const json = await readJson<TestResult & { error?: string }>(res);
    if (res.status === 401 || res.status === 403 || res.status === 429) {
      return { ok: false, detail: json.detail || json.error || `Error ${res.status}` };
    }
    return { ok: !!json.ok, detail: json.detail || json.error || 'Sin detalle', latencyMs: json.latencyMs, provider: json.provider, source: json.source };
  }, []);

  return { ...state, refresh, save, test };
}
