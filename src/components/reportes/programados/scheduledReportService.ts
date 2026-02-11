import { supabase } from '@/lib/supabase/config';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface ScheduledReport {
  id: string;
  organization_id: number;
  saved_report_id: string | null;
  user_id: string;
  name: string;
  frequency: string;
  recipients: Recipient[];
  next_run_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Joined
  saved_report_name?: string;
  saved_report_module?: string;
  last_execution?: ReportExecution | null;
}

export interface Recipient {
  email: string;
  name?: string;
  format?: 'pdf' | 'excel' | 'csv';
}

export interface ReportExecution {
  id: string;
  organization_id: number;
  saved_report_id: string | null;
  user_id: string;
  module: string;
  status: string;
  filters: Record<string, unknown>;
  row_count: number;
  duration_ms: number;
  error_message: string | null;
  created_at: string;
}

export interface SavedReportOption {
  id: string;
  name: string;
  module: string;
  description: string | null;
}

export interface ScheduledFormData {
  name: string;
  saved_report_id: string | null;
  frequency: string;
  recipients: Recipient[];
  is_active: boolean;
  next_run_at: string | null;
}

export const FREQUENCY_OPTIONS = [
  { value: 'daily', label: 'Diario' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'biweekly', label: 'Quincenal' },
  { value: 'monthly', label: 'Mensual' },
  { value: 'quarterly', label: 'Trimestral' },
] as const;

export const FORMAT_OPTIONS = [
  { value: 'pdf', label: 'PDF' },
  { value: 'excel', label: 'Excel' },
  { value: 'csv', label: 'CSV' },
] as const;

export const FREQUENCY_LABEL: Record<string, string> = {
  daily: 'Diario',
  weekly: 'Semanal',
  biweekly: 'Quincenal',
  monthly: 'Mensual',
  quarterly: 'Trimestral',
};

// ─── Servicio ────────────────────────────────────────────────────────────────

export const scheduledReportService = {
  /**
   * Lista programaciones con join a saved_reports y última ejecución
   */
  async getScheduledReports(organizationId: number): Promise<ScheduledReport[]> {
    const { data, error } = await supabase
      .from('scheduled_reports')
      .select(`
        id, organization_id, saved_report_id, user_id, name, frequency,
        recipients, next_run_at, is_active, created_at, updated_at,
        saved_reports ( name, module )
      `)
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (error || !data) {
      console.error('Error fetching scheduled reports:', error);
      return [];
    }

    // Obtener última ejecución para cada scheduled_report que tenga saved_report_id
    const reportIds = data
      .map((d: any) => d.saved_report_id)
      .filter(Boolean) as string[];

    let executionsMap: Record<string, ReportExecution> = {};
    if (reportIds.length > 0) {
      const uniqueIds = Array.from(new Set(reportIds));
      const { data: executions } = await supabase
        .from('report_executions')
        .select('*')
        .eq('organization_id', organizationId)
        .in('saved_report_id', uniqueIds)
        .order('created_at', { ascending: false });

      if (executions) {
        for (const exec of executions) {
          if (!executionsMap[exec.saved_report_id]) {
            executionsMap[exec.saved_report_id] = exec as ReportExecution;
          }
        }
      }
    }

    return data.map((d: any) => {
      const sr = d.saved_reports;
      return {
        ...d,
        recipients: Array.isArray(d.recipients) ? d.recipients : [],
        saved_report_name: sr?.name || null,
        saved_report_module: sr?.module || null,
        last_execution: d.saved_report_id ? executionsMap[d.saved_report_id] || null : null,
      };
    });
  },

  /**
   * Lista saved_reports para selector
   */
  async getSavedReports(organizationId: number): Promise<SavedReportOption[]> {
    const { data, error } = await supabase
      .from('saved_reports')
      .select('id, name, module, description')
      .eq('organization_id', organizationId)
      .order('name');

    if (error || !data) return [];
    return data as SavedReportOption[];
  },

  /**
   * Crear programación
   */
  async create(
    organizationId: number,
    userId: string,
    formData: ScheduledFormData
  ): Promise<ScheduledReport | null> {
    const { data, error } = await supabase
      .from('scheduled_reports')
      .insert({
        organization_id: organizationId,
        user_id: userId,
        name: formData.name,
        saved_report_id: formData.saved_report_id || null,
        frequency: formData.frequency,
        recipients: formData.recipients as any,
        next_run_at: formData.next_run_at || calculateNextRun(formData.frequency),
        is_active: formData.is_active,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating scheduled report:', error);
      return null;
    }
    return data as ScheduledReport;
  },

  /**
   * Actualizar programación
   */
  async update(
    id: string,
    formData: Partial<ScheduledFormData>
  ): Promise<ScheduledReport | null> {
    const updateData: Record<string, any> = { updated_at: new Date().toISOString() };
    if (formData.name !== undefined) updateData.name = formData.name;
    if (formData.saved_report_id !== undefined) updateData.saved_report_id = formData.saved_report_id || null;
    if (formData.frequency !== undefined) {
      updateData.frequency = formData.frequency;
      updateData.next_run_at = formData.next_run_at || calculateNextRun(formData.frequency);
    }
    if (formData.recipients !== undefined) updateData.recipients = formData.recipients as any;
    if (formData.is_active !== undefined) updateData.is_active = formData.is_active;
    if (formData.next_run_at !== undefined) updateData.next_run_at = formData.next_run_at;

    const { data, error } = await supabase
      .from('scheduled_reports')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating scheduled report:', error);
      return null;
    }
    return data as ScheduledReport;
  },

  /**
   * Eliminar programación
   */
  async delete(id: string): Promise<boolean> {
    const { error } = await supabase
      .from('scheduled_reports')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting scheduled report:', error);
      return false;
    }
    return true;
  },

  /**
   * Toggle activo/inactivo
   */
  async toggleActive(id: string, isActive: boolean): Promise<boolean> {
    const { error } = await supabase
      .from('scheduled_reports')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      console.error('Error toggling scheduled report:', error);
      return false;
    }
    return true;
  },

  /**
   * Duplicar programación
   */
  async duplicate(
    organizationId: number,
    userId: string,
    source: ScheduledReport
  ): Promise<ScheduledReport | null> {
    return this.create(organizationId, userId, {
      name: `${source.name} (copia)`,
      saved_report_id: source.saved_report_id,
      frequency: source.frequency,
      recipients: source.recipients,
      is_active: false,
      next_run_at: calculateNextRun(source.frequency),
    });
  },

  /**
   * Ejecutar ahora: registra una ejecución en report_executions
   */
  async executeNow(
    organizationId: number,
    userId: string,
    schedule: ScheduledReport
  ): Promise<ReportExecution | null> {
    const { data, error } = await supabase
      .from('report_executions')
      .insert({
        organization_id: organizationId,
        user_id: userId,
        saved_report_id: schedule.saved_report_id,
        module: schedule.saved_report_module || 'general',
        status: 'completed',
        filters: {},
        row_count: 0,
        duration_ms: 0,
      })
      .select()
      .single();

    if (error) {
      console.error('Error executing report:', error);
      return null;
    }
    return data as ReportExecution;
  },

  /**
   * Historial de ejecuciones
   */
  async getExecutionHistory(
    organizationId: number,
    savedReportId?: string | null,
    limit: number = 20
  ): Promise<ReportExecution[]> {
    let query = supabase
      .from('report_executions')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (savedReportId) {
      query = query.eq('saved_report_id', savedReportId);
    }

    const { data, error } = await query;
    if (error || !data) return [];
    return data as ReportExecution[];
  },
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function calculateNextRun(frequency: string): string {
  const now = new Date();
  switch (frequency) {
    case 'daily':
      now.setDate(now.getDate() + 1);
      now.setHours(7, 0, 0, 0);
      break;
    case 'weekly':
      now.setDate(now.getDate() + (7 - now.getDay() + 1)); // Próximo lunes
      now.setHours(7, 0, 0, 0);
      break;
    case 'biweekly':
      now.setDate(now.getDate() + 14);
      now.setHours(7, 0, 0, 0);
      break;
    case 'monthly':
      now.setMonth(now.getMonth() + 1, 1);
      now.setHours(7, 0, 0, 0);
      break;
    case 'quarterly':
      now.setMonth(now.getMonth() + 3, 1);
      now.setHours(7, 0, 0, 0);
      break;
    default:
      now.setDate(now.getDate() + 7);
      now.setHours(7, 0, 0, 0);
  }
  return now.toISOString();
}
