'use client';

import { supabase } from '@/lib/supabase/config';
import { getOrganizationId, getCurrentBranchId } from '@/lib/hooks/useOrganization';

// ==================== TIPOS ====================

export interface GymAccessDevice {
  id: string;
  branch_id: number;
  device_name: string;
  device_type: 'turnstile' | 'scanner' | 'tablet' | 'kiosk' | 'door_lock';
  serial_number?: string;
  location_description?: string;
  ip_address?: string;
  is_active: boolean;
  last_sync_at?: string;
  configuration: {
    qr_enabled?: boolean;
    fingerprint_enabled?: boolean;
    face_enabled?: boolean;
    auto_open?: boolean;
    access_timeout_seconds?: number;
    display_mode?: 'qr' | 'info' | 'checkin';
  };
  current_qr_token?: string;
  qr_token_expires_at?: string;
  created_at: string;
  updated_at: string;
  branches?: {
    id: number;
    name: string;
  };
}

export interface CustomerBiometric {
  id: string;
  customer_id: string;
  organization_id: number;
  biometric_type: 'fingerprint' | 'face';
  finger_index?: number;
  template_data: string;
  template_format: string;
  enrolled_device_id?: string;
  quality_score?: number;
  is_active: boolean;
  enrolled_at: string;
  last_used_at?: string;
  created_at: string;
  updated_at: string;
  customers?: {
    id: string;
    first_name: string;
    last_name: string;
  };
}

export interface CreateDeviceData {
  branch_id: number;
  device_name: string;
  device_type: GymAccessDevice['device_type'];
  serial_number?: string;
  location_description?: string;
  ip_address?: string;
  configuration?: GymAccessDevice['configuration'];
}

export interface UpdateDeviceData {
  device_name?: string;
  device_type?: GymAccessDevice['device_type'];
  serial_number?: string;
  location_description?: string;
  ip_address?: string;
  is_active?: boolean;
  configuration?: GymAccessDevice['configuration'];
}

// ==================== SERVICIO ====================

export class GymDevicesService {
  private organizationId: number;

  constructor(organizationId?: number) {
    this.organizationId = organizationId || getOrganizationId() || 0;
  }

  // ==================== DISPOSITIVOS ====================

  async getDevices(branchId?: number): Promise<GymAccessDevice[]> {
    if (!this.organizationId) return [];

    let query = supabase
      .from('gym_access_devices')
      .select(`
        *,
        branches (id, name)
      `)
      .order('device_name');

    if (branchId) {
      query = query.eq('branch_id', branchId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching devices:', error.message);
      return [];
    }

    return (data || []) as unknown as GymAccessDevice[];
  }

  async getDeviceById(deviceId: string): Promise<GymAccessDevice | null> {
    const { data, error } = await supabase
      .from('gym_access_devices')
      .select(`
        *,
        branches (id, name)
      `)
      .eq('id', deviceId)
      .single();

    if (error) {
      console.error('Error fetching device:', error.message);
      return null;
    }

    return data as unknown as GymAccessDevice;
  }

  async createDevice(deviceData: CreateDeviceData): Promise<GymAccessDevice | null> {
    const { data, error } = await supabase
      .from('gym_access_devices')
      .insert({
        ...deviceData,
        configuration: deviceData.configuration || {},
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating device:', error.message);
      throw new Error(error.message);
    }

    return data as unknown as GymAccessDevice;
  }

  async updateDevice(deviceId: string, updates: UpdateDeviceData): Promise<GymAccessDevice | null> {
    const { data, error } = await supabase
      .from('gym_access_devices')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', deviceId)
      .select()
      .single();

    if (error) {
      console.error('Error updating device:', error.message);
      throw new Error(error.message);
    }

    return data as unknown as GymAccessDevice;
  }

  async deleteDevice(deviceId: string): Promise<boolean> {
    const { error } = await supabase
      .from('gym_access_devices')
      .delete()
      .eq('id', deviceId);

    if (error) {
      console.error('Error deleting device:', error.message);
      return false;
    }

    return true;
  }

  async toggleDeviceStatus(deviceId: string, isActive: boolean): Promise<boolean> {
    const { error } = await supabase
      .from('gym_access_devices')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('id', deviceId);

    if (error) {
      console.error('Error toggling device status:', error.message);
      return false;
    }

    return true;
  }

  // ==================== QR TOKEN ====================

  async generateQRToken(deviceId: string): Promise<{ token: string; expires_at: string } | null> {
    const token = this.generateSecureToken();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutos

    const { error } = await supabase
      .from('gym_access_devices')
      .update({
        current_qr_token: token,
        qr_token_expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq('id', deviceId);

    if (error) {
      console.error('Error generating QR token:', error.message);
      return null;
    }

    return { token, expires_at: expiresAt };
  }

  private generateSecureToken(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let token = '';
    for (let i = 0; i < 32; i++) {
      token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return token;
  }

  // ==================== BIOMETRÍA ====================

  async getCustomerBiometrics(customerId: string): Promise<CustomerBiometric[]> {
    const { data, error } = await supabase
      .from('customer_biometrics')
      .select('*')
      .eq('customer_id', customerId)
      .eq('is_active', true)
      .order('biometric_type', { ascending: true });

    if (error) {
      console.error('Error fetching biometrics:', error.message);
      return [];
    }

    return (data || []) as CustomerBiometric[];
  }

  async enrollFingerprint(
    customerId: string,
    fingerIndex: number,
    templateData: string,
    deviceId?: string,
    qualityScore?: number
  ): Promise<CustomerBiometric | null> {
    if (!this.organizationId) return null;

    const { data, error } = await supabase
      .from('customer_biometrics')
      .upsert({
        customer_id: customerId,
        organization_id: this.organizationId,
        biometric_type: 'fingerprint',
        finger_index: fingerIndex,
        template_data: templateData,
        template_format: 'base64',
        enrolled_device_id: deviceId,
        quality_score: qualityScore,
        is_active: true,
        enrolled_at: new Date().toISOString(),
      }, {
        onConflict: 'customer_id,biometric_type,finger_index',
      })
      .select()
      .single();

    if (error) {
      console.error('Error enrolling fingerprint:', error.message);
      throw new Error(error.message);
    }

    return data as CustomerBiometric;
  }

  async verifyFingerprint(templateData: string): Promise<{ customerId: string; fingerIndex: number } | null> {
    if (!this.organizationId) return null;

    // NOTA: En producción, esto debería usar un algoritmo de matching del SDK del lector
    // Por ahora, hacemos una búsqueda exacta (solo para demo)
    const { data, error } = await supabase
      .from('customer_biometrics')
      .select('customer_id, finger_index')
      .eq('organization_id', this.organizationId)
      .eq('biometric_type', 'fingerprint')
      .eq('template_data', templateData)
      .eq('is_active', true)
      .single();

    if (error || !data) {
      return null;
    }

    // Actualizar último uso
    await supabase
      .from('customer_biometrics')
      .update({ last_used_at: new Date().toISOString() })
      .eq('customer_id', data.customer_id)
      .eq('biometric_type', 'fingerprint')
      .eq('finger_index', data.finger_index);

    return {
      customerId: data.customer_id,
      fingerIndex: data.finger_index,
    };
  }

  async deleteBiometric(biometricId: string): Promise<boolean> {
    const { error } = await supabase
      .from('customer_biometrics')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', biometricId);

    if (error) {
      console.error('Error deleting biometric:', error.message);
      return false;
    }

    return true;
  }

  async getBiometricsStats(): Promise<{ total: number; fingerprints: number; faces: number }> {
    if (!this.organizationId) return { total: 0, fingerprints: 0, faces: 0 };

    const { data, error } = await supabase
      .from('customer_biometrics')
      .select('biometric_type')
      .eq('organization_id', this.organizationId)
      .eq('is_active', true);

    if (error || !data) {
      return { total: 0, fingerprints: 0, faces: 0 };
    }

    const fingerprints = data.filter(b => b.biometric_type === 'fingerprint').length;
    const faces = data.filter(b => b.biometric_type === 'face').length;

    return {
      total: data.length,
      fingerprints,
      faces,
    };
  }
}

// Instancia singleton para uso directo
export const gymDevicesService = new GymDevicesService();
