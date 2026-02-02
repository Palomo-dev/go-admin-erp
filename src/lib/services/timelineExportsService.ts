import { supabase } from '@/lib/supabase/config';
import timelineService, { type TimelineFilters, type TimelineEvent } from './timelineService';

export interface TimelineExport {
  id: string;
  organization_id: number;
  user_id: string;
  name: string;
  description?: string;
  filters: TimelineFilters;
  format: 'json' | 'csv' | 'xlsx';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  file_url?: string;
  file_size?: number;
  record_count?: number;
  error_message?: string;
  metadata?: Record<string, unknown>;
  started_at?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateExportInput {
  name: string;
  description?: string;
  filters: TimelineFilters;
  format: 'json' | 'csv';
}

class TimelineExportsService {
  /**
   * Obtiene la lista de exportaciones
   */
  async getExports(
    organizationId: number,
    options: { limit?: number; offset?: number; userId?: string } = {}
  ): Promise<{ data: TimelineExport[]; count: number }> {
    const { limit = 20, offset = 0, userId } = options;

    let query = supabase
      .from('timeline_exports')
      .select('*', { count: 'exact' })
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('Error fetching exports:', error);
      throw error;
    }

    return { data: data || [], count: count || 0 };
  }

  /**
   * Obtiene una exportación por ID
   */
  async getExportById(exportId: string): Promise<TimelineExport | null> {
    const { data, error } = await supabase
      .from('timeline_exports')
      .select('*')
      .eq('id', exportId)
      .single();

    if (error) {
      console.error('Error fetching export:', error);
      return null;
    }

    return data;
  }

  /**
   * Crea una nueva exportación y genera el archivo
   */
  async createExport(
    organizationId: number,
    userId: string,
    input: CreateExportInput
  ): Promise<TimelineExport> {
    // Crear registro de exportación
    const { data: exportRecord, error: insertError } = await supabase
      .from('timeline_exports')
      .insert({
        organization_id: organizationId,
        user_id: userId,
        name: input.name,
        description: input.description,
        filters: input.filters,
        format: input.format,
        status: 'processing',
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError || !exportRecord) {
      console.error('Error creating export record:', insertError);
      throw new Error('No se pudo crear la exportación');
    }

    try {
      // Obtener eventos según filtros
      const result = await timelineService.getEvents(
        organizationId,
        input.filters,
        1,
        10000 // Límite máximo para exportación
      );

      // Generar contenido según formato
      let content: string;
      let mimeType: string;
      let fileExtension: string;

      if (input.format === 'csv') {
        content = this.generateCSV(result.data);
        mimeType = 'text/csv';
        fileExtension = 'csv';
      } else {
        content = JSON.stringify(result.data, null, 2);
        mimeType = 'application/json';
        fileExtension = 'json';
      }

      // Crear Blob y URL de descarga
      const blob = new Blob([content], { type: mimeType });
      const fileSize = blob.size;

      // Actualizar registro con estado completado
      const { data: updatedExport, error: updateError } = await supabase
        .from('timeline_exports')
        .update({
          status: 'completed',
          record_count: result.data.length,
          file_size: fileSize,
          completed_at: new Date().toISOString(),
          metadata: {
            total_available: result.count,
            filters_applied: Object.keys(input.filters).filter(k => input.filters[k as keyof TimelineFilters]),
          },
        })
        .eq('id', exportRecord.id)
        .select()
        .single();

      if (updateError) {
        console.error('Error updating export:', updateError);
      }

      // Descargar archivo automáticamente
      this.downloadBlob(blob, `${input.name}.${fileExtension}`);

      return updatedExport || exportRecord;
    } catch (error) {
      // Marcar como fallida
      await supabase
        .from('timeline_exports')
        .update({
          status: 'failed',
          error_message: error instanceof Error ? error.message : 'Error desconocido',
          completed_at: new Date().toISOString(),
        })
        .eq('id', exportRecord.id);

      throw error;
    }
  }

  /**
   * Duplica una exportación con los mismos filtros
   */
  async duplicateExport(
    organizationId: number,
    userId: string,
    exportId: string
  ): Promise<TimelineExport> {
    const original = await this.getExportById(exportId);
    
    if (!original) {
      throw new Error('Exportación no encontrada');
    }

    return this.createExport(organizationId, userId, {
      name: `${original.name} (copia)`,
      description: original.description,
      filters: original.filters,
      format: original.format,
    });
  }

  /**
   * Actualiza el nombre/descripción de una exportación
   */
  async updateExport(
    exportId: string,
    updates: { name?: string; description?: string }
  ): Promise<TimelineExport | null> {
    const { data, error } = await supabase
      .from('timeline_exports')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', exportId)
      .select()
      .single();

    if (error) {
      console.error('Error updating export:', error);
      throw error;
    }

    return data;
  }

  /**
   * Elimina una exportación
   */
  async deleteExport(exportId: string): Promise<void> {
    const { error } = await supabase
      .from('timeline_exports')
      .delete()
      .eq('id', exportId);

    if (error) {
      console.error('Error deleting export:', error);
      throw error;
    }
  }

  /**
   * Re-ejecuta una exportación
   */
  async rerunExport(
    organizationId: number,
    userId: string,
    exportId: string
  ): Promise<TimelineExport> {
    const original = await this.getExportById(exportId);
    
    if (!original) {
      throw new Error('Exportación no encontrada');
    }

    return this.createExport(organizationId, userId, {
      name: original.name,
      description: original.description,
      filters: original.filters,
      format: original.format,
    });
  }

  /**
   * Genera CSV a partir de eventos
   */
  private generateCSV(events: TimelineEvent[]): string {
    if (events.length === 0) {
      return 'No hay eventos para exportar';
    }

    const headers = [
      'event_id',
      'event_time',
      'source_category',
      'source_table',
      'event_type',
      'action',
      'entity_type',
      'entity_id',
      'actor_id',
      'branch_id',
      'correlation_id',
      'ip_address',
    ];

    const rows = events.map((event) =>
      headers.map((h) => {
        const value = event[h as keyof TimelineEvent];
        if (value === null || value === undefined) return '';
        if (typeof value === 'object') return JSON.stringify(value);
        return String(value).replace(/"/g, '""');
      })
    );

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');

    return csvContent;
  }

  /**
   * Descarga un Blob como archivo
   */
  private downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

const timelineExportsService = new TimelineExportsService();
export default timelineExportsService;
