'use client';

/**
 * Miembros activos de la organización activa con su nombre, para selectores
 * de vendedor (F13). Patrón canónico de `NuevaFacturaForm.tsx`:
 * `organization_members` (RLS por pertenencia) + `profiles` por `user_id`.
 */

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/config';
import { useOrganization } from '@/lib/hooks/useOrganization';

export interface OrgMemberOption {
  user_id: string;
  name: string;
}

export function memberDisplayName(p: { first_name?: string | null; last_name?: string | null; email?: string | null } | undefined): string {
  return `${p?.first_name || ''} ${p?.last_name || ''}`.trim() || p?.email || 'Miembro';
}

export function useOrgMembers(): { members: OrgMemberOption[]; loading: boolean } {
  const { organization } = useOrganization();
  const orgId = organization?.id;
  const [members, setMembers] = useState<OrgMemberOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const { data: rows } = await supabase
          .from('organization_members')
          .select('user_id')
          .eq('organization_id', orgId)
          .eq('is_active', true);
        const ids = (rows || []).map((m: { user_id: string }) => m.user_id);
        if (ids.length === 0) {
          if (!cancelled) setMembers([]);
          return;
        }
        const { data: profiles } = await supabase.from('profiles').select('id, first_name, last_name, email').in('id', ids);
        const byId = new Map((profiles || []).map((p: { id: string }) => [p.id, p]));
        const list = ids
          .map((id) => ({ user_id: id, name: memberDisplayName(byId.get(id) as { first_name?: string | null; last_name?: string | null; email?: string | null } | undefined) }))
          .sort((a, b) => a.name.localeCompare(b.name, 'es'));
        if (!cancelled) setMembers(list);
      } catch (err) {
        console.warn('[useOrgMembers] no se pudieron cargar los miembros:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  return { members, loading };
}
