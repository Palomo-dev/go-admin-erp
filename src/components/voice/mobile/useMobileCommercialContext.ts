'use client';
import { useEffect, useState } from 'react';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useBranchOpcional } from '@/lib/context/BranchContext';
import { useSession } from '@/lib/context/SessionContext';
interface OpportunityContext { name: string; amount?: number | null; etapa?: { name: string } | null; last_contact_at?: string | null; last_contact_result?: string | null }
/** El detalle autorizado existente aporta el contexto comercial; no consulta tablas desde el navegador. */
export function useMobileCommercialContext(opportunityId: string | null, enabled: boolean) {
  const { organization } = useOrganization(); const organizationId = organization?.id ?? null; const { session } = useSession(); const branch = useBranchOpcional();
  const branchIds = branch?.branches.map(item => item.id).filter((id): id is number => typeof id === 'number').sort((a,b) => a-b).join(',') ?? '';
  const key = `${organizationId}:${session?.user.id}:${branch?.branchFilter ?? 'all'}:${branchIds}:${opportunityId}`;
  const [result, setResult] = useState<{ key: string; data: OpportunityContext | null }>({ key: '', data: null });
  useEffect(() => {
    if (!enabled || !organizationId || !opportunityId || !session?.expires_at || session.expires_at * 1000 <= Date.now()) return;
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 10000);
    void fetch(`/api/crm/opportunities/${encodeURIComponent(opportunityId)}`, { signal: controller.signal, cache: 'no-store', credentials: 'same-origin' }).then(async response => {
      if (!response.ok) return null;
      const body = await response.json(); return body?.success && body?.data && typeof body.data.name === 'string' ? body.data as OpportunityContext : null;
    }).then(data => { if (!controller.signal.aborted) setResult({ key, data }); }).catch(() => undefined).finally(() => clearTimeout(timeout));
    return () => { controller.abort(); clearTimeout(timeout); };
  }, [key, organizationId, opportunityId, enabled, session?.expires_at]);
  return result.key === key && enabled && session?.expires_at && session.expires_at * 1000 > Date.now() ? result.data : null;
}
