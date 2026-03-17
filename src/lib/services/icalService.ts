import { supabase } from '@/lib/supabase/config';

// ============================================================
// Tipos
// ============================================================

export interface ICalEvent {
  uid: string;
  summary: string;
  dtstart: string; // YYYY-MM-DD
  dtend: string;   // YYYY-MM-DD
  description?: string;
  status?: string;
  created?: string;
  lastModified?: string;
}

export interface ChannelConnection {
  id: string;
  organization_id: number;
  space_id: string;
  channel: string;
  connection_type: string;
  ical_import_url: string | null;
  ical_export_token: string;
  external_property_id: string | null;
  external_room_id: string | null;
  sync_enabled: boolean;
  sync_interval_minutes: number;
  last_sync_at: string | null;
  last_sync_status: string | null;
  last_sync_error: string | null;
  commission_percent: number;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  spaces?: {
    id: string;
    label: string;
    space_types?: { name: string };
  };
}

export interface ChannelBlock {
  id: string;
  connection_id: string;
  organization_id: number;
  space_id: string;
  channel: string;
  external_event_uid: string;
  summary: string | null;
  start_date: string;
  end_date: string;
  is_reservation: boolean;
  reservation_id: string | null;
  raw_event: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface SyncResult {
  eventsFound: number;
  eventsCreated: number;
  eventsUpdated: number;
  eventsDeleted: number;
  errors: string[];
}

// ============================================================
// Generador iCal (Export)
// ============================================================

function formatDateICal(dateStr: string): string {
  return dateStr.replace(/-/g, '');
}

function escapeICalText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/**
 * Genera un calendario iCal (.ics) con las reservas y bloqueos de un espacio.
 * Airbnb, Booking.com y otros OTAs pueden suscribirse a esta URL.
 */
export function generateICalFeed(
  spaceName: string,
  organizationName: string,
  reservations: Array<{
    id: string;
    checkin: string;
    checkout: string;
    status: string;
    customer_name?: string;
    channel?: string;
    notes?: string;
  }>,
  blocks: Array<{
    id: string;
    start_date: string;
    end_date: string;
    summary?: string;
  }>
): string {
  const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${organizationName}//GO Admin ERP PMS//ES`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeICalText(spaceName)} - ${escapeICalText(organizationName)}`,
    'X-WR-TIMEZONE:America/Bogota',
  ];

  // Reservas activas como eventos bloqueados
  for (const r of reservations) {
    if (['cancelled', 'no_show'].includes(r.status)) continue;

    const summary = r.channel && r.channel !== 'direct'
      ? `Reservado - ${r.channel}`
      : 'Reservado';

    lines.push(
      'BEGIN:VEVENT',
      `UID:reservation-${r.id}@goadmin`,
      `DTSTAMP:${now}`,
      `DTSTART;VALUE=DATE:${formatDateICal(r.checkin)}`,
      `DTEND;VALUE=DATE:${formatDateICal(r.checkout)}`,
      `SUMMARY:${escapeICalText(summary)}`,
    );

    if (r.notes) {
      lines.push(`DESCRIPTION:${escapeICalText(r.notes)}`);
    }

    lines.push(
      'STATUS:CONFIRMED',
      'TRANSP:OPAQUE',
      'END:VEVENT',
    );
  }

  // Bloqueos manuales
  for (const b of blocks) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:block-${b.id}@goadmin`,
      `DTSTAMP:${now}`,
      `DTSTART;VALUE=DATE:${formatDateICal(b.start_date)}`,
      `DTEND;VALUE=DATE:${formatDateICal(b.end_date)}`,
      `SUMMARY:${escapeICalText(b.summary || 'No disponible')}`,
      'STATUS:CONFIRMED',
      'TRANSP:OPAQUE',
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

// ============================================================
// Parser iCal (Import)
// ============================================================

/**
 * Parsea un string iCal y extrae los eventos VEVENT.
 * Compatible con feeds de Airbnb, Booking.com, Expedia, VRBO, etc.
 */
export function parseICalFeed(icalContent: string): ICalEvent[] {
  const events: ICalEvent[] = [];
  const lines = icalContent
    .replace(/\r\n /g, '') // Unfold líneas continuadas
    .replace(/\r\n\t/g, '')
    .split(/\r?\n/);

  let currentEvent: Partial<ICalEvent> | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === 'BEGIN:VEVENT') {
      currentEvent = {};
      continue;
    }

    if (trimmed === 'END:VEVENT') {
      if (currentEvent?.uid && currentEvent?.dtstart && currentEvent?.dtend) {
        events.push(currentEvent as ICalEvent);
      }
      currentEvent = null;
      continue;
    }

    if (!currentEvent) continue;

    // Parsear propiedades
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;

    const keyPart = trimmed.substring(0, colonIdx);
    const value = trimmed.substring(colonIdx + 1);

    // Extraer nombre de propiedad sin parámetros (ej: DTSTART;VALUE=DATE → DTSTART)
    const propName = keyPart.split(';')[0].toUpperCase();

    switch (propName) {
      case 'UID':
        currentEvent.uid = value;
        break;
      case 'SUMMARY':
        currentEvent.summary = value.replace(/\\n/g, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';');
        break;
      case 'DTSTART':
        currentEvent.dtstart = normalizeICalDate(value);
        break;
      case 'DTEND':
        currentEvent.dtend = normalizeICalDate(value);
        break;
      case 'DESCRIPTION':
        currentEvent.description = value.replace(/\\n/g, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';');
        break;
      case 'STATUS':
        currentEvent.status = value;
        break;
      case 'CREATED':
        currentEvent.created = value;
        break;
      case 'LAST-MODIFIED':
        currentEvent.lastModified = value;
        break;
    }
  }

  return events;
}

/**
 * Normaliza fechas iCal a formato YYYY-MM-DD.
 * Soporta: 20250115, 20250115T140000Z, 20250115T140000
 */
function normalizeICalDate(value: string): string {
  const clean = value.replace(/[^0-9]/g, '').substring(0, 8);
  if (clean.length < 8) return value;
  return `${clean.substring(0, 4)}-${clean.substring(4, 6)}-${clean.substring(6, 8)}`;
}

// ============================================================
// Servicio principal
// ============================================================

class ICalService {
  // ── Conexiones de canal ──────────────────────────────────

  async getConnections(organizationId: number): Promise<ChannelConnection[]> {
    const { data, error } = await supabase
      .from('channel_connections')
      .select(`
        *,
        spaces (
          id,
          label,
          space_types ( name )
        )
      `)
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error obteniendo channel_connections:', error.message || error);
      return [];
    }
    return data || [];
  }

  async getConnectionsBySpace(spaceId: string): Promise<ChannelConnection[]> {
    const { data, error } = await supabase
      .from('channel_connections')
      .select('*')
      .eq('space_id', spaceId)
      .eq('is_active', true);

    if (error) throw error;
    return data || [];
  }

  async getConnectionByToken(token: string): Promise<ChannelConnection | null> {
    const { data, error } = await supabase
      .from('channel_connections')
      .select(`
        *,
        spaces (
          id,
          label,
          space_types ( name )
        )
      `)
      .eq('ical_export_token', token)
      .eq('is_active', true)
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  async createConnection(params: {
    organization_id: number;
    space_id: string;
    channel: string;
    connection_type?: string;
    ical_import_url?: string;
    commission_percent?: number;
    sync_interval_minutes?: number;
    notes?: string;
  }): Promise<ChannelConnection> {
    const { data, error } = await supabase
      .from('channel_connections')
      .insert({
        organization_id: params.organization_id,
        space_id: params.space_id,
        channel: params.channel,
        connection_type: params.connection_type || 'ical',
        ical_import_url: params.ical_import_url || null,
        commission_percent: params.commission_percent || 0,
        sync_interval_minutes: params.sync_interval_minutes || 30,
        notes: params.notes || null,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async updateConnection(
    connectionId: string,
    updates: Partial<Pick<ChannelConnection,
      'ical_import_url' | 'sync_enabled' | 'sync_interval_minutes' |
      'commission_percent' | 'notes' | 'is_active' |
      'external_property_id' | 'external_room_id'
    >>
  ): Promise<ChannelConnection> {
    const { data, error } = await supabase
      .from('channel_connections')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', connectionId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async deleteConnection(connectionId: string): Promise<void> {
    const { error } = await supabase
      .from('channel_connections')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', connectionId);

    if (error) throw error;
  }

  // ── Export iCal ──────────────────────────────────────────

  /**
   * Genera el feed iCal para un espacio específico.
   * Incluye reservas activas y bloqueos de otros canales.
   */
  async generateExportFeed(
    spaceId: string,
    organizationId: number,
    organizationName: string
  ): Promise<string> {
    // Obtener reservas activas del espacio
    const { data: reservations, error: resError } = await supabase
      .from('reservations')
      .select('id, checkin, checkout, status, channel, notes, customer_id')
      .eq('space_id', spaceId)
      .eq('organization_id', organizationId)
      .in('status', ['tentative', 'confirmed', 'checked_in'])
      .gte('checkout', new Date().toISOString().split('T')[0]);

    if (resError) throw resError;

    // Obtener bloqueos manuales
    const { data: manualBlocks, error: blockError } = await supabase
      .from('space_blocks')
      .select('id, start_date, end_date, reason')
      .eq('space_id', spaceId)
      .gte('end_date', new Date().toISOString().split('T')[0]);

    // Si space_blocks no existe, usar array vacío
    const blocks = blockError ? [] : (manualBlocks || []);

    // Obtener nombre del espacio
    const { data: space } = await supabase
      .from('spaces')
      .select('label')
      .eq('id', spaceId)
      .single();

    return generateICalFeed(
      space?.label || 'Espacio',
      organizationName,
      (reservations || []).map(r => ({
        id: r.id,
        checkin: r.checkin,
        checkout: r.checkout,
        status: r.status,
        channel: r.channel,
        notes: r.notes,
      })),
      blocks.map(b => ({
        id: b.id,
        start_date: b.start_date,
        end_date: b.end_date,
        summary: b.reason || 'No disponible',
      }))
    );
  }

  // ── Import iCal ─────────────────────────────────────────

  /**
   * Importa eventos desde un calendario iCal externo.
   * Crea/actualiza/elimina bloqueos en channel_blocks.
   */
  async importFromUrl(connection: ChannelConnection): Promise<SyncResult> {
    const startTime = Date.now();
    const result: SyncResult = {
      eventsFound: 0,
      eventsCreated: 0,
      eventsUpdated: 0,
      eventsDeleted: 0,
      errors: [],
    };

    if (!connection.ical_import_url) {
      result.errors.push('No hay URL de importación configurada');
      await this.logSync(connection, 'import', 'error', result, startTime);
      return result;
    }

    try {
      // Descargar calendario
      const response = await fetch(connection.ical_import_url, {
        headers: { 'User-Agent': 'GOAdmin-ERP-PMS/1.0' },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const icalContent = await response.text();
      const events = parseICalFeed(icalContent);
      result.eventsFound = events.length;

      // Obtener bloqueos existentes de esta conexión
      const { data: existingBlocks } = await supabase
        .from('channel_blocks')
        .select('id, external_event_uid, start_date, end_date, summary')
        .eq('connection_id', connection.id);

      const existingMap = new Map(
        (existingBlocks || []).map(b => [b.external_event_uid, b])
      );

      const processedUids = new Set<string>();

      // Procesar cada evento
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
            const { error } = await supabase
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
              result.errors.push(`Error actualizando ${event.uid}: ${error.message}`);
            } else {
              result.eventsUpdated++;
            }
          }
        } else {
          // Crear nuevo bloqueo
          const { error } = await supabase
            .from('channel_blocks')
            .insert({
              connection_id: connection.id,
              organization_id: connection.organization_id,
              space_id: connection.space_id,
              channel: connection.channel,
              external_event_uid: event.uid,
              summary: event.summary || null,
              start_date: event.dtstart,
              end_date: event.dtend,
              raw_event: event as unknown as Record<string, unknown>,
            });

          if (error) {
            result.errors.push(`Error creando ${event.uid}: ${error.message}`);
          } else {
            result.eventsCreated++;
          }
        }
      }

      // Eliminar bloqueos que ya no están en el feed
      const existingEntries = Array.from(existingMap.entries());
      for (const [uid, block] of existingEntries) {
        if (!processedUids.has(uid)) {
          const { error } = await supabase
            .from('channel_blocks')
            .delete()
            .eq('id', block.id);

          if (error) {
            result.errors.push(`Error eliminando ${uid}: ${error.message}`);
          } else {
            result.eventsDeleted++;
          }
        }
      }

      // Actualizar estado de conexión
      const status = result.errors.length > 0 ? 'partial' : 'success';
      await supabase
        .from('channel_connections')
        .update({
          last_sync_at: new Date().toISOString(),
          last_sync_status: status,
          last_sync_error: result.errors.length > 0 ? result.errors.join('; ') : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', connection.id);

      await this.logSync(connection, 'import', status, result, startTime);
    } catch (error: any) {
      result.errors.push(error.message || 'Error desconocido');

      await supabase
        .from('channel_connections')
        .update({
          last_sync_at: new Date().toISOString(),
          last_sync_status: 'error',
          last_sync_error: error.message,
          updated_at: new Date().toISOString(),
        })
        .eq('id', connection.id);

      await this.logSync(connection, 'import', 'error', result, startTime);
    }

    return result;
  }

  /**
   * Sincroniza todas las conexiones activas de una organización.
   */
  async syncAllConnections(organizationId: number): Promise<Map<string, SyncResult>> {
    const connections = await this.getConnections(organizationId);
    const results = new Map<string, SyncResult>();

    for (const conn of connections) {
      if (!conn.sync_enabled || !conn.ical_import_url) continue;
      const result = await this.importFromUrl(conn);
      results.set(conn.id, result);
    }

    return results;
  }

  // ── Bloqueos de canal ───────────────────────────────────

  async getBlocksBySpace(
    spaceId: string,
    startDate?: string,
    endDate?: string
  ): Promise<ChannelBlock[]> {
    let query = supabase
      .from('channel_blocks')
      .select('*')
      .eq('space_id', spaceId);

    if (startDate) query = query.gte('end_date', startDate);
    if (endDate) query = query.lte('start_date', endDate);

    const { data, error } = await query.order('start_date');
    if (error) throw error;
    return data || [];
  }

  // ── Logs de sincronización ──────────────────────────────

  async getSyncLogs(
    connectionId: string,
    limit: number = 20
  ): Promise<Array<{
    id: string;
    sync_type: string;
    status: string;
    events_found: number;
    events_created: number;
    events_updated: number;
    events_deleted: number;
    error_message: string | null;
    duration_ms: number | null;
    created_at: string;
  }>> {
    const { data, error } = await supabase
      .from('ical_sync_logs')
      .select('*')
      .eq('connection_id', connectionId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  }

  private async logSync(
    connection: ChannelConnection,
    syncType: 'import' | 'export',
    status: string,
    result: SyncResult,
    startTime: number
  ): Promise<void> {
    await supabase.from('ical_sync_logs').insert({
      connection_id: connection.id,
      organization_id: connection.organization_id,
      sync_type: syncType,
      status,
      events_found: result.eventsFound,
      events_created: result.eventsCreated,
      events_updated: result.eventsUpdated,
      events_deleted: result.eventsDeleted,
      error_message: result.errors.length > 0 ? result.errors.join('; ') : null,
      duration_ms: Date.now() - startTime,
    });
  }
}

export default new ICalService();
