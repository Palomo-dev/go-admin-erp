import { supabase } from '@/lib/supabase/config';

export interface TransportIncident {
  id: string;
  organization_id: number;
  reference_type: 'trip' | 'shipment';
  reference_id: string;
  incident_type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description?: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  assigned_to?: number;
  reported_by?: number;
  occurred_at: string;
  reported_at: string;
  acknowledged_at?: string;
  resolved_at?: string;
  closed_at?: string;
  sla_hours?: number;
  sla_breached: boolean;
  latitude?: number;
  longitude?: number;
  location_description?: string;
  estimated_cost: number;
  actual_cost: number;
  currency: string;
  resolution_summary?: string;
  root_cause?: string;
  corrective_actions?: string;
  attachments?: Array<{ name: string; url: string; type: string }>;
  notes?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface IncidentWithDetails extends TransportIncident {
  assigned_user?: {
    id: number;
    full_name: string;
    email?: string;
  };
  reported_user?: {
    id: number;
    full_name: string;
  };
  trip?: {
    id: string;
    trip_code: string;
    departure_datetime: string;
  };
  shipment?: {
    id: string;
    tracking_number: string;
    status: string;
  };
}

export interface CreateIncidentData {
  organization_id: number;
  reference_type: 'trip' | 'shipment';
  reference_id: string;
  incident_type: string;
  severity?: string;
  title: string;
  description?: string;
  status?: string;
  assigned_to?: number;
  reported_by?: number;
  occurred_at?: string;
  sla_hours?: number;
  latitude?: number;
  longitude?: number;
  location_description?: string;
  estimated_cost?: number;
  actual_cost?: number;
  currency?: string;
  notes?: string;
}

export interface IncidentFilters {
  search?: string;
  status?: string;
  severity?: string;
  reference_type?: string;
  assigned_to?: number;
  sla_breached?: boolean;
  date_from?: string;
  date_to?: string;
}

export const INCIDENT_TYPES = [
  { value: 'accident', label: 'Accidente' },
  { value: 'breakdown', label: 'Avería mecánica' },
  { value: 'delay', label: 'Retraso' },
  { value: 'damage', label: 'Daño de mercancía' },
  { value: 'theft', label: 'Robo' },
  { value: 'loss', label: 'Pérdida' },
  { value: 'complaint', label: 'Queja cliente' },
  { value: 'documentation', label: 'Problema documentación' },
  { value: 'weather', label: 'Clima adverso' },
  { value: 'route', label: 'Problema de ruta' },
  { value: 'other', label: 'Otro' },
];

export const SEVERITY_LEVELS = [
  { value: 'low', label: 'Baja', color: 'green' },
  { value: 'medium', label: 'Media', color: 'yellow' },
  { value: 'high', label: 'Alta', color: 'orange' },
  { value: 'critical', label: 'Crítica', color: 'red' },
];

export const INCIDENT_STATUSES = [
  { value: 'open', label: 'Abierto', color: 'blue' },
  { value: 'in_progress', label: 'En proceso', color: 'yellow' },
  { value: 'resolved', label: 'Resuelto', color: 'green' },
  { value: 'closed', label: 'Cerrado', color: 'gray' },
];

class IncidentsService {
  /**
   * Obtiene incidentes con filtros opcionales
   */
  async getIncidents(
    organizationId: number,
    filters?: IncidentFilters
  ): Promise<IncidentWithDetails[]> {
    let query = supabase
      .from('transport_incidents')
      .select(`
        *,
        assigned_user:employees!transport_incidents_assigned_to_fkey(id, full_name, email),
        reported_user:employees!transport_incidents_reported_by_fkey(id, full_name)
      `)
      .eq('organization_id', organizationId)
      .order('occurred_at', { ascending: false });

    if (filters?.status && filters.status !== 'all') {
      query = query.eq('status', filters.status);
    }
    if (filters?.severity && filters.severity !== 'all') {
      query = query.eq('severity', filters.severity);
    }
    if (filters?.reference_type && filters.reference_type !== 'all') {
      query = query.eq('reference_type', filters.reference_type);
    }
    if (filters?.assigned_to) {
      query = query.eq('assigned_to', filters.assigned_to);
    }
    if (filters?.sla_breached !== undefined) {
      query = query.eq('sla_breached', filters.sla_breached);
    }
    if (filters?.date_from) {
      query = query.gte('occurred_at', filters.date_from);
    }
    if (filters?.date_to) {
      query = query.lte('occurred_at', filters.date_to);
    }
    if (filters?.search) {
      query = query.or(`title.ilike.%${filters.search}%,description.ilike.%${filters.search}%`);
    }

    const { data, error } = await query;

    if (error) throw error;
    return (data || []) as IncidentWithDetails[];
  }

  /**
   * Obtiene un incidente por ID
   */
  async getIncidentById(incidentId: string): Promise<IncidentWithDetails | null> {
    const { data, error } = await supabase
      .from('transport_incidents')
      .select(`
        *,
        assigned_user:employees!transport_incidents_assigned_to_fkey(id, full_name, email),
        reported_user:employees!transport_incidents_reported_by_fkey(id, full_name)
      `)
      .eq('id', incidentId)
      .single();

    if (error) throw error;
    return data as IncidentWithDetails;
  }

  /**
   * Crea un nuevo incidente
   */
  async createIncident(data: CreateIncidentData): Promise<TransportIncident> {
    const { data: newIncident, error } = await supabase
      .from('transport_incidents')
      .insert({
        ...data,
        status: data.status || 'open',
        severity: data.severity || 'medium',
        occurred_at: data.occurred_at || new Date().toISOString(),
        reported_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;
    return newIncident;
  }

  /**
   * Actualiza un incidente
   */
  async updateIncident(
    incidentId: string,
    updates: Partial<CreateIncidentData>
  ): Promise<TransportIncident> {
    const { data, error } = await supabase
      .from('transport_incidents')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', incidentId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Elimina un incidente
   */
  async deleteIncident(incidentId: string): Promise<void> {
    const { error } = await supabase
      .from('transport_incidents')
      .delete()
      .eq('id', incidentId);

    if (error) throw error;
  }

  /**
   * Duplica un incidente
   */
  async duplicateIncident(incidentId: string): Promise<TransportIncident> {
    const original = await this.getIncidentById(incidentId);
    if (!original) throw new Error('Incidente no encontrado');

    const { id, created_at, updated_at, assigned_user, reported_user, trip, shipment, ...incidentData } = original;

    return this.createIncident({
      ...incidentData,
      title: `${incidentData.title} (Copia)`,
      status: 'open',
      resolved_at: undefined,
      closed_at: undefined,
      acknowledged_at: undefined,
    } as CreateIncidentData);
  }

  /**
   * Cambia el estado de un incidente
   */
  async changeStatus(
    incidentId: string,
    newStatus: 'open' | 'in_progress' | 'resolved' | 'closed',
    additionalData?: { resolution_summary?: string; root_cause?: string; corrective_actions?: string }
  ): Promise<TransportIncident> {
    const updates: Record<string, unknown> = {
      status: newStatus,
      updated_at: new Date().toISOString(),
    };

    // Registrar timestamps según el estado
    switch (newStatus) {
      case 'in_progress':
        updates.acknowledged_at = new Date().toISOString();
        break;
      case 'resolved':
        updates.resolved_at = new Date().toISOString();
        if (additionalData) {
          if (additionalData.resolution_summary) updates.resolution_summary = additionalData.resolution_summary;
          if (additionalData.root_cause) updates.root_cause = additionalData.root_cause;
          if (additionalData.corrective_actions) updates.corrective_actions = additionalData.corrective_actions;
        }
        break;
      case 'closed':
        updates.closed_at = new Date().toISOString();
        break;
    }

    const { data, error } = await supabase
      .from('transport_incidents')
      .update(updates)
      .eq('id', incidentId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Asigna responsable a un incidente
   */
  async assignResponsible(incidentId: string, employeeId: number): Promise<TransportIncident> {
    const { data, error } = await supabase
      .from('transport_incidents')
      .update({
        assigned_to: employeeId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', incidentId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Registra costos de un incidente
   */
  async updateCosts(
    incidentId: string,
    costs: { estimated_cost?: number; actual_cost?: number; currency?: string }
  ): Promise<TransportIncident> {
    const { data, error } = await supabase
      .from('transport_incidents')
      .update({
        ...costs,
        updated_at: new Date().toISOString(),
      })
      .eq('id', incidentId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Agrega nota a un incidente
   */
  async addNote(incidentId: string, note: string): Promise<TransportIncident> {
    const incident = await this.getIncidentById(incidentId);
    if (!incident) throw new Error('Incidente no encontrado');

    const timestamp = new Date().toISOString();
    const newNote = `[${timestamp}] ${note}`;
    const updatedNotes = incident.notes ? `${incident.notes}\n${newNote}` : newNote;

    return this.updateIncident(incidentId, { notes: updatedNotes } as Partial<CreateIncidentData>);
  }

  /**
   * Obtiene empleados para asignación
   */
  async getEmployees(organizationId: number): Promise<Array<{ id: number; full_name: string; email?: string }>> {
    const { data, error } = await supabase
      .from('employees')
      .select('id, full_name, email')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .order('full_name', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  /**
   * Obtiene viajes para vincular
   */
  async getTrips(organizationId: number): Promise<Array<{ id: string; trip_code: string; departure_datetime: string }>> {
    const { data, error } = await supabase
      .from('trips')
      .select('id, trip_code, departure_datetime')
      .eq('organization_id', organizationId)
      .order('departure_datetime', { ascending: false })
      .limit(100);

    if (error) throw error;
    return data || [];
  }

  /**
   * Obtiene envíos para vincular
   */
  async getShipments(organizationId: number): Promise<Array<{ id: string; tracking_number: string; status: string }>> {
    const { data, error } = await supabase
      .from('shipments')
      .select('id, tracking_number, status')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;
    return data || [];
  }

  /**
   * Importa incidentes desde datos
   */
  async importIncidents(
    organizationId: number,
    incidents: Partial<CreateIncidentData>[]
  ): Promise<{ success: number; errors: string[] }> {
    const results = { success: 0, errors: [] as string[] };

    for (let i = 0; i < incidents.length; i++) {
      const incident = incidents[i];
      try {
        if (!incident.title || !incident.reference_type || !incident.reference_id || !incident.incident_type) {
          results.errors.push(`Fila ${i + 1}: Campos requeridos faltantes`);
          continue;
        }

        await this.createIncident({
          ...incident,
          organization_id: organizationId,
          title: incident.title,
          reference_type: incident.reference_type as 'trip' | 'shipment',
          reference_id: incident.reference_id,
          incident_type: incident.incident_type,
        });
        results.success++;
      } catch (error) {
        results.errors.push(`Fila ${i + 1}: ${error instanceof Error ? error.message : 'Error desconocido'}`);
      }
    }

    return results;
  }

  /**
   * Obtiene estadísticas de incidentes
   */
  async getStats(organizationId: number): Promise<{
    total: number;
    open: number;
    inProgress: number;
    resolved: number;
    closed: number;
    slaBreached: number;
    bySeverity: Record<string, number>;
    byType: Record<string, number>;
  }> {
    const { data, error } = await supabase
      .from('transport_incidents')
      .select('status, severity, incident_type, sla_breached')
      .eq('organization_id', organizationId);

    if (error) throw error;

    const incidents = data || [];
    const stats = {
      total: incidents.length,
      open: 0,
      inProgress: 0,
      resolved: 0,
      closed: 0,
      slaBreached: 0,
      bySeverity: {} as Record<string, number>,
      byType: {} as Record<string, number>,
    };

    incidents.forEach(inc => {
      // Por estado
      if (inc.status === 'open') stats.open++;
      if (inc.status === 'in_progress') stats.inProgress++;
      if (inc.status === 'resolved') stats.resolved++;
      if (inc.status === 'closed') stats.closed++;
      if (inc.sla_breached) stats.slaBreached++;

      // Por severidad
      stats.bySeverity[inc.severity] = (stats.bySeverity[inc.severity] || 0) + 1;

      // Por tipo
      stats.byType[inc.incident_type] = (stats.byType[inc.incident_type] || 0) + 1;
    });

    return stats;
  }
}

export const incidentsService = new IncidentsService();
