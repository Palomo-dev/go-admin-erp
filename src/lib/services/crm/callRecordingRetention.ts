/**
 * Servicio de retención de grabaciones y transcripciones
 * 
 * GO Admin ERP - CRM
 * 
 * Implementa las políticas de retención:
 * - Audio: 90 días
 * - Transcripciones: 180 días
 * 
 * @see uploads/especificacion_agente_goadmin_v1.md sección 5, R-11
 */

import type { SupabaseClient } from '@supabase/supabase-js';

interface RetentionConfig {
  audioRetentionDays: number;
  transcriptRetentionDays: number;
}

const DEFAULT_RETENTION: RetentionConfig = {
  audioRetentionDays: 90,
  transcriptRetentionDays: 180,
};

/**
 * Limpia grabaciones de audio vencidas
 * 
 * Borra de Twilio y del almacenamiento las grabaciones que superaron
 * el periodo de retención (90 días por defecto)
 */
export async function cleanExpiredRecordings(
  supabase: SupabaseClient,
  orgId?: number
): Promise<{
  deleted: number;
  errors: string[];
}> {
  const result = {
    deleted: 0,
    errors: [] as string[],
  };

  try {
    // Obtener configuración de retención
    let audioRetentionDays = DEFAULT_RETENTION.audioRetentionDays;
    
    if (orgId) {
      const { data: settings } = await supabase
        .from('comm_settings')
        .select('voice_recording_retention_days')
        .eq('organization_id', orgId)
        .maybeSingle();

      if (settings?.voice_recording_retention_days) {
        audioRetentionDays = settings.voice_recording_retention_days;
      }
    }

    // Calcular fecha de corte
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - audioRetentionDays);

    // Buscar grabaciones vencidas
    let query = supabase
      .from('call_recordings')
      .select('id, provider_recording_sid, storage_url, organization_id')
      .lte('retention_until', cutoffDate.toISOString())
      .neq('status', 'deleted');

    if (orgId) {
      query = query.eq('organization_id', orgId);
    }

    const { data: expiredRecordings, error } = await query;

    if (error) {
      result.errors.push(`Error al consultar grabaciones vencidas: ${error.message}`);
      return result;
    }

    if (!expiredRecordings || expiredRecordings.length === 0) {
      return result;
    }

    // Borrar cada grabación
    for (const recording of expiredRecordings) {
      try {
        // 1. Borrar de Twilio si existe
        if (recording.provider_recording_sid) {
          // TODO: Implementar borrado vía Twilio API
          // await twilioClient.recordings(recording.provider_recording_sid).remove();
        }

        // 2. Borrar del storage si existe
        if (recording.storage_url) {
          // TODO: Implementar borrado de Supabase Storage
          // const path = extractPathFromUrl(recording.storage_url);
          // await supabase.storage.from('call-recordings').remove([path]);
        }

        // 3. Marcar como deleted en la base
        const { error: updateError } = await supabase
          .from('call_recordings')
          .update({
            status: 'deleted',
            deleted_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', recording.id);

        if (updateError) {
          result.errors.push(`Error al marcar grabación ${recording.id} como borrada: ${updateError.message}`);
        } else {
          result.deleted++;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error desconocido';
        result.errors.push(`Error al borrar grabación ${recording.id}: ${message}`);
      }
    }

    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    result.errors.push(`Error general al limpiar grabaciones: ${message}`);
    return result;
  }
}

/**
 * Limpia transcripciones vencidas
 * 
 * Borra o anonimiza las transcripciones que superaron el periodo
 * de retención (180 días por defecto)
 */
export async function cleanExpiredTranscripts(
  supabase: SupabaseClient,
  orgId?: number
): Promise<{
  deleted: number;
  errors: string[];
}> {
  const result = {
    deleted: 0,
    errors: [] as string[],
  };

  try {
    const transcriptRetentionDays = DEFAULT_RETENTION.transcriptRetentionDays;

    // Calcular fecha de corte
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - transcriptRetentionDays);

    // Buscar transcripciones vencidas
    let query = supabase
      .from('call_transcripts')
      .select('id, call_id, created_at')
      .lte('created_at', cutoffDate.toISOString());

    if (orgId) {
      query = query.eq('organization_id', orgId);
    }

    const { data: expiredTranscripts, error } = await query;

    if (error) {
      result.errors.push(`Error al consultar transcripciones vencidas: ${error.message}`);
      return result;
    }

    if (!expiredTranscripts || expiredTranscripts.length === 0) {
      return result;
    }

    // Borrar cada transcripción
    // Opción 1: Borrado completo (implementada aquí)
    // Opción 2: Anonización (comentada abajo)
    
    for (const transcript of expiredTranscripts) {
      try {
        const { error: deleteError } = await supabase
          .from('call_transcripts')
          .delete()
          .eq('id', transcript.id);

        if (deleteError) {
          result.errors.push(`Error al borrar transcripción ${transcript.id}: ${deleteError.message}`);
        } else {
          result.deleted++;
        }

        /* Opción alternativa: Anonización en lugar de borrado
        const { error: updateError } = await supabase
          .from('call_transcripts')
          .update({
            transcript: null,
            segments: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', transcript.id);
        
        if (updateError) {
          result.errors.push(`Error al anonimizar transcripción ${transcript.id}: ${updateError.message}`);
        } else {
          result.deleted++;
        }
        */
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error desconocido';
        result.errors.push(`Error al procesar transcripción ${transcript.id}: ${message}`);
      }
    }

    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    result.errors.push(`Error general al limpiar transcripciones: ${message}`);
    return result;
  }
}

/**
 * Ejecuta la limpieza de retención para una organización
 * (o todas si no se especifica orgId)
 */
export async function runRetentionCleanup(
  supabase: SupabaseClient,
  orgId?: number
): Promise<{
  recordings: { deleted: number; errors: string[] };
  transcripts: { deleted: number; errors: string[] };
}> {
  const [recordings, transcripts] = await Promise.all([
    cleanExpiredRecordings(supabase, orgId),
    cleanExpiredTranscripts(supabase, orgId),
  ]);

  return {
    recordings,
    transcripts,
  };
}
