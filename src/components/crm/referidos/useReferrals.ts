'use client';

/**
 * Estado de la página de referidos (F12). Todo pasa por las rutas de
 * servidor (`/api/crm/referrals/**`): el navegador nunca escribe `referrals`
 * ni `referral_programs`; el estado y la recompensa los decide el servidor.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReferralProgram, ReferralRequest, ReferralView } from '@/lib/services/crm/referralsService';
import type { ReferralStatus } from '@/lib/services/crm/referralStateMachine';

async function call(url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  const res = await fetch(url, { cache: 'no-store', ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  return { ok: res.ok, status: res.status, body };
}

function messageOf(body: Record<string, unknown>, fallback: string): string {
  return typeof body.error === 'string' && body.error ? body.error : fallback;
}

function upsert(list: ReferralView[], row: ReferralView): ReferralView[] {
  const i = list.findIndex((r) => r.id === row.id);
  return i === -1 ? [row, ...list] : list.map((r) => (r.id === row.id ? row : r));
}

export interface ProgramPayload {
  name: string;
  description: string | null;
  reward_type: string;
  reward_amount: number;
  reward_to: string;
  is_active: boolean;
}

export function useReferrals() {
  const [referrals, setReferrals] = useState<ReferralView[]>([]);
  const [programs, setPrograms] = useState<ReferralProgram[]>([]);
  const [requests, setRequests] = useState<ReferralRequest[]>([]);
  const [currency, setCurrency] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadedOnce = useRef(false);

  const load = useCallback(async () => {
    if (!loadedOnce.current) setLoading(true);
    setError(null);
    try {
      const [list, progs, reqs] = await Promise.all([
        call('/api/crm/referrals?limit=200'),
        call('/api/crm/referrals/programs'),
        call('/api/crm/referrals/requests'),
      ]);
      if (!list.ok) throw new Error(messageOf(list.body, 'No se pudieron cargar los referidos'));
      if (!progs.ok) throw new Error(messageOf(progs.body, 'No se pudieron cargar los programas'));
      setReferrals((list.body.data as ReferralView[]) ?? []);
      setPrograms((progs.body.data as ReferralProgram[]) ?? []);
      setCurrency((progs.body.currency as string | null) ?? null);
      // Las tareas de F10 son un complemento: si fallan, la página sigue.
      setRequests(reqs.ok ? ((reqs.body.data as ReferralRequest[]) ?? []) : []);
      loadedOnce.current = true;
      setLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const register = useCallback(async (payload: Record<string, unknown>) => {
    const { ok, body } = await call('/api/crm/referrals', { method: 'POST', body: JSON.stringify(payload) });
    if (!ok) throw new Error(messageOf(body, 'No se pudo registrar el referido'));
    const row = body.data as ReferralView;
    setReferrals((prev) => upsert(prev, row));
    return row;
  }, []);

  const transition = useCallback(async (id: string, status: ReferralStatus) => {
    const { ok, body } = await call(`/api/crm/referrals/${id}/status`, { method: 'POST', body: JSON.stringify({ status }) });
    if (!ok) throw new Error(messageOf(body, 'No se pudo cambiar el estado'));
    const row = body.data as ReferralView;
    setReferrals((prev) => upsert(prev, row));
    return row;
  }, []);

  const markPaid = useCallback(async (id: string) => {
    const { ok, body } = await call(`/api/crm/referrals/${id}/reward`, { method: 'POST', body: '{}' });
    if (!ok) throw new Error(messageOf(body, 'No se pudo registrar la recompensa'));
    const row = body.data as ReferralView;
    setReferrals((prev) => upsert(prev, row));
    return row;
  }, []);

  const convert = useCallback(async (id: string, payload: Record<string, unknown>) => {
    const { ok, body } = await call(`/api/crm/referrals/${id}/convert`, { method: 'POST', body: JSON.stringify(payload) });
    if (!ok) throw new Error(messageOf(body, 'No se pudo convertir el referido'));
    const data = body.data as { referral: ReferralView; lead: { id: string; name: string } };
    setReferrals((prev) => upsert(prev, data.referral));
    return data;
  }, []);

  const saveProgram = useCallback(async (payload: ProgramPayload, id?: string) => {
    const { ok, body } = await call(id ? `/api/crm/referrals/programs/${id}` : '/api/crm/referrals/programs', {
      method: id ? 'PATCH' : 'POST',
      body: JSON.stringify(payload),
    });
    if (!ok) throw new Error(messageOf(body, 'No se pudo guardar el programa'));
    const row = body.data as ReferralProgram;
    setPrograms((prev) => (prev.some((p) => p.id === row.id) ? prev.map((p) => (p.id === row.id ? row : p)) : [row, ...prev]));
    await load();
    return row;
  }, [load]);

  const deleteProgram = useCallback(async (id: string) => {
    const { ok, body } = await call(`/api/crm/referrals/programs/${id}`, { method: 'DELETE' });
    if (!ok) throw new Error(messageOf(body, 'No se pudo eliminar el programa'));
    setPrograms((prev) => prev.filter((p) => p.id !== id));
    await load();
  }, [load]);

  return { referrals, programs, requests, currency, loading, loaded, error, reload: load, register, transition, markPaid, convert, saveProgram, deleteProgram };
}
