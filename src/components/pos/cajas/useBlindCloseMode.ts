'use client';

import { useState, useEffect } from 'react';
import { ConfiguracionService } from '@/components/pos/configuracion/configuracionService';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';

export interface BlindCloseModeResult {
  isBlindMode: boolean;
  isOrgAdmin: boolean;
  showExpected: boolean;
  loading: boolean;
}

export function useBlindCloseMode(): BlindCloseModeResult {
  const [isBlindMode, setIsBlindMode] = useState(false);
  const [isOrgAdmin, setIsOrgAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [blindConfig, { data: { user } }] = await Promise.all([
          ConfiguracionService.getBlindCashCountConfig(),
          supabase.auth.getUser(),
        ]);
        setIsBlindMode(blindConfig.blind_cash_count);

        if (user) {
          const orgId = getOrganizationId();
          const { data: memberData } = await supabase
            .from('organization_members')
            .select('is_super_admin, role_id, roles(name)')
            .eq('user_id', user.id)
            .eq('organization_id', orgId)
            .eq('is_active', true)
            .single();

          if (memberData) {
            const roleName = (memberData.roles as any)?.name?.toLowerCase() || '';
            const isAdmin = memberData.is_super_admin ||
              roleName.includes('admin') ||
              roleName.includes('owner') ||
              memberData.role_id === 2;
            setIsOrgAdmin(isAdmin);
          }
        }
      } catch (err) {
        console.warn('Error loading blind close mode:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return {
    isBlindMode,
    isOrgAdmin,
    showExpected: !isBlindMode || isOrgAdmin,
    loading,
  };
}
