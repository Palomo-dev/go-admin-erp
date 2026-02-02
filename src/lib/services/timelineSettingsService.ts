import { supabase } from '@/lib/supabase/config';

export interface TimelineSettings {
  // Privacidad
  showFullPayload: boolean;
  hideSensitiveData: boolean;
  maskActorNames: boolean;
  
  // Fuentes visibles
  visibleSources: string[];
  defaultSourceFilter: string | null;
  
  // Retención (informativo)
  retentionDays: number;
  archiveOldEvents: boolean;
  
  // Performance
  defaultDateRangeDays: number;
  maxExportRecords: number;
  enableRealTimeUpdates: boolean;
  
  // UI
  defaultPageSize: number;
  compactView: boolean;
  showCorrelationLinks: boolean;
}

const DEFAULT_SETTINGS: TimelineSettings = {
  showFullPayload: true,
  hideSensitiveData: true,
  maskActorNames: false,
  visibleSources: [],
  defaultSourceFilter: null,
  retentionDays: 365,
  archiveOldEvents: false,
  defaultDateRangeDays: 7,
  maxExportRecords: 10000,
  enableRealTimeUpdates: false,
  defaultPageSize: 50,
  compactView: false,
  showCorrelationLinks: true,
};

const ALL_SOURCES = [
  'ops_audit_log',
  'finance_audit_log',
  'products_audit_log',
  'chat_audit_logs',
  'roles_audit_log',
  'transport_events',
  'integration_events',
  'electronic_invoicing_events',
  'membership_events',
  'attendance_events',
  'message_events',
];

class TimelineSettingsService {
  /**
   * Obtiene la configuración del timeline para una organización
   */
  async getSettings(organizationId: number): Promise<TimelineSettings> {
    try {
      const { data, error } = await supabase
        .from('organization_settings')
        .select('settings')
        .eq('organization_id', organizationId)
        .eq('key', 'timeline')
        .single();

      if (error || !data) {
        return { ...DEFAULT_SETTINGS, visibleSources: ALL_SOURCES };
      }

      const timelineSettings = (data.settings || {}) as Partial<TimelineSettings>;

      return {
        ...DEFAULT_SETTINGS,
        visibleSources: ALL_SOURCES,
        ...timelineSettings,
      };
    } catch (error) {
      console.error('Error fetching timeline settings:', error);
      return { ...DEFAULT_SETTINGS, visibleSources: ALL_SOURCES };
    }
  }

  /**
   * Guarda la configuración del timeline
   */
  async saveSettings(
    organizationId: number,
    settings: Partial<TimelineSettings>
  ): Promise<void> {
    try {
      // Primero obtener settings actuales
      const { data: existing } = await supabase
        .from('organization_settings')
        .select('id, settings')
        .eq('organization_id', organizationId)
        .eq('key', 'timeline')
        .single();

      const currentSettings = (existing?.settings || {}) as Partial<TimelineSettings>;
      const updatedSettings = {
        ...currentSettings,
        ...settings,
        updatedAt: new Date().toISOString(),
      };

      if (existing?.id) {
        // Update existente
        const { error } = await supabase
          .from('organization_settings')
          .update({
            settings: updatedSettings,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);

        if (error) throw error;
      } else {
        // Insert nuevo
        const { error } = await supabase
          .from('organization_settings')
          .insert({
            id: crypto.randomUUID(),
            organization_id: organizationId,
            key: 'timeline',
            settings: updatedSettings,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });

        if (error) throw error;
      }
    } catch (error) {
      console.error('Error saving timeline settings:', error);
      throw error;
    }
  }

  /**
   * Restablece la configuración a valores por defecto
   */
  async resetSettings(organizationId: number): Promise<TimelineSettings> {
    const defaultWithSources = { ...DEFAULT_SETTINGS, visibleSources: ALL_SOURCES };
    await this.saveSettings(organizationId, defaultWithSources);
    return defaultWithSources;
  }

  /**
   * Obtiene las fuentes disponibles
   */
  getAvailableSources(): string[] {
    return ALL_SOURCES;
  }

  /**
   * Obtiene los valores por defecto
   */
  getDefaultSettings(): TimelineSettings {
    return { ...DEFAULT_SETTINGS, visibleSources: ALL_SOURCES };
  }
}

const timelineSettingsService = new TimelineSettingsService();
export default timelineSettingsService;
