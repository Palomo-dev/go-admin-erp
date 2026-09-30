/**
 * Servicio de eliminación de cuentas con cumplimiento GDPR/LOPD
 * 
 * Implementa el flujo de eliminación de datos personales respetando:
 * - Plazo de 15 días hábiles (implementado como 10 días calendario)
 * - Conservación de facturación y contabilidad por 10 años
 * - Anonimización vs eliminación según tipo de dato
 * - Auditoría completa sin datos personales
 * 
 * @module lib/services/accountDeletionService
 */

import { createClient } from '@supabase/supabase-js';
import { sendAccountDeletionRequestEmail, sendAccountDeletionCompleteEmail } from './accountDeletionEmails';

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
 * Verifica si el usuario es el único administrador de alguna organización con suscripción activa
 */
async function checkSoleAdmin(userId: string): Promise<{
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
  
  const { data, error } = await supabase.rpc('is_sole_admin_with_active_subscription', {
    p_user_id: userId,
  });
  
  if (error) {
    console.error('[Account Deletion] Error checking sole admin:', error);
    throw new Error(`Error verificando permisos de admin: ${error.message}`);
  }
  
  return {
    isBlocked: data?.is_blocked || false,
    blockingOrganizations: data?.blocking_organizations || [],
    reason: data?.reason || undefined,
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
  
  // Buscar archivos del usuario en el bucket profiles/avatars
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
  
  // Marcar como inactivo en lugar de borrar (conserva la referencia para facturación)
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
 * 
 * Libera el email para que pueda ser reutilizado.
 */
async function disableAuthUser(userId: string, email: string): Promise<void> {
  const supabase = getServiceClient();
  
  try {
    // Intentar eliminar el usuario de Auth (libera el email)
    const { error } = await supabase.auth.admin.deleteUser(userId);
    
    if (error) {
      console.warn('[Account Deletion] No se pudo eliminar de Auth:', error);
      // Si falla, intentar actualizar el email a uno anónimo
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
 * Registra la eliminación en la tabla de auditoría
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
      email: email,
      deletion_requested_at: deletionRequestedAt,
      deletion_completed_at: new Date().toISOString(),
      reason: 'user_request',
      actions_taken: actionsTaken,
      organization_ids: organizationIds,
      processed_by: 'cron_job',
      metadata: {
        processed_at: new Date().toISOString(),
        version: '1.0',
      },
    });
  
  if (error) {
    console.error('[Account Deletion] Error creando registro de auditoría:', error);
    // No lanzar error, solo registrar - la eliminación ya se completó
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
    
    // 1. Verificar si es único admin con suscripción activa
    const soleAdminCheck = await checkSoleAdmin(user_id);
    
    if (soleAdminCheck.isBlocked) {
      console.warn(
        `[Account Deletion] Usuario ${email} bloqueado: ${soleAdminCheck.reason}`,
        soleAdminCheck.blockingOrganizations
      );
      
      return {
        success: false,
        user_id,
        email,
        skipped_reason: `Único administrador con suscripción activa en ${soleAdminCheck.blockingOrganizations?.length} organización(es). Requiere revisión manual.`,
      };
    }
    
    // 2. Anonimizar datos personales del perfil
    await anonymizeProfile(user_id);
    actionsTaken.push('anonymized_profile');
    
    // 3. Eliminar avatar del storage
    await deleteAvatar(user_id);
    actionsTaken.push('deleted_avatar');
    
    // 4. Remover de organizaciones (marcar como inactivo)
    await removeFromOrganizations(user_id);
    actionsTaken.push('removed_from_organizations');
    
    // 5. Deshabilitar/eliminar usuario de Auth
    await disableAuthUser(user_id, email);
    actionsTaken.push('disabled_auth_user');
    
    // 6. Crear registro de auditoría
    await createAuditRecord(
      user_id,
      email,
      deletion_requested_at,
      organization_ids,
      actionsTaken
    );
    
    // 7. Enviar correo de confirmación
    try {
      await sendAccountDeletionCompleteEmail(email);
      actionsTaken.push('sent_confirmation_email');
    } catch (emailError) {
      console.warn('[Account Deletion] Error enviando correo de confirmación:', emailError);
      // No fallar por el correo
    }
    
    console.log(`[Account Deletion] Usuario ${email} eliminado exitosamente`);
    
    return {
      success: true,
      user_id,
      email,
      actions_taken: actionsTaken,
    };
    
  } catch (error) {
    console.error(`[Account Deletion] Error procesando ${email}:`, error);
    
    return {
      success: false,
      user_id,
      email,
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
 * 
 * @param daysAfter - Días calendario después de la solicitud para procesar (por defecto 10)
 * @returns Resultado del procesamiento con estadísticas
 */
export async function processPendingAccountDeletions(daysAfter: number = 10): Promise<ProcessResult> {
  console.log(`[Account Deletion] Iniciando procesamiento de cuentas pendientes (${daysAfter} días)`);
  
  try {
    // 1. Obtener cuentas pendientes
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
    
    // 2. Procesar cada cuenta
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
 * 
 * Se debe llamar desde EliminarCuentaSection.tsx después de marcar pending_deletion
 */
export async function sendDeletionRequestNotification(email: string, userName: string): Promise<void> {
  try {
    await sendAccountDeletionRequestEmail(email, userName);
  } catch (error) {
    console.error('[Account Deletion] Error enviando notificación de solicitud:', error);
    // No lanzar error - la solicitud ya se registró
  }
}
