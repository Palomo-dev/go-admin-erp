'use client';

/**
 * Estado de Partners (directorio, pestañas y ficha). Todo pasa por
 * `/api/crm/partners/**`: el navegador nunca escribe `partners`,
 * `partner_tiers` ni `partner_deals`; la comisión la calcula el servidor y
 * `can_manage` lo decide la sesión.
 *
 * `dealsDe`: en la ficha, solo los deals de ese partner
 * (`/api/crm/partners/[id]/deals`); sin él, los de toda la organización
 * (`/api/crm/partners/deals`).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { OrgPartnerDealView, PartnerDealView, PartnerTier, PartnerView, RegisterDealResult } from '@/lib/services/crm/partnerService';
import type { CommissionStatus } from '@/lib/services/crm/partnerCommission';

/** Error de la API con su estado HTTP (403 → «sin permiso»; el resto → «error»). */
export class ErrorPartners extends Error {
  status: number;
  code: string | null;
  constructor(status: number, message: string, code: string | null) {
    super(message);
    this.name = 'ErrorPartners';
    this.status = status;
    this.code = code;
  }
}

async function pedir<T>(url: string, init?: RequestInit): Promise<{ data: T; body: Record<string, unknown> }> {
  let res: Response;
  try {
    res = await fetch(url, { cache: 'no-store', ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
  } catch {
    throw new ErrorPartners(0, '', 'RED');
  }
  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  if (!res.ok) throw new ErrorPartners(res.status, typeof body.error === 'string' ? body.error : '', typeof body.code === 'string' ? body.code : null);
  return { data: body.data as T, body };
}

export type DealParaPantalla = OrgPartnerDealView | PartnerDealView;

export interface PayloadDeal {
  opportunity_id: string;
  deal_type: string;
  commission_amount?: number;
}

export function usePartners({ dealsDe }: { dealsDe?: string } = {}) {
  const [partners, setPartners] = useState<PartnerView[]>([]);
  const [tiers, setTiers] = useState<PartnerTier[]>([]);
  const [deals, setDeals] = useState<DealParaPantalla[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [cargado, setCargado] = useState(false);
  const [error, setError] = useState<ErrorPartners | null>(null);
  const yaCargo = useRef(false);

  const recargar = useCallback(async () => {
    if (!yaCargo.current) setCargando(true);
    setError(null);
    try {
      const urlDeals = dealsDe ? `/api/crm/partners/${dealsDe}/deals?limit=200` : '/api/crm/partners/deals';
      const [lista, niveles, tratos] = await Promise.all([
        pedir<PartnerView[]>('/api/crm/partners'),
        pedir<PartnerTier[]>('/api/crm/partners/tiers'),
        pedir<DealParaPantalla[]>(urlDeals),
      ]);
      setPartners(lista.data ?? []);
      setCanManage(lista.body.can_manage === true);
      setTiers(niveles.data ?? []);
      setDeals(tratos.data ?? []);
      yaCargo.current = true;
      setCargado(true);
    } catch (e) {
      setError(e instanceof ErrorPartners ? e : new ErrorPartners(0, '', null));
    } finally {
      setCargando(false);
    }
  }, [dealsDe]);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  const savePartner = useCallback(async (payload: Record<string, unknown>, id?: string) => {
    const { data } = await pedir<PartnerView>(id ? `/api/crm/partners/${id}` : '/api/crm/partners', { method: id ? 'PATCH' : 'POST', body: JSON.stringify(payload) });
    await recargar();
    return data;
  }, [recargar]);

  const deletePartner = useCallback(async (id: string) => {
    await pedir(`/api/crm/partners/${id}`, { method: 'DELETE' });
    setPartners((prev) => prev.filter((p) => p.id !== id));
    await recargar();
  }, [recargar]);

  const saveTier = useCallback(async (payload: Record<string, unknown>, id?: string) => {
    const { data } = await pedir<PartnerTier>(id ? `/api/crm/partners/tiers/${id}` : '/api/crm/partners/tiers', { method: id ? 'PATCH' : 'POST', body: JSON.stringify(payload) });
    await recargar();
    return data;
  }, [recargar]);

  const deleteTier = useCallback(async (id: string) => {
    await pedir(`/api/crm/partners/tiers/${id}`, { method: 'DELETE' });
    await recargar();
  }, [recargar]);

  const registerDeal = useCallback(async (partnerId: string, payload: PayloadDeal) => {
    const { data } = await pedir<RegisterDealResult>(`/api/crm/partners/${partnerId}/deals`, { method: 'POST', body: JSON.stringify(payload) });
    await recargar();
    return data;
  }, [recargar]);

  const transitionDeal = useCallback(async (partnerId: string, dealId: string, status: CommissionStatus) => {
    const { data } = await pedir<PartnerDealView>(`/api/crm/partners/${partnerId}/deals/${dealId}`, { method: 'PATCH', body: JSON.stringify({ commission_status: status }) });
    await recargar();
    return data;
  }, [recargar]);

  return { partners, tiers, deals, canManage, cargando, cargado, error, recargar, savePartner, deletePartner, saveTier, deleteTier, registerDeal, transitionDeal };
}

export type EstadoPartners = ReturnType<typeof usePartners>;
