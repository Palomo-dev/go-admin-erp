'use client';
import { useEffect, useState } from 'react';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { ErrorApiCrm, pedirCrm } from '@/components/crm/acciones/apiCrm';
export function useSegmentosData<T>(url: string | null, revision = 0) {
  const { organization } = useOrganization();
  const [state, setState] = useState<{ data: T | null; loading: boolean; error: ErrorApiCrm | null; canManage: boolean }>({ data: null, loading: true, error: null, canManage: false });
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setState({ data: null, loading: !!url, error: null, canManage: false });
    if (!url || !organization?.id) return () => { cancelled = true; controller.abort(); };
    const timeout = setTimeout(() => controller.abort(), 60000);
    void pedirCrm<T>(url, { signal: controller.signal }).then(({ data, extra }) => {
      if (!cancelled) setState({ data, loading: false, error: null, canManage: extra.can_manage === true });
    }).catch(error => {
      if (!cancelled) setState({ data: null, loading: false, canManage: false,
        error: error instanceof ErrorApiCrm ? error : new ErrorApiCrm(0, 'red', 'red') });
    }).finally(() => clearTimeout(timeout));
    return () => { cancelled = true; controller.abort(); clearTimeout(timeout); };
  }, [url, revision, organization?.id]);
  return state;
}
