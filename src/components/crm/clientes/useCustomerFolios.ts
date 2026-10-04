'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase/config';
import {
  getCustomerFolios,
  type CustomerFolio,
  type CustomerInvoiceDebt,
  type CustomerFoliosSummary,
} from '@/lib/services/crm/customerFoliosService';

export function useCustomerFolios(organizationId: number | undefined, customerId: string) {
  const scope = `${organizationId ?? ''}:${customerId}`;
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const request = useRef(0);
  const [state, setState] = useState<{
    scope: string;
    loading: boolean;
    error: boolean;
    folios: CustomerFolio[];
    invoices: CustomerInvoiceDebt[];
    summary: CustomerFoliosSummary | null;
  }>({ scope, loading: true, error: false, folios: [], invoices: [], summary: null });

  const loadData = useCallback(async () => {
    const version = ++request.current;
    setState({ scope, loading: true, error: false, folios: [], invoices: [], summary: null });
    if (!organizationId || !customerId) return;
    try {
      const data = await getCustomerFolios(supabase, organizationId, customerId);
      if (version !== request.current || scope !== currentScope.current) return;
      setState({ scope, loading: false, error: false, ...data });
    } catch {
      if (version !== request.current || scope !== currentScope.current) return;
      setState({ scope, loading: false, error: true, folios: [], invoices: [], summary: null });
    }
  }, [organizationId, customerId, scope]);

  useEffect(() => {
    const requests = request;
    void loadData();
    return () => {
      requests.current++;
    };
  }, [loadData]);

  const matches = state.scope === scope;
  return {
    folios: matches ? state.folios : [],
    invoices: matches ? state.invoices : [],
    summary: matches ? state.summary : null,
    isLoading: !matches || state.loading,
    error: matches && state.error,
    loadData,
  };
}
