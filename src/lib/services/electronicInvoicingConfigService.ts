/**
 * Servicio de configuración de facturación electrónica por organización
 */

import { supabase } from '@/lib/supabase/config';

export interface ElectronicInvoicingConfig {
  id: string;
  organization_id: number;
  provider: string;
  environment: 'sandbox' | 'production';
  client_id: string | null;
  client_secret: string | null;
  username: string | null;
  password: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

class ElectronicInvoicingConfigService {
  async getConfig(organizationId: number): Promise<ElectronicInvoicingConfig | null> {
    const { data, error } = await supabase
      .from('electronic_invoicing_config')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error getting e-invoicing config:', error);
    }
    return data;
  }

  async saveConfig(config: Partial<ElectronicInvoicingConfig> & { organization_id: number }): Promise<{ success: boolean; error?: string }> {
    const { error } = await supabase
      .from('electronic_invoicing_config')
      .upsert({
        organization_id: config.organization_id,
        provider: config.provider || 'factus',
        environment: config.environment || 'sandbox',
        client_id: config.client_id,
        client_secret: config.client_secret,
        username: config.username,
        password: config.password,
        is_active: config.is_active ?? true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'organization_id,provider' });

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  }

  async testConnection(organizationId: number): Promise<{ success: boolean; message: string }> {
    const config = await this.getConfig(organizationId);
    if (!config || !config.client_id || !config.client_secret || !config.username || !config.password) {
      return { success: false, message: 'Credenciales incompletas' };
    }

    try {
      const response = await fetch('/api/factus/auth', { method: 'POST' });
      if (response.ok) {
        return { success: true, message: 'Conexión exitosa con Factus' };
      }
      const data = await response.json();
      return { success: false, message: data.error || 'Error de conexión' };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }
}

export const electronicInvoicingConfigService = new ElectronicInvoicingConfigService();
