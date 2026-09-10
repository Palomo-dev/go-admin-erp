'use client';

/**
 * Estado de la pestaña Telefonía (sin react-query):
 * GET/PATCH /api/crm/settings/telephony, GET /api/crm/phone-numbers,
 * POST /api/crm/phone-numbers/import, PATCH /api/crm/phone-numbers/[id].
 */

import { useCallback, useEffect, useState } from 'react';
import type { PhoneNumber } from '@/lib/services/crm/callManagementService';

export interface TelephonySettingsDto {
  organization_id: number;
  phone_number: string | null;
  voice_caller_id: string | null;
  voice_recording_enabled: boolean;
  voice_recording_retention_days: number;
  voice_consent_message: string;
  voice_ring_timeout_seconds: number;
  voice_max_concurrent_calls: number;
  voice_minutes_remaining: number | null;
  voice_twiml_app_sid: string | null;
  voice_agent_enabled: boolean;
  has_subaccount: boolean;
  consent_voice: string;
  consent_language: string;
}

export interface TelephonyConfigured {
  api_key: boolean;
  twiml_app: boolean;
  account: boolean;
  source: 'org' | 'env' | 'none';
}

export interface OrgMember {
  user_id: string;
  name: string;
  email: string | null;
}

interface State {
  settings: TelephonySettingsDto | null;
  configured: TelephonyConfigured | null;
  members: OrgMember[];
  numbers: PhoneNumber[];
  canEdit: boolean;
  loading: boolean;
  error: string | null;
}

async function json<T>(res: Response): Promise<T & { success?: boolean; error?: string }> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { success: false, error: text || `HTTP ${res.status}` } as T & { success?: boolean; error?: string };
  }
}

export function useTelephonySettings() {
  const [state, setState] = useState<State>({ settings: null, configured: null, members: [], numbers: [], canEdit: false, loading: true, error: null });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const [sRes, nRes] = await Promise.all([fetch('/api/crm/settings/telephony'), fetch('/api/crm/phone-numbers')]);
      const s = await json<{ data: TelephonySettingsDto; configured: TelephonyConfigured; members: OrgMember[]; can_edit: boolean }>(sRes);
      const n = await json<{ data: PhoneNumber[] }>(nRes);
      if (!sRes.ok) throw new Error(s.error || `HTTP ${sRes.status}`);
      setState({ settings: s.data, configured: s.configured, members: s.members ?? [], numbers: nRes.ok ? n.data ?? [] : [], canEdit: !!s.can_edit, loading: false, error: null });
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: err instanceof Error ? err.message : 'Error al cargar' }));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const patchSettings = useCallback(async (patch: Partial<TelephonySettingsDto>): Promise<TelephonySettingsDto> => {
    const res = await fetch('/api/crm/settings/telephony', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
    const body = await json<{ data: TelephonySettingsDto }>(res);
    if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
    setState((s) => ({ ...s, settings: body.data }));
    return body.data;
  }, []);

  const importNumbers = useCallback(async (): Promise<{ created: number; synced: number; syncErrors: string[] }> => {
    const res = await fetch('/api/crm/phone-numbers/import', { method: 'POST' });
    const body = await json<{ data: { created: boolean }[]; synced: number; sync_errors: string[] }>(res);
    if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
    await load();
    return { created: (body.data ?? []).filter((n) => n.created).length, synced: body.synced ?? 0, syncErrors: body.sync_errors ?? [] };
  }, [load]);

  const patchNumber = useCallback(
    async (id: string, patch: { label?: string | null; assigned_user_id?: string | null; is_primary?: boolean; is_active?: boolean }) => {
      const res = await fetch(`/api/crm/phone-numbers/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
      const body = await json<{ data: PhoneNumber }>(res);
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      await load();
    },
    [load]
  );

  return { ...state, reload: load, patchSettings, importNumbers, patchNumber };
}
