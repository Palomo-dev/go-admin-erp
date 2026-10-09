/**
 * Servicio de eliminación de cuentas con cumplimiento Ley 1581 de 2012
 * 
 * Implementa el flujo de eliminación de datos personales respetando:
 * - Plazo de 15 días hábiles (implementado como 10 días calendario)
 * - Conservación de facturación y contabilidad por 10 años (art. 28 Ley 962 de 2005)
 * - Anonimización vs eliminación según tipo de dato
 * - Auditoría completa con hash SHA-256 del email, sin PII en claro
 * 
 * @module lib/services/accountDeletionService
 */

import { createClient } from '@supabase/supabase-js';
import { 
  sendAccountDeletionRequestEmail, 
  sendAccountDeletionCompleteEmail,
  sendAdminBlockNotification,
  hashEmail
} from './accountDeletionEmails';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

interface PendingDeletion {
  user_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  deletion_requested_at: string;
  days_since_request: number;
  organization_ids: number[];
}

interface DeletionResult {
  success: boolean;
  user_id: string;
  email: string;
  error?: string;
  skipped_reason?: string;
  actions_taken?: string[];
}

interface ProcessResult {
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  results: DeletionResult[];
}

/**
 * Obtiene el cliente service_role de Supabase
 */
function getServiceClient() {
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Supabase credentials not configured');
  }
  
  return createClient(supabaseUrl, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Verifica si el usuario es el único admin de organizaciones con otros usuarios activos
 * (sin importar el estado de suscripción)
 */
async function checkSoleAdminWithOtherUsers(userId: string): Promise<{
  isBlocked: boolean;
  blockingOrganizations?: Array<{
    organization_id: number;
    organization_name: string;
    subscription_id: string;
    subscription_status: string;
  }>;
  reason?: string;
}> {
  const supabase = getServiceClient();
  
  // 1. Obtener todas las organizaciones donde el usuario es miembro activo
  const { data: userOrgs, error: orgsError } = await supabase
    .from('organization_members')
    .select('organization_id, organizations(name, id, subscription_id, subscription_status)')
    .eq('user_id', userId)
    .eq('is_active', true);
  
  if (orgsError) {
    console.error('[Account Deletion] Error obteniendo organizaciones:', orgsError);
    throw new Error(`Error obteniendo organizaciones: ${orgsError.message}`);
  }
  
  if (!userOrgs || userOrgs.length === 0) {
    return { isBlocked: false };
  }
  
  const blockingOrgs: Array<{
    organization_id: number;
    organization_name: string;
    subscription_id: string;
    subscription_status: string;
  }> = [];
  
  for (const membership of userOrgs) {
    const orgId = membership.organization_id;
    const org = membership.organizations as {
      name?: string;
      id?: number;
      subscription_id?: string;
      subscription_status?: string;
    } | null;
    
    // 2. Contar cuántos admins activos tiene esta organización
    const { count: adminCount, error: adminError } = await supabase
      .from('organization_members')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .eq('role', 'admin');
    
    if (adminError) {
      console.error('[Account Deletion] Error contando admins:', adminError);
      continue;
    }
    
    // Si no es el único admin, no bloqueamos por esta org
    if (!adminCount || adminCount > 1) {
      continue;
    }
    
    // 3. Si es el único admin, verificar si hay otros usuarios activos
    const { count: otherUsersCount, error: usersError } = await supabase
      .from('organization_members')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .neq('user_id', userId);
    
    if (usersError) {
      console.error('[Account Deletion] Error contando miembros:', usersError);
      continue;
    }
    
    // Solo bloquear si hay otros usuarios activos
    if (otherUsersCount && otherUsersCount > 0) {
      blockingOrgs.push({
        organization_id: orgId,
        organization_name: org?.name || `Org ${orgId}`,
        subscription_id: org?.subscription_id || 'N/A',
        subscription_status: org?.subscription_status || 'none',
      });
    }
  }
  
  if (blockingOrgs.length === 0) {
    return { isBlocked: false };
  }
  
  return {
    isBlocked: true,
    blockingOrganizations: blockingOrgs,
    reason: `Usuario es el único administrador de ${blockingOrgs.length} organización(es) con otros usuarios activos`,
  };
}

/**
 * Anonimiza los datos personales del perfil
 */
async function anonymizeProfile(userId: string): Promise<void> {
  const supabase = getServiceClient();
  
  const { error } = await supabase
    .from('profiles')
    .update({
      first_name: null,
      last_name: null,
      phone: null,
      avatar_url: null,
      department: null,
      preferred_language: 'es',
      metadata: {},
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);
  
  if (error) {
    throw new Error(`Error anonimizando perfil: ${error.message}`);
  }
}

/**
 * Elimina el avatar del storage
 */
async function deleteAvatar(userId: string): Promise<void> {
  const supabase = getServiceClient();
  
  const { data: files, error: listError } = await supabase.storage
    .from('profiles')
    .list(`avatars`, {
      search: userId,
    });
  
  if (listError) {
    console.warn('[Account Deletion] Error listando avatares:', listError);
    return;
  }
  
  if (files && files.length > 0) {
    const filePaths = files.map(f => `avatars/${f.name}`);
    const { error: deleteError } = await supabase.storage
      .from('profiles')
      .remove(filePaths);
    
    if (deleteError) {
      console.warn('[Account Deletion] Error eliminando avatares:', deleteError);
    }
  }
}

/**
 * Elimina al usuario de todas sus organizaciones
 */
async function removeFromOrganizations(userId: string): Promise<void> {
  const supabase = getServiceClient();
  
  const { error } = await supabase
    .from('organization_members')
    .update({
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);
  
  if (error) {
    throw new Error(`Error removiendo de organizaciones: ${error.message}`);
  }
}

/**
 * Elimina o deshabilita al usuario en Supabase Auth
 */
async function disableAuthUser(userId: string): Promise<void> {
  const supabase = getServiceClient();
  
  try {
    const { error } = await supabase.auth.admin.deleteUser(userId);
    
    if (error) {
      console.warn('[Account Deletion] No se pudo eliminar de Auth:', error);
      const anonymizedEmail = `deleted_${userId}@deleted.goadmin.local`;
      await supabase.auth.admin.updateUserById(userId, {
        email: anonymizedEmail,
        user_metadata: {},
      });
    }
  } catch (err) {
    console.error('[Account Deletion] Error deshabilitando Auth:', err);
    throw new Error(`Error deshabilitando usuario de Auth: ${err}`);
  }
}

/**
 * Registra la eliminación en la tabla de auditoría con hash del email
 */
async function createAuditRecord(
  userId: string,
  email: string,
  deletionRequestedAt: string,
  organizationIds: number[],
  actionsTaken: string[]
): Promise<void> {
  const supabase = getServiceClient();
  
  const { error } = await supabase
    .from('account_deletion_audit')
    .insert({
      user_id: userId,
      email: hashEmail(email), // Hash SHA-256, no email en claro
      deletion_requested_at: deletionRequestedAt,
      deletion_completed_at: new Date().toISOString(),
      reason: 'user_request',
      actions_taken: actionsTaken,
      organization_ids: organizationIds,
      processed_by: 'cron_job',
      metadata: {
        processed_at: new Date().toISOString(),
        version: '1.0',
        email_hash_algorithm: 'SHA-256',
      },
    });
  
  if (error) {
    console.error('[Account Deletion] Error creando registro de auditoría:', error);
  }
}

/**
 * Procesa la eliminación de una cuenta individual
 */
async function processAccountDeletion(account: PendingDeletion): Promise<DeletionResult> {
  const { user_id, email, organization_ids, deletion_requested_at } = account;
  const actionsTaken: string[] = [];
  
  try {
    console.log(`[Account Deletion] Procesando usuario ${email} (${user_id})`);
    
    // 1. Verificar si es único admin con otros usuarios
    const adminCheck = await checkSoleAdminWithOtherUsers(user_id);
    
    if (adminCheck.isBlocked) {
      console.warn(
        `[Account Deletion] Usuario ${email} bloqueado: ${adminCheck.reason}`,
        adminCheck.blockingOrganizations
      );
      
      // Enviar alerta a soporte
      try {
        await sendAdminBlockNotification(
          email,
          user_id,
          adminCheck.blockingOrganizations || []
        );
      } catch (alertError) {
        console.error('[Account Deletion] Error enviando alerta a soporte:', alertError);
      }
      
      return {
        success: false,
        user_id,
        email,
        skipped_reason: adminCheck.reason || 'Único admin con otros usuarios',
      };
    }
    
    // 2. Enviar correo de completado ANTES de anonimizar (último uso del email en claro)
    const requestDate = new Date(deletion_requested_at);
    try {
      await sendAccountDeletionCompleteEmail(email, requestDate);
      actionsTaken.push('sent_confirmation_email');
    } catch (emailError) {
      console.warn('[Account Deletion] Error enviando correo de confirmación:', emailError);
    }
    
    // 3. Anonimizar datos personales del perfil
    await anonymizeProfile(user_id);
    actionsTaken.push('anonymized_profile');
    
    // 4. Eliminar avatar del storage
    await deleteAvatar(user_id);
    actionsTaken.push('deleted_avatar');
    
    // 5. Remover de organizaciones
    await removeFromOrganizations(user_id);
    actionsTaken.push('removed_from_organizations');
    
    // 6. Deshabilitar usuario de Auth
    await disableAuthUser(user_id);
    actionsTaken.push('disabled_auth_user');
    
    // 7. Crear registro de auditoría (con hash del email)
    await createAuditRecord(
      user_id,
      email,
      deletion_requested_at,
      organization_ids,
      actionsTaken
    );
    
    console.log(`[Account Deletion] Usuario ${email} eliminado exitosamente`);
    
    return {
      success: true,
      user_id,
      email: hashEmail(email), // Ya no retornar email en claro
      actions_taken: actionsTaken,
    };
    
  } catch (error) {
    console.error(`[Account Deletion] Error procesando ${email}:`, error);
    
    return {
      success: false,
      user_id,
      email: hashEmail(email), // No retornar email en claro ni en errores
      error: error instanceof Error ? error.message : String(error),
      actions_taken: actionsTaken,
    };
  }
}

/**
 * Obtiene las cuentas pendientes de eliminación
 */
export async function getPendingAccountDeletions(daysAfter: number = 10): Promise<PendingDeletion[]> {
  const supabase = getServiceClient();
  
  const { data, error } = await supabase.rpc('get_pending_account_deletions', {
    p_days_after: daysAfter,
  });
  
  if (error) {
    console.error('[Account Deletion] Error obteniendo cuentas pendientes:', error);
    throw new Error(`Error obteniendo cuentas pendientes: ${error.message}`);
  }
  
  return (data || []) as PendingDeletion[];
}

/**
 * Procesa todas las cuentas pendientes de eliminación
 */
export async function processPendingAccountDeletions(daysAfter: number = 10): Promise<ProcessResult> {
  console.log(`[Account Deletion] Iniciando procesamiento de cuentas pendientes (${daysAfter} días)`);
  
  try {
    const pendingAccounts = await getPendingAccountDeletions(daysAfter);
    
    if (pendingAccounts.length === 0) {
      console.log('[Account Deletion] No hay cuentas pendientes de eliminación');
      return {
        processed: 0,
        succeeded: 0,
        failed: 0,
        skipped: 0,
        results: [],
      };
    }
    
    console.log(`[Account Deletion] Encontradas ${pendingAccounts.length} cuentas pendientes`);
    
    const results: DeletionResult[] = [];
    let succeeded = 0;
    let failed = 0;
    let skipped = 0;
    
    for (const account of pendingAccounts) {
      const result = await processAccountDeletion(account);
      results.push(result);
      
      if (result.success) {
        succeeded++;
      } else if (result.skipped_reason) {
        skipped++;
      } else {
        failed++;
      }
    }
    
    console.log(
      `[Account Deletion] Procesamiento completo: ${succeeded} exitosas, ${failed} fallidas, ${skipped} omitidas`
    );
    
    return {
      processed: pendingAccounts.length,
      succeeded,
      failed,
      skipped,
      results,
    };
    
  } catch (error) {
    console.error('[Account Deletion] Error en procesamiento masivo:', error);
    throw error;
  }
}

/**
 * Envía el correo inicial cuando el usuario solicita la eliminación
 */
export async function sendDeletionRequestNotification(email: string, userName: string): Promise<void> {
  try {
    const requestDate = new Date();
    const scheduledDate = new Date(requestDate);
    scheduledDate.setDate(scheduledDate.getDate() + 10); // +10 días calendario
    
    await sendAccountDeletionRequestEmail(email, userName, requestDate, scheduledDate);
  } catch (error) {
    console.error('[Account Deletion] Error enviando notificación de solicitud:', error);
    throw error;
  }
}
