import { createSupabaseClient } from '@/lib/supabase/config';

const createClient = () => createSupabaseClient();

export interface GeoFence {
  lat: number;
  lng: number;
  radius: number; // meters
}

export interface TimeClock {
  id: string;
  organization_id: number;
  branch_id: number | null;
  code: string | null;
  name: string;
  type: string; // 'qr' | 'geo' | 'biometric' | 'nfc' | 'manual'
  location_description: string | null;
  geo_fence: GeoFence | null;
  require_geo_validation: boolean;
  settings: Record<string, unknown>;
  current_qr_token: string | null;
  qr_token_expires_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Joined
  branch_name?: string;
}

export interface CreateTimeClockDTO {
  code?: string;
  name: string;
  type: string;
  branch_id?: number;
  location_description?: string;
  geo_fence?: GeoFence;
  require_geo_validation?: boolean;
  settings?: Record<string, unknown>;
  is_active?: boolean;
}

export interface UpdateTimeClockDTO {
  code?: string | null;
  name?: string;
  type?: string;
  branch_id?: number | null;
  location_description?: string | null;
  geo_fence?: GeoFence | null;
  require_geo_validation?: boolean;
  settings?: Record<string, unknown>;
  is_active?: boolean;
}

export class TimeClocksService {
  private organizationId: number;

  constructor(organizationId: number) {
    this.organizationId = organizationId;
  }

  async getAll(includeInactive = false): Promise<TimeClock[]> {
    const supabase = createClient();

    let query = supabase
      .from('time_clocks')
      .select(`
        *,
        branches(id, name)
      `)
      .eq('organization_id', this.organizationId)
      .order('name');

    if (!includeInactive) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;
    if (error) throw error;

    return (data || []).map((item: any) => ({
      ...item,
      branch_name: item.branches?.name || null,
    }));
  }

  async getById(id: string): Promise<TimeClock | null> {
    const supabase = createClient();

    const { data, error } = await supabase
      .from('time_clocks')
      .select(`
        *,
        branches(id, name)
      `)
      .eq('id', id)
      .eq('organization_id', this.organizationId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }

    return {
      ...data,
      branch_name: data.branches?.name || null,
    };
  }

  async create(dto: CreateTimeClockDTO): Promise<TimeClock> {
    const supabase = createClient();

    const { data, error } = await supabase
      .from('time_clocks')
      .insert({
        organization_id: this.organizationId,
        code: dto.code || null,
        name: dto.name,
        type: dto.type,
        branch_id: dto.branch_id || null,
        location_description: dto.location_description || null,
        geo_fence: dto.geo_fence || null,
        require_geo_validation: dto.require_geo_validation ?? false,
        settings: dto.settings || {},
        is_active: dto.is_active ?? true,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async update(id: string, dto: UpdateTimeClockDTO): Promise<TimeClock> {
    const supabase = createClient();

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (dto.code !== undefined) updateData.code = dto.code;
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.type !== undefined) updateData.type = dto.type;
    if (dto.branch_id !== undefined) updateData.branch_id = dto.branch_id;
    if (dto.location_description !== undefined) updateData.location_description = dto.location_description;
    if (dto.geo_fence !== undefined) updateData.geo_fence = dto.geo_fence;
    if (dto.require_geo_validation !== undefined) updateData.require_geo_validation = dto.require_geo_validation;
    if (dto.settings !== undefined) updateData.settings = dto.settings;
    if (dto.is_active !== undefined) updateData.is_active = dto.is_active;

    const { data, error } = await supabase
      .from('time_clocks')
      .update(updateData)
      .eq('id', id)
      .eq('organization_id', this.organizationId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async toggleActive(id: string): Promise<TimeClock> {
    const device = await this.getById(id);
    if (!device) throw new Error('Dispositivo no encontrado');

    return this.update(id, { is_active: !device.is_active });
  }

  async duplicate(id: string, newName?: string): Promise<TimeClock> {
    const original = await this.getById(id);
    if (!original) throw new Error('Dispositivo no encontrado');

    return this.create({
      code: original.code ? `${original.code}-COPY` : undefined,
      name: newName || `${original.name} (Copia)`,
      type: original.type,
      branch_id: original.branch_id || undefined,
      location_description: original.location_description || undefined,
      geo_fence: original.geo_fence || undefined,
      require_geo_validation: original.require_geo_validation,
      settings: original.settings,
      is_active: true,
    });
  }

  async delete(id: string): Promise<void> {
    const supabase = createClient();

    const { error } = await supabase
      .from('time_clocks')
      .delete()
      .eq('id', id)
      .eq('organization_id', this.organizationId);

    if (error) throw error;
  }

  async regenerateQrToken(id: string): Promise<TimeClock> {
    const supabase = createClient();

    // Generate a random token
    const token = `QR-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 5); // 5 minutes expiry

    const { data, error } = await supabase
      .from('time_clocks')
      .update({
        current_qr_token: token,
        qr_token_expires_at: expiresAt.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('organization_id', this.organizationId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async validateCode(code: string, excludeId?: string): Promise<boolean> {
    const supabase = createClient();

    let query = supabase
      .from('time_clocks')
      .select('id')
      .eq('organization_id', this.organizationId)
      .eq('code', code);

    if (excludeId) {
      query = query.neq('id', excludeId);
    }

    const { data, error } = await query;
    if (error) throw error;

    return !data || data.length === 0;
  }

  async getStats(): Promise<{ total: number; active: number; inactive: number; byType: Record<string, number> }> {
    const all = await this.getAll(true);

    const byType: Record<string, number> = {};
    all.forEach((d) => {
      byType[d.type] = (byType[d.type] || 0) + 1;
    });

    return {
      total: all.length,
      active: all.filter((d) => d.is_active).length,
      inactive: all.filter((d) => !d.is_active).length,
      byType,
    };
  }

  async getBranches(): Promise<{ id: number; name: string }[]> {
    const supabase = createClient();

    const { data, error } = await supabase
      .from('branches')
      .select('id, name')
      .eq('organization_id', this.organizationId)
      .eq('is_active', true)
      .order('name');

    if (error) throw error;
    return data || [];
  }

  // Import devices
  async importDevices(
    data: CreateTimeClockDTO[]
  ): Promise<{ success: number; errors: { row: number; message: string }[] }> {
    const errors: { row: number; message: string }[] = [];
    let success = 0;

    for (let i = 0; i < data.length; i++) {
      try {
        await this.create(data[i]);
        success++;
      } catch (err: any) {
        errors.push({ row: i + 1, message: err.message || 'Error al crear dispositivo' });
      }
    }

    return { success, errors };
  }
}

export default TimeClocksService;
