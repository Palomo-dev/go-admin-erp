'use client';

/**
 * Carga `GET /api/crm/seller-dashboard` (usuario y organización de la sesión;
 * el ranking solo llega si el servidor decide que el rol puede verlo).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchJson } from '@/lib/utils/fetchJson';
import { describeError } from '@/lib/utils/errorMessage';
import type { SellerDashboard } from '@/lib/services/crm/sellerDashboardService';

interface Response {
  success: boolean;
  data: SellerDashboard;
}

export function useSellerDashboard(enabled = true) {
  const [data, setData] = useState<SellerDashboard | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const reload = useCallback(async () => {
    if (!enabled) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchJson<Response>('/api/crm/seller-dashboard', { signal: controller.signal });
      if (controller.signal.aborted) return;
      setData(res.data);
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(describeError(err));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    reload();
    return () => abortRef.current?.abort();
  }, [reload]);

  return { data, loading, error, reload };
}
