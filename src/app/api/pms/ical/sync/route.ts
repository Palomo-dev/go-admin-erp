import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { parseICalFeed } from '@/lib/services/icalService';

/**
 * POST /api/pms/ical/sync
 * 
 * Sincroniza calendarios iCal de todos los canales activos de una organización.
 * Puede ser llamado manualmente desde la UI o por un cron job.
 * 
 * Body: { organization_id: number, connection_id?: string }
 * - Si se pasa connection_id, sincroniza solo esa conexión.
 * - Si no, sincroniza todas las conexiones activas de la organización.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { organization_id, connection_id } = body;

    if (!organization_id) {
      return NextResponse.json(
        { error: 'organization_id es requerido' },
        { status: 400 }
      );
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Obtener conexiones a sincronizar
    let query = supabaseAdmin
      .from('channel_connections')
      .select('*')
      .eq('organization_id', organization_id)
      .eq('is_active', true)
      .eq('sync_enabled', true)
      .not('ical_import_url', 'is', null);

    if (connection_id) {
      query = query.eq('id', connection_id);
    }

    const { data: connections, error: connError } = await query;

    if (connError) {
      return NextResponse.json(
        { error: 'Error obteniendo conexiones', details: connError.message },
        { status: 500 }
      );
    }

    if (!connections || connections.length === 0) {
      return NextResponse.json({
        message: 'No hay conexiones activas para sincronizar',
        results: [],
      });
    }

    const results: Array<{
      connection_id: string;
      channel: string;
      space_id: string;
      status: string;
      events_found: number;
      events_created: number;
      events_updated: number;
      events_deleted: number;
      errors: string[];
    }> = [];

    // Procesar cada conexión
    for (const conn of connections) {
      const startTime = Date.now();
      const syncResult = {
        connection_id: conn.id,
        channel: conn.channel,
        space_id: conn.space_id,
        status: 'success' as string,
        events_found: 0,
        events_created: 0,
        events_updated: 0,
        events_deleted: 0,
        errors: [] as string[],
      };

      try {
        // Descargar calendario externo
        const response = await fetch(conn.ical_import_url, {
          headers: { 'User-Agent': 'GOAdmin-ERP-PMS/1.0' },
          signal: AbortSignal.timeout(15000),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const icalContent = await response.text();
        const events = parseICalFeed(icalContent);
        syncResult.events_found = events.length;

        // Obtener bloqueos existentes de esta conexión
        const { data: existingBlocks } = await supabaseAdmin
          .from('channel_blocks')
          .select('id, external_event_uid, start_date, end_date, summary')
          .eq('connection_id', conn.id);

        const existingMap = new Map(
          (existingBlocks || []).map(b => [b.external_event_uid, b])
        );

        const processedUids = new Set<string>();

        // Procesar eventos
        for (const event of events) {
          processedUids.add(event.uid);
          const existing = existingMap.get(event.uid);

          if (existing) {
            // Verificar si cambió
            if (
              existing.start_date !== event.dtstart ||
              existing.end_date !== event.dtend ||
              existing.summary !== (event.summary || null)
            ) {
              const { error } = await supabaseAdmin
                .from('channel_blocks')
                .update({
                  start_date: event.dtstart,
                  end_date: event.dtend,
                  summary: event.summary || null,
                  raw_event: event as unknown as Record<string, unknown>,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', existing.id);

              if (error) {
                syncResult.errors.push(`Update ${event.uid}: ${error.message}`);
              } else {
                syncResult.events_updated++;
              }
            }
          } else {
            // Crear nuevo bloqueo
            const { error } = await supabaseAdmin
              .from('channel_blocks')
              .insert({
                connection_id: conn.id,
                organization_id: conn.organization_id,
                space_id: conn.space_id,
                channel: conn.channel,
                external_event_uid: event.uid,
                summary: event.summary || null,
                start_date: event.dtstart,
                end_date: event.dtend,
                raw_event: event as unknown as Record<string, unknown>,
              });

            if (error) {
              syncResult.errors.push(`Create ${event.uid}: ${error.message}`);
            } else {
              syncResult.events_created++;
            }
          }
        }

        // Eliminar bloqueos que ya no están en el feed
        const existingEntries = Array.from(existingMap.entries());
        for (const [uid, block] of existingEntries) {
          if (!processedUids.has(uid)) {
            const { error } = await supabaseAdmin
              .from('channel_blocks')
              .delete()
              .eq('id', block.id);

            if (error) {
              syncResult.errors.push(`Delete ${uid}: ${error.message}`);
            } else {
              syncResult.events_deleted++;
            }
          }
        }

        syncResult.status = syncResult.errors.length > 0 ? 'partial' : 'success';
      } catch (error: any) {
        syncResult.status = 'error';
        syncResult.errors.push(error.message || 'Error desconocido');
      }

      // Actualizar estado de la conexión
      await supabaseAdmin
        .from('channel_connections')
        .update({
          last_sync_at: new Date().toISOString(),
          last_sync_status: syncResult.status,
          last_sync_error: syncResult.errors.length > 0 ? syncResult.errors.join('; ') : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', conn.id);

      // Registrar log
      await supabaseAdmin.from('ical_sync_logs').insert({
        connection_id: conn.id,
        organization_id: conn.organization_id,
        sync_type: 'import',
        status: syncResult.status,
        events_found: syncResult.events_found,
        events_created: syncResult.events_created,
        events_updated: syncResult.events_updated,
        events_deleted: syncResult.events_deleted,
        error_message: syncResult.errors.length > 0 ? syncResult.errors.join('; ') : null,
        duration_ms: Date.now() - startTime,
      });

      results.push(syncResult);
    }

    const allSuccess = results.every(r => r.status === 'success');
    const anyError = results.some(r => r.status === 'error');

    return NextResponse.json({
      message: `Sincronización completada: ${results.length} conexión(es) procesada(s)`,
      overall_status: allSuccess ? 'success' : anyError ? 'partial' : 'partial',
      results,
    });
  } catch (error: any) {
    console.error('Error en sincronización iCal:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor', details: error.message },
      { status: 500 }
    );
  }
}
