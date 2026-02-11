import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export interface OrganizationLimits {
  maxUsers: number | null;
  currentUsers: number;
  canAddUser: boolean;
  remainingSlots: number | null;
}

/**
 * Obtiene los límites de usuarios para una organización
 */
export async function getOrganizationUserLimits(organizationId: number): Promise<OrganizationLimits> {
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Obtener límite del plan
  const { data: planData, error: planError } = await supabase
    .from('subscriptions')
    .select('plans(max_users)')
    .eq('organization_id', organizationId)
    .single();

  if (planError) {
    console.error('Error getting plan limits:', planError);
    return {
      maxUsers: 0,
      currentUsers: 0,
      canAddUser: false,
      remainingSlots: 0,
    };
  }

  const maxUsers = planData?.plans?.max_users ?? null;

  // Contar usuarios actuales
  const { count: currentUsers, error: countError } = await supabase
    .from('organization_members')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', organizationId);

  if (countError) {
    console.error('Error counting users:', countError);
    return {
      maxUsers,
      currentUsers: 0,
      canAddUser: maxUsers === null, // Si es null (Enterprise), permitir
      remainingSlots: maxUsers,
    };
  }

  const current = currentUsers || 0;
  
  // Si maxUsers es null (Enterprise), no hay límite
  if (maxUsers === null) {
    return {
      maxUsers: null,
      currentUsers: current,
      canAddUser: true,
      remainingSlots: null,
    };
  }

  return {
    maxUsers,
    currentUsers: current,
    canAddUser: current < maxUsers,
    remainingSlots: Math.max(0, maxUsers - current),
  };
}

/**
 * Valida si se puede agregar un usuario a la organización
 * Lanza error si no se puede
 */
export async function validateCanAddUser(organizationId: number): Promise<void> {
  const limits = await getOrganizationUserLimits(organizationId);
  
  if (!limits.canAddUser) {
    if (limits.maxUsers !== null) {
      throw new Error(
        `Límite de usuarios alcanizado (${limits.currentUsers}/${limits.maxUsers}). ` +
        'Mejora tu plan para agregar más usuarios.'
      );
    }
  }
}
