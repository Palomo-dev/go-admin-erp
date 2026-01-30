import { createSupabaseClient } from '@/lib/supabase/config';

const createClient = () => createSupabaseClient();

export interface ShiftTemplate {
  id: string;
  organization_id: number;
  code: string | null;
  name: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  paid_break: boolean;
  is_night_shift: boolean;
  is_split_shift: boolean;
  color: string | null;
  overtime_multiplier: number;
  night_multiplier: number;
  is_active: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CreateShiftTemplateDTO {
  code?: string;
  name: string;
  start_time: string;
  end_time: string;
  break_minutes?: number;
  paid_break?: boolean;
  is_night_shift?: boolean;
  is_split_shift?: boolean;
  color?: string;
  overtime_multiplier?: number;
  night_multiplier?: number;
  is_active?: boolean;
  metadata?: Record<string, unknown>;
}

export interface UpdateShiftTemplateDTO {
  code?: string | null;
  name?: string;
  start_time?: string;
  end_time?: string;
  break_minutes?: number;
  paid_break?: boolean;
  is_night_shift?: boolean;
  is_split_shift?: boolean;
  color?: string | null;
  overtime_multiplier?: number;
  night_multiplier?: number;
  is_active?: boolean;
  metadata?: Record<string, unknown>;
}

export class ShiftTemplatesService {
  private organizationId: number;

  constructor(organizationId: number) {
    this.organizationId = organizationId;
  }

  async getAll(includeInactive = false): Promise<ShiftTemplate[]> {
    const supabase = createClient();

    let query = supabase
      .from('shift_templates')
      .select('*')
      .eq('organization_id', this.organizationId)
      .order('name');

    if (!includeInactive) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  async getById(id: string): Promise<ShiftTemplate | null> {
    const supabase = createClient();

    const { data, error } = await supabase
      .from('shift_templates')
      .select('*')
      .eq('id', id)
      .eq('organization_id', this.organizationId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }

    return data;
  }

  async create(dto: CreateShiftTemplateDTO): Promise<ShiftTemplate> {
    const supabase = createClient();

    const { data, error } = await supabase
      .from('shift_templates')
      .insert({
        organization_id: this.organizationId,
        code: dto.code || null,
        name: dto.name,
        start_time: dto.start_time,
        end_time: dto.end_time,
        break_minutes: dto.break_minutes ?? 0,
        paid_break: dto.paid_break ?? false,
        is_night_shift: dto.is_night_shift ?? false,
        is_split_shift: dto.is_split_shift ?? false,
        color: dto.color || null,
        overtime_multiplier: dto.overtime_multiplier ?? 1.25,
        night_multiplier: dto.night_multiplier ?? 1.35,
        is_active: dto.is_active ?? true,
        metadata: dto.metadata || {},
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async update(id: string, dto: UpdateShiftTemplateDTO): Promise<ShiftTemplate> {
    const supabase = createClient();

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (dto.code !== undefined) updateData.code = dto.code;
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.start_time !== undefined) updateData.start_time = dto.start_time;
    if (dto.end_time !== undefined) updateData.end_time = dto.end_time;
    if (dto.break_minutes !== undefined) updateData.break_minutes = dto.break_minutes;
    if (dto.paid_break !== undefined) updateData.paid_break = dto.paid_break;
    if (dto.is_night_shift !== undefined) updateData.is_night_shift = dto.is_night_shift;
    if (dto.is_split_shift !== undefined) updateData.is_split_shift = dto.is_split_shift;
    if (dto.color !== undefined) updateData.color = dto.color;
    if (dto.overtime_multiplier !== undefined) updateData.overtime_multiplier = dto.overtime_multiplier;
    if (dto.night_multiplier !== undefined) updateData.night_multiplier = dto.night_multiplier;
    if (dto.is_active !== undefined) updateData.is_active = dto.is_active;
    if (dto.metadata !== undefined) updateData.metadata = dto.metadata;

    const { data, error } = await supabase
      .from('shift_templates')
      .update(updateData)
      .eq('id', id)
      .eq('organization_id', this.organizationId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async toggleActive(id: string): Promise<ShiftTemplate> {
    const template = await this.getById(id);
    if (!template) throw new Error('Plantilla no encontrada');

    return this.update(id, { is_active: !template.is_active });
  }

  async duplicate(id: string, newName?: string): Promise<ShiftTemplate> {
    const original = await this.getById(id);
    if (!original) throw new Error('Plantilla no encontrada');

    return this.create({
      code: original.code ? `${original.code}-COPY` : undefined,
      name: newName || `${original.name} (Copia)`,
      start_time: original.start_time,
      end_time: original.end_time,
      break_minutes: original.break_minutes,
      paid_break: original.paid_break,
      is_night_shift: original.is_night_shift,
      is_split_shift: original.is_split_shift,
      color: original.color || undefined,
      overtime_multiplier: original.overtime_multiplier,
      night_multiplier: original.night_multiplier,
      is_active: true,
      metadata: original.metadata,
    });
  }

  async delete(id: string): Promise<void> {
    const supabase = createClient();

    const { error } = await supabase
      .from('shift_templates')
      .delete()
      .eq('id', id)
      .eq('organization_id', this.organizationId);

    if (error) throw error;
  }

  async validateCode(code: string, excludeId?: string): Promise<boolean> {
    const supabase = createClient();

    let query = supabase
      .from('shift_templates')
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

  async getStats(): Promise<{ total: number; active: number; inactive: number; nightShifts: number }> {
    const all = await this.getAll(true);
    return {
      total: all.length,
      active: all.filter((t) => t.is_active).length,
      inactive: all.filter((t) => !t.is_active).length,
      nightShifts: all.filter((t) => t.is_night_shift).length,
    };
  }

  async importTemplates(
    data: CreateShiftTemplateDTO[]
  ): Promise<{ success: number; errors: { row: number; message: string }[] }> {
    const errors: { row: number; message: string }[] = [];
    let success = 0;

    for (let i = 0; i < data.length; i++) {
      try {
        await this.create(data[i]);
        success++;
      } catch (err: any) {
        errors.push({ row: i + 1, message: err.message || 'Error al crear plantilla' });
      }
    }

    return { success, errors };
  }
}

export default ShiftTemplatesService;
