import { supabase } from '@/lib/supabase/config';

export interface Member {
  id: string;
  user_id: string;
  organization_id: number;
  role_id: number;
  is_super_admin: boolean;
  is_active: boolean;
  created_at: string;
  profiles: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    avatar_url?: string;
  }[];
  roles: {
    id: number;
    name: string;
  }[];
}

export const memberService = {
  /**
   * Get all active members of an organization who can be managers
   * (Admin de organización, Manager, or Empleado roles)
   */
  async getAvailableManagers(organizationId: number): Promise<Member[]> {
    const { data, error } = await supabase
      .from('organization_members')
      .select(`
        id,
        user_id,
        organization_id,
        role_id,
        is_super_admin,
        is_active,
        created_at,
        profiles!inner(
          id,
          first_name,
          last_name,
          email,
          avatar_url
        ),
        roles!inner(
          id,
          name
        )
      `)
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .in('role_id', [2, 4, 5]) // Admin de organización, Empleado, Manager
      .order('profiles(first_name)', { ascending: true });

    if (error) {
      console.error('Error fetching available managers:', error);
      throw new Error(error.message);
    }

    return data || [];
  },

  /**
   * Get member details by user_id
   */
  async getMemberByUserId(organizationId: number, userId: string): Promise<Member | null> {
    const { data, error } = await supabase
      .from('organization_members')
      .select(`
        id,
        user_id,
        organization_id,
        role_id,
        is_super_admin,
        is_active,
        created_at,
        profiles!inner(
          id,
          first_name,
          last_name,
          email,
          avatar_url
        ),
        roles!inner(
          id,
          name
        )
      `)
      .eq('organization_id', organizationId)
      .eq('user_id', userId)
      .eq('is_active', true)
      .single();

    if (error) {
      console.error('Error fetching member:', error);
      return null;
    }

    return data;
  }
};
