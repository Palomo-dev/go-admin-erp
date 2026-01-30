import { supabase } from '@/lib/supabase/config';

export interface PMSSettings {
  checkinTime: string;
  checkoutTime: string;
  defaultCurrency: string;
  timezone: string;
  autoConfirmReservations: boolean;
  requireDeposit: boolean;
  depositPercentage: number;
  cancellationPolicyDays: number;
  overbookingAllowed: boolean;
  overbookingPercentage: number;
  sendConfirmationEmail: boolean;
  sendReminderEmail: boolean;
  reminderDaysBefore: number;
  allowEarlyCheckin: boolean;
  allowLateCheckout: boolean;
  earlyCheckinFee: number;
  lateCheckoutFee: number;
  housekeepingAutoAssign: boolean;
  maintenanceAlertEmail: string;
}

export interface TaxTemplate {
  id: string;
  name: string;
  rate: number;
  isDefault: boolean;
}

const defaultSettings: PMSSettings = {
  checkinTime: '15:00',
  checkoutTime: '11:00',
  defaultCurrency: 'COP',
  timezone: 'America/Bogota',
  autoConfirmReservations: false,
  requireDeposit: true,
  depositPercentage: 30,
  cancellationPolicyDays: 3,
  overbookingAllowed: false,
  overbookingPercentage: 0,
  sendConfirmationEmail: true,
  sendReminderEmail: true,
  reminderDaysBefore: 1,
  allowEarlyCheckin: true,
  allowLateCheckout: true,
  earlyCheckinFee: 0,
  lateCheckoutFee: 0,
  housekeepingAutoAssign: false,
  maintenanceAlertEmail: '',
};

class PMSSettingsService {
  private settingsKey = 'pms_settings';

  async getSettings(organizationId: number): Promise<PMSSettings> {
    try {
      const { data, error } = await supabase
        .from('organization_settings')
        .select('settings')
        .eq('organization_id', organizationId)
        .eq('key', this.settingsKey)
        .maybeSingle();

      if (error) {
        console.error('Error fetching PMS settings:', error);
        return defaultSettings;
      }

      if (data?.settings) {
        return { ...defaultSettings, ...data.settings };
      }

      return defaultSettings;
    } catch (error) {
      console.error('Error in getSettings:', error);
      return defaultSettings;
    }
  }

  async saveSettings(organizationId: number, settings: Partial<PMSSettings>): Promise<void> {
    const currentSettings = await this.getSettings(organizationId);
    const newSettings = { ...currentSettings, ...settings };

    const { error } = await supabase
      .from('organization_settings')
      .upsert({
        organization_id: organizationId,
        key: this.settingsKey,
        settings: newSettings,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'organization_id,key',
      });

    if (error) {
      console.error('Error saving PMS settings:', error);
      throw error;
    }
  }

  async getTaxes(organizationId: number): Promise<TaxTemplate[]> {
    const { data, error } = await supabase
      .from('taxes')
      .select('id, name, rate, is_default')
      .eq('organization_id', organizationId)
      .order('name');

    if (error) {
      console.error('Error fetching taxes:', error);
      return [];
    }

    return (data || []).map((t: any) => ({
      id: t.id,
      name: t.name,
      rate: t.rate,
      isDefault: t.is_default,
    }));
  }

  async getChannels(organizationId: number): Promise<{ id: string; name: string; code: string }[]> {
    const { data, error } = await supabase
      .from('reservation_channels')
      .select('id, name, code')
      .eq('organization_id', organizationId)
      .order('name');

    if (error) {
      console.error('Error fetching channels:', error);
      return [];
    }

    return data || [];
  }

  getTimezones(): { value: string; label: string }[] {
    return [
      { value: 'America/Bogota', label: 'Bogotá (GMT-5)' },
      { value: 'America/Mexico_City', label: 'Ciudad de México (GMT-6)' },
      { value: 'America/Lima', label: 'Lima (GMT-5)' },
      { value: 'America/Buenos_Aires', label: 'Buenos Aires (GMT-3)' },
      { value: 'America/Santiago', label: 'Santiago (GMT-4)' },
      { value: 'America/Sao_Paulo', label: 'São Paulo (GMT-3)' },
      { value: 'America/New_York', label: 'Nueva York (GMT-5)' },
      { value: 'America/Los_Angeles', label: 'Los Ángeles (GMT-8)' },
      { value: 'Europe/Madrid', label: 'Madrid (GMT+1)' },
      { value: 'Europe/London', label: 'Londres (GMT+0)' },
    ];
  }

  getCurrencies(): { value: string; label: string }[] {
    return [
      { value: 'COP', label: 'Peso Colombiano (COP)' },
      { value: 'USD', label: 'Dólar Estadounidense (USD)' },
      { value: 'EUR', label: 'Euro (EUR)' },
      { value: 'MXN', label: 'Peso Mexicano (MXN)' },
      { value: 'PEN', label: 'Sol Peruano (PEN)' },
      { value: 'ARS', label: 'Peso Argentino (ARS)' },
      { value: 'CLP', label: 'Peso Chileno (CLP)' },
      { value: 'BRL', label: 'Real Brasileño (BRL)' },
    ];
  }
}

export default new PMSSettingsService();
