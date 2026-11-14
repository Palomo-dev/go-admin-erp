'use client';

/**
 * Hook de estado para la pestaña "Proveedores e IA" (sin react-query).
 * Consume GET/PUT /api/crm/config/providers y POST …/providers/test.
 * Nunca recibe ni envía valores existentes de credenciales.
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
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

/** `invalida` arma el mensaje (traducido) cuando la respuesta no es JSON. */
async function readJson<T>(res: Response, invalida: (status: number) => string): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(invalida(res.status));
  }
}

export function useProviderConfigs() {
  const [state, setState] = useState<State>({ items: [], canEdit: false, loading: true, error: null });
  const t = useTranslations('configuracionTextos.useProviderConfigs');

  const refresh = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await fetch('/api/crm/config/providers', { cache: 'no-store', credentials: 'include' });
      const json = await readJson<{ success: boolean; items?: ProviderConfigSafe[]; can_edit?: boolean; error?: string }>(res, (status) => t('respuestaInvalida', { status: String(status) }));
      if (!res.ok || !json.success) throw new Error(json.error || t('errorEstado', { status: String(res.status) }));
      setState({ items: json.items ?? [], canEdit: !!json.can_edit, loading: false, error: null });
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: err instanceof Error ? err.message : t('errorDesconocido') }));
    }
  }, [t]);

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
    const json = await readJson<{ success: boolean; item?: ProviderConfigSafe; error?: string }>(res, (status) => t('respuestaInvalida', { status: String(status) }));
    if (!res.ok || !json.success || !json.item) throw new Error(json.error || t('errorEstado', { status: String(res.status) }));
    const item = json.item;
    setState((s) => {
      const idx = s.items.findIndex((i) => i.category === item.category && i.provider === item.provider);
      const items = idx >= 0 ? s.items.map((i, k) => (k === idx ? item : i)) : [...s.items, item];
      return { ...s, items };
    });
    return item;
  }, [t]);

  const test = useCallback(async (category: ProviderCategory, provider: string): Promise<TestResult> => {
    const res = await fetch('/api/crm/config/providers/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ category, provider }),
    });
    const json = await readJson<TestResult & { error?: string }>(res, (status) => t('respuestaInvalida', { status: String(status) }));
    if (res.status === 401 || res.status === 403 || res.status === 429) {
      return { ok: false, detail: json.detail || json.error || t('errorEstado', { status: String(res.status) }) };
    }
    return { ok: !!json.ok, detail: json.detail || json.error || t('sinDetalle'), latencyMs: json.latencyMs, provider: json.provider, source: json.source };
  }, [t]);

  return { ...state, refresh, save, test };
}
