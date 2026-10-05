"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, type CampaignStatsResult } from '@/components/crm/whatsapp/api';
import type { Campaign } from '../types';
import { CampanasService } from '../CampanasService';

export function useDetalleCampana(id: string) {
  const [state, setState] = useState<{ campaign: Campaign | null; stats: CampaignStatsResult | null; loading: boolean; error: boolean; forbidden: boolean; notFound: boolean; canManage: boolean }>({
    campaign: null, stats: null, loading: true, error: false, forbidden: false, notFound: false, canManage: false,
  });
  const current = useRef<AbortController | null>(null);
  const pending = useRef(false);
  const load = useCallback(async (sync = false, automatic = false) => {
    if (automatic && pending.current) return;
    current.current?.abort(); const request = new AbortController(); current.current = request;
    pending.current = true;
    const timeout = setTimeout(() => request.abort(), 20000);
    try {
      const [r, stats] = await Promise.all([
        CampanasService.getCampaignWithPermissions(id, request.signal), CampanasService.stats(id, sync, request.signal),
      ]);
      if (!r?.data || !stats?.counts) throw new Error('invalid');
      if (current.current === request) setState({ campaign: r.data, stats, canManage: r.can_manage === true, loading: false, error: false, forbidden: false, notFound: false });
    } catch (e) {
      request.abort();
      if (current.current === request) setState({ campaign: null, stats: null, canManage: false, loading: false, error: true,
        forbidden: e instanceof ApiError && [401, 403].includes(e.status), notFound: e instanceof ApiError && e.status === 404 });
    } finally { clearTimeout(timeout); if (current.current === request) pending.current = false; }
  }, [id]);
  useEffect(() => {
    setState({ campaign: null, stats: null, loading: true, error: false, forbidden: false, notFound: false, canManage: false });
    void load();
    const interval = setInterval(() => { if (!document.hidden) void load(false, true); }, 15000);
    return () => { current.current?.abort(); current.current = null; pending.current = false; clearInterval(interval); };
  }, [load]);
  return { ...state, load };
}
