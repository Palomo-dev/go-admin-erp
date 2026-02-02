import { supabase } from '@/lib/supabase/config';

export interface ParkingConfig {
  // Horarios de operación
  schedule: {
    monday: { open: string; close: string; enabled: boolean };
    tuesday: { open: string; close: string; enabled: boolean };
    wednesday: { open: string; close: string; enabled: boolean };
    thursday: { open: string; close: string; enabled: boolean };
    friday: { open: string; close: string; enabled: boolean };
    saturday: { open: string; close: string; enabled: boolean };
    sunday: { open: string; close: string; enabled: boolean };
  };
  // Tolerancias y tiempos
  tolerances: {
    grace_period_minutes: number; // Período de gracia al entrar
    exit_grace_minutes: number; // Tiempo extra para salir después de pagar
    max_stay_hours: number; // Máximo tiempo de estancia
    overnight_allowed: boolean; // Permite estancia nocturna
  };
  // Políticas de cobro
  policies: {
    charge_on_entry: boolean; // Cobrar al entrar (prepago)
    charge_on_exit: boolean; // Cobrar al salir
    allow_partial_payment: boolean;
    require_plate_photo: boolean;
    auto_calculate_rate: boolean;
  };
  // Ticket perdido
  lost_ticket: {
    enabled: boolean;
    fixed_fee: number;
    max_hours_fee: number; // Cobrar máximo X horas
    require_id: boolean;
    require_vehicle_proof: boolean;
  };
  // Mensajes personalizados
  messages: {
    welcome_message: string;
    exit_message: string;
    ticket_footer: string;
    receipt_footer: string;
    lost_ticket_notice: string;
  };
  // Configuración de impresión
  printing: {
    print_entry_ticket: boolean;
    print_exit_receipt: boolean;
    ticket_copies: number;
    receipt_copies: number;
    include_qr_code: boolean;
  };
  // Alertas y notificaciones
  alerts: {
    notify_when_full: boolean;
    full_capacity_threshold: number; // Porcentaje para alertar
    notify_long_stay: boolean;
    long_stay_hours: number;
    notify_unpaid_exit: boolean;
  };
}

const DEFAULT_CONFIG: ParkingConfig = {
  schedule: {
    monday: { open: '06:00', close: '22:00', enabled: true },
    tuesday: { open: '06:00', close: '22:00', enabled: true },
    wednesday: { open: '06:00', close: '22:00', enabled: true },
    thursday: { open: '06:00', close: '22:00', enabled: true },
    friday: { open: '06:00', close: '22:00', enabled: true },
    saturday: { open: '07:00', close: '20:00', enabled: true },
    sunday: { open: '08:00', close: '18:00', enabled: false },
  },
  tolerances: {
    grace_period_minutes: 15,
    exit_grace_minutes: 10,
    max_stay_hours: 24,
    overnight_allowed: false,
  },
  policies: {
    charge_on_entry: false,
    charge_on_exit: true,
    allow_partial_payment: false,
    require_plate_photo: false,
    auto_calculate_rate: true,
  },
  lost_ticket: {
    enabled: true,
    fixed_fee: 50000,
    max_hours_fee: 12,
    require_id: true,
    require_vehicle_proof: true,
  },
  messages: {
    welcome_message: '¡Bienvenido! Su ticket es válido por {max_hours} horas.',
    exit_message: 'Gracias por su visita. ¡Vuelva pronto!',
    ticket_footer: 'Conserve su ticket. No nos hacemos responsables por pérdida o daños.',
    receipt_footer: 'Gracias por preferirnos.',
    lost_ticket_notice: 'En caso de pérdida del ticket, se cobrará tarifa especial.',
  },
  printing: {
    print_entry_ticket: true,
    print_exit_receipt: true,
    ticket_copies: 1,
    receipt_copies: 1,
    include_qr_code: true,
  },
  alerts: {
    notify_when_full: true,
    full_capacity_threshold: 90,
    notify_long_stay: true,
    long_stay_hours: 8,
    notify_unpaid_exit: true,
  },
};

const CONFIG_KEY = 'parking_config';

class ParkingConfigService {
  /**
   * Obtener configuración del parqueadero
   */
  async getConfig(organizationId: number): Promise<ParkingConfig> {
    try {
      const { data, error } = await supabase
        .from('organization_settings')
        .select('settings')
        .eq('organization_id', organizationId)
        .eq('key', CONFIG_KEY)
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      if (data?.settings) {
        // Merge con defaults para asegurar que todos los campos existan
        return this.mergeWithDefaults(data.settings as Partial<ParkingConfig>);
      }

      return DEFAULT_CONFIG;
    } catch (error) {
      console.error('Error obteniendo configuración:', error);
      return DEFAULT_CONFIG;
    }
  }

  /**
   * Guardar configuración del parqueadero
   */
  async saveConfig(organizationId: number, config: ParkingConfig): Promise<void> {
    try {
      // Verificar si existe
      const { data: existing } = await supabase
        .from('organization_settings')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('key', CONFIG_KEY)
        .single();

      if (existing) {
        // Actualizar
        const { error } = await supabase
          .from('organization_settings')
          .update({
            settings: config,
            updated_at: new Date().toISOString(),
          })
          .eq('organization_id', organizationId)
          .eq('key', CONFIG_KEY);

        if (error) throw error;
      } else {
        // Insertar
        const { error } = await supabase.from('organization_settings').insert({
          organization_id: organizationId,
          key: CONFIG_KEY,
          settings: config,
        });

        if (error) throw error;
      }
    } catch (error) {
      console.error('Error guardando configuración:', error);
      throw error;
    }
  }

  /**
   * Actualizar sección específica de la configuración
   */
  async updateSection<K extends keyof ParkingConfig>(
    organizationId: number,
    section: K,
    data: ParkingConfig[K]
  ): Promise<void> {
    const currentConfig = await this.getConfig(organizationId);
    const updatedConfig = {
      ...currentConfig,
      [section]: data,
    };
    await this.saveConfig(organizationId, updatedConfig);
  }

  /**
   * Restablecer configuración a valores por defecto
   */
  async resetToDefaults(organizationId: number): Promise<ParkingConfig> {
    await this.saveConfig(organizationId, DEFAULT_CONFIG);
    return DEFAULT_CONFIG;
  }

  /**
   * Obtener configuración por defecto
   */
  getDefaultConfig(): ParkingConfig {
    return { ...DEFAULT_CONFIG };
  }

  /**
   * Merge configuración parcial con defaults
   */
  private mergeWithDefaults(partial: Partial<ParkingConfig>): ParkingConfig {
    return {
      schedule: { ...DEFAULT_CONFIG.schedule, ...partial.schedule },
      tolerances: { ...DEFAULT_CONFIG.tolerances, ...partial.tolerances },
      policies: { ...DEFAULT_CONFIG.policies, ...partial.policies },
      lost_ticket: { ...DEFAULT_CONFIG.lost_ticket, ...partial.lost_ticket },
      messages: { ...DEFAULT_CONFIG.messages, ...partial.messages },
      printing: { ...DEFAULT_CONFIG.printing, ...partial.printing },
      alerts: { ...DEFAULT_CONFIG.alerts, ...partial.alerts },
    };
  }
}

const parkingConfigService = new ParkingConfigService();
export default parkingConfigService;
