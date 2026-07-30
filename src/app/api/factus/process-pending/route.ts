/**
 * API Route: Procesar jobs pendientes de facturación electrónica
 * POST /api/factus/process-pending
 *
 * Endpoint para ser llamado por un cron job o scheduler.
 * Procesa jobs en estado 'pending' o 'failed' (con reintentos disponibles).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseClient } from '@/lib/supabase/config';
import { getValidToken, getCredentials } from '@/lib/services/factusTokenManager';
import factusService from '@/lib/services/factusService';

export async function POST(request: NextRequest) {
  try {
    // Verificar API key si está configurada
    const authHeader = request.headers.get('authorization');
    const apiKey = process.env.FACTUS_CRON_API_KEY;
    if (apiKey && authHeader !== `Bearer ${apiKey}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createSupabaseClient();

    // Obtener jobs pendientes o fallidos con reintentos disponibles
    const { data: pendingJobs, error } = await supabase
      .from('electronic_invoicing_jobs')
      .select('*')
      .in('status', ['pending', 'failed'])
      .lt('attempt_count', 5)
      .order('created_at', { ascending: true })
      .limit(10);

    if (error) throw error;
    if (!pendingJobs || pendingJobs.length === 0) {
      return NextResponse.json({ processed: 0, message: 'No pending jobs' });
    }

    const credentials = getCredentials();
    if (!credentials) {
      return NextResponse.json({ error: 'Credenciales no configuradas' }, { status: 500 });
    }

    const results: Array<{ jobId: string; success: boolean; status: string }> = [];

    for (const job of pendingJobs) {
      try {
        // Marcar como processing
        await supabase
          .from('electronic_invoicing_jobs')
          .update({ status: 'processing', updated_at: new Date().toISOString() })
          .eq('id', job.id);

        const accessToken = await getValidToken();
        if (!accessToken) {
          throw new Error('No se pudo obtener token');
        }

        // Reenviar a Factus usando el request_payload guardado
        if (!job.request_payload) {
          throw new Error('No hay request payload guardado');
        }

        const result = await factusService.createInvoice(
          credentials.environment,
          accessToken,
          job.request_payload
        );

        const newStatus = result.data?.is_validated ? 'accepted' : 'sent';

        await supabase
          .from('electronic_invoicing_jobs')
          .update({
            status: newStatus,
            response_payload: result,
            cufe: result.data?.cufe,
            processed_at: new Date().toISOString(),
            attempt_count: job.attempt_count + 1,
            updated_at: new Date().toISOString(),
          })
          .eq('id', job.id);

        await supabase
          .from('electronic_invoicing_events')
          .insert({
            job_id: job.id,
            event_type: newStatus,
            event_code: '200',
            event_message: result.message,
            metadata: { cufe: result.data?.cufe, attempt: job.attempt_count + 1 },
          });

        results.push({ jobId: job.id, success: true, status: newStatus });
      } catch (err: any) {
        const newAttemptCount = job.attempt_count + 1;
        const maxAttempts = 5;
        const finalStatus = newAttemptCount >= maxAttempts ? 'failed' : 'pending';

        await supabase
          .from('electronic_invoicing_jobs')
          .update({
            status: finalStatus,
            error_message: err.message,
            attempt_count: newAttemptCount,
            updated_at: new Date().toISOString(),
          })
          .eq('id', job.id);

        await supabase
          .from('electronic_invoicing_events')
          .insert({
            job_id: job.id,
            event_type: 'error',
            event_message: err.message,
            metadata: { attempt: newAttemptCount, max: maxAttempts },
          });

        results.push({ jobId: job.id, success: false, status: finalStatus });
      }
    }

    return NextResponse.json({
      processed: results.length,
      results,
    });
  } catch (error: any) {
    console.error('Error processing pending jobs:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
