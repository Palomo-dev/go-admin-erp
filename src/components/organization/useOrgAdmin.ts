'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase/config';

interface BranchAssignment {
  branch_id: number;
  branch_name?: string;
  role_id?: number;
}

interface UseOrgAdminReturn {
  orgId: number | null;
  userRole: number | null;
  isOrgAdmin: boolean;
  userBranches: BranchAssignment[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useOrgAdmin(): UseOrgAdminReturn {
  const [orgId, setOrgId] = useState<number | null>(null);
  const [userRole, setUserRole] = useState<number | null>(null);
  const [userBranches, setUserBranches] = useState<BranchAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    const fetchOrgData = async () => {
      try {
        setLoading(true);

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          setError('No hay sesión activa');
          return;
        }

        const userId = session.user.id;
        const currentOrgId = localStorage.getItem('currentOrganizationId');

        const { data: memberData, error: memberError } = await supabase
          .from('organization_members')
          .select(`
            organization_id,
            role_id,
            is_super_admin,
            organizations!inner (
              id,
              name,
              type_id,
              status
            )
          `)
          .eq('user_id', userId)
          .eq('is_active', true);

        if (memberError) {
          console.error('Error fetching organization data:', memberError);
          setError('Error al cargar la organización');
          return;
        }

        if (!memberData || memberData.length === 0) {
          setError('No perteneces a ninguna organización');
          return;
        }

        let selectedOrg = memberData[0];
        if (currentOrgId) {
          const foundOrg = memberData.find(
            (member) => member.organization_id.toString() === currentOrgId
          );
          if (foundOrg) selectedOrg = foundOrg;
        }

        setOrgId(selectedOrg.organization_id);
        setUserRole(selectedOrg.role_id);

        // Fetch branch assignments
        const { data: orgMemberData } = await supabase
          .from('organization_members')
          .select('id')
          .eq('user_id', userId)
          .eq('organization_id', selectedOrg.organization_id)
          .single();

        if (orgMemberData) {
          const { data: branchData } = await supabase
            .from('member_branches')
            .select(`
              branch_id,
              branches ( name )
            `)
            .eq('organization_member_id', orgMemberData.id);

          if (branchData && branchData.length > 0) {
            const branches = branchData.map((assignment: any) => ({
              branch_id: assignment.branch_id,
              branch_name: assignment.branches?.name,
              role_id: selectedOrg.role_id,
            }));
            setUserBranches(branches);
          }
        }
      } catch (err) {
        console.error('Error in useOrgAdmin:', err);
        setError('Error inesperado');
      } finally {
        setLoading(false);
      }
    };

    fetchOrgData();
  }, [refreshKey]);

  const isOrgAdmin = userRole === 2 || userRole === 1;

  return {
    orgId,
    userRole,
    isOrgAdmin,
    userBranches,
    loading,
    error,
    refresh,
  };
}
