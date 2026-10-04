'use client';

import { useEffect, useState } from 'react';
import { pedirCrm, ErrorApiCrm } from '@/components/crm/acciones/apiCrm';
import { parseCallDeepLink } from './callDeepLink';
import type { HistoricalCallDetail } from './CallRowDetail';

/** Una lectura del detalle; las referencias usan sus lectores canónicos y sus permisos. */
export function useHistoricalCall(id: string) {
  const [data, setData] = useState<HistoricalCallDetail | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!parseCallDeepLink(id, null)) { setData(null); setError(new ErrorApiCrm(400, 'id_invalido', 'id_invalido')); return; }
    const abort = new AbortController();
    let visible = true;
    setData(null);
    setError(null);
    const changedOrganization = () => {
      visible = false;
      abort.abort();
      setData(null);
      setRevision((value) => value + 1);
    };
    window.addEventListener('organization-changed', changedOrganization);
    void pedirCrm<HistoricalCallDetail>(`/api/crm/calls/${id}`, { signal: abort.signal })
      .then(async ({ data: call }) => {
        if (!Array.isArray(call?.recordings) || call.id !== id) throw new Error('call_detail_invalid');
        if (!visible) return;
        setData(call);
        const [customer, opportunity] = await Promise.allSettled([
          call.customer_id && !call.customer
            ? pedirCrm<NonNullable<HistoricalCallDetail['customer']>>(`/api/clientes/${call.customer_id}`, { signal: abort.signal }) : null,
          call.opportunity_id && !call.opportunity
            ? pedirCrm<NonNullable<HistoricalCallDetail['opportunity']>>(`/api/crm/opportunities/${call.opportunity_id}`, { signal: abort.signal }) : null,
        ]);
        if (!visible) return;
        setData({ ...call,
          customer: customer.status === 'fulfilled' && customer.value && customer.value.data?.id === call.customer_id ? customer.value.data : call.customer,
          opportunity: opportunity.status === 'fulfilled' && opportunity.value && opportunity.value.data?.id === call.opportunity_id ? opportunity.value.data : call.opportunity,
        });
      })
      .catch((failure) => { if (visible && !abort.signal.aborted) setError(failure); });
    return () => { visible = false; abort.abort(); window.removeEventListener('organization-changed', changedOrganization); };
  }, [id, revision]);
  return { data: data?.id === id ? data : null, error, reload: () => setRevision((value) => value + 1) };
}
