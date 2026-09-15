'use client';

/**
 * Estado de la página de partners (F12). Todo pasa por `/api/crm/partners/**`:
 * el navegador nunca escribe `partners`, `partner_tiers` ni `partner_deals`;
 * la comisión la calcula el servidor y `can_manage` lo decide la sesión.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PartnerDealView, PartnerTier, PartnerView, RegisterDealResult } from '@/lib/services/crm/partnerService';
import type { CommissionStatus } from '@/lib/services/crm/partnerCommission';

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

export function usePartners() {
  const [partners, setPartners] = useState<PartnerView[]>([]);
  const [tiers, setTiers] = useState<PartnerTier[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadedOnce = useRef(false);

  const load = useCallback(async () => {
    if (!loadedOnce.current) setLoading(true);
    setError(null);
    try {
      const [list, tierList] = await Promise.all([call('/api/crm/partners'), call('/api/crm/partners/tiers')]);
      if (!list.ok) throw new Error(messageOf(list.body, 'No se pudieron cargar los partners'));
      if (!tierList.ok) throw new Error(messageOf(tierList.body, 'No se pudieron cargar los tiers'));
      setPartners((list.body.data as PartnerView[]) ?? []);
      setCanManage(list.body.can_manage === true);
      setTiers((tierList.body.data as PartnerTier[]) ?? []);
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

  const savePartner = useCallback(async (payload: Record<string, unknown>, id?: string) => {
    const { ok, body } = await call(id ? `/api/crm/partners/${id}` : '/api/crm/partners', { method: id ? 'PATCH' : 'POST', body: JSON.stringify(payload) });
    if (!ok) throw new Error(messageOf(body, 'No se pudo guardar el partner'));
    await load();
    return body.data as PartnerView;
  }, [load]);

  const deletePartner = useCallback(async (id: string) => {
    const { ok, body } = await call(`/api/crm/partners/${id}`, { method: 'DELETE' });
    if (!ok) throw new Error(messageOf(body, 'No se pudo eliminar el partner'));
    setPartners((prev) => prev.filter((p) => p.id !== id));
    await load();
  }, [load]);

  const saveTier = useCallback(async (payload: Record<string, unknown>, id?: string) => {
    const { ok, body } = await call(id ? `/api/crm/partners/tiers/${id}` : '/api/crm/partners/tiers', { method: id ? 'PATCH' : 'POST', body: JSON.stringify(payload) });
    if (!ok) throw new Error(messageOf(body, 'No se pudo guardar el tier'));
    await load();
    return body.data as PartnerTier;
  }, [load]);

  const deleteTier = useCallback(async (id: string) => {
    const { ok, body } = await call(`/api/crm/partners/tiers/${id}`, { method: 'DELETE' });
    if (!ok) throw new Error(messageOf(body, 'No se pudo eliminar el tier'));
    await load();
  }, [load]);

  const loadDeals = useCallback(async (partnerId: string) => {
    const { ok, body } = await call(`/api/crm/partners/${partnerId}/deals?limit=200`);
    if (!ok) throw new Error(messageOf(body, 'No se pudieron cargar los deals'));
    return (body.data as PartnerDealView[]) ?? [];
  }, []);

  const registerDeal = useCallback(async (partnerId: string, payload: { opportunity_id: string; deal_type: string }) => {
    const { ok, body } = await call(`/api/crm/partners/${partnerId}/deals`, { method: 'POST', body: JSON.stringify(payload) });
    if (!ok) throw new Error(messageOf(body, 'No se pudo registrar el deal'));
    await load();
    return body.data as RegisterDealResult;
  }, [load]);

  const transitionDeal = useCallback(async (partnerId: string, dealId: string, status: CommissionStatus) => {
    const { ok, body } = await call(`/api/crm/partners/${partnerId}/deals/${dealId}`, { method: 'PATCH', body: JSON.stringify({ commission_status: status }) });
    if (!ok) throw new Error(messageOf(body, 'No se pudo cambiar la comisión'));
    await load();
    return body.data as PartnerDealView;
  }, [load]);

  return { partners, tiers, canManage, loading, loaded, error, reload: load, savePartner, deletePartner, saveTier, deleteTier, loadDeals, registerDeal, transitionDeal };
}
