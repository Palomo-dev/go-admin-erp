import { createSupabaseClient } from '@/lib/supabase/config';

const createClient = () => createSupabaseClient();

export interface RotationDayPattern {
  day: number;
  shift_template_id: string | null;
  is_off: boolean;
}

export interface ShiftRotation {
  id: string;
  organization_id: number;
  name: string;
  description: string | null;
  cycle_days: number;
  pattern: RotationDayPattern[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateShiftRotationDTO {
  name: string;
  description?: string;
  cycle_days: number;
  pattern: RotationDayPattern[];
  is_active?: boolean;
}

export interface UpdateShiftRotationDTO {
  name?: string;
  description?: string | null;
  cycle_days?: number;
  pattern?: RotationDayPattern[];
  is_active?: boolean;
}

export class ShiftRotationsService {
  private organizationId: number;

  constructor(organizationId: number) {
    this.organizationId = organizationId;
  }

  async getAll(includeInactive = false): Promise<ShiftRotation[]> {
    const supabase = createClient();

    let query = supabase
      .from('shift_rotations')
      .select('*')
      .eq('organization_id', this.organizationId)
      .order('name');

    if (!includeInactive) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;
    if (error) throw error;

    return (data || []).map((r) => ({
      ...r,
      pattern: Array.isArray(r.pattern) ? r.pattern : [],
    }));
  }

  async getById(id: string): Promise<ShiftRotation | null> {
    const supabase = createClient();

    const { data, error } = await supabase
      .from('shift_rotations')
      .select('*')
      .eq('id', id)
      .eq('organization_id', this.organizationId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }

    return {
      ...data,
      pattern: Array.isArray(data.pattern) ? data.pattern : [],
    };
  }

  async create(dto: CreateShiftRotationDTO): Promise<ShiftRotation> {
    const supabase = createClient();

    const { data, error } = await supabase
      .from('shift_rotations')
      .insert({
        organization_id: this.organizationId,
        name: dto.name,
        description: dto.description || null,
        cycle_days: dto.cycle_days,
        pattern: dto.pattern,
        is_active: dto.is_active ?? true,
      })
      .select()
      .single();

    if (error) throw error;
    return {
      ...data,
      pattern: Array.isArray(data.pattern) ? data.pattern : [],
    };
  }

  async update(id: string, dto: UpdateShiftRotationDTO): Promise<ShiftRotation> {
    const supabase = createClient();

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.cycle_days !== undefined) updateData.cycle_days = dto.cycle_days;
    if (dto.pattern !== undefined) updateData.pattern = dto.pattern;
    if (dto.is_active !== undefined) updateData.is_active = dto.is_active;

    const { data, error } = await supabase
      .from('shift_rotations')
      .update(updateData)
      .eq('id', id)
      .eq('organization_id', this.organizationId)
      .select()
      .single();

    if (error) throw error;
    return {
      ...data,
      pattern: Array.isArray(data.pattern) ? data.pattern : [],
    };
  }

  async toggleActive(id: string): Promise<ShiftRotation> {
    const rotation = await this.getById(id);
    if (!rotation) throw new Error('Rotación no encontrada');

    return this.update(id, { is_active: !rotation.is_active });
  }

  async duplicate(id: string, newName?: string): Promise<ShiftRotation> {
    const original = await this.getById(id);
    if (!original) throw new Error('Rotación no encontrada');

    return this.create({
      name: newName || `${original.name} (Copia)`,
      description: original.description || undefined,
      cycle_days: original.cycle_days,
      pattern: original.pattern,
      is_active: true,
    });
  }

  async delete(id: string): Promise<void> {
    const supabase = createClient();

    const { error } = await supabase
      .from('shift_rotations')
      .delete()
      .eq('id', id)
      .eq('organization_id', this.organizationId);

    if (error) throw error;
  }

  async getStats(): Promise<{ total: number; active: number; inactive: number }> {
    const all = await this.getAll(true);
    return {
      total: all.length,
      active: all.filter((r) => r.is_active).length,
      inactive: all.filter((r) => !r.is_active).length,
    };
  }

  // Generate a simple rotation pattern
  static generatePattern(
    cycleDays: number,
    workDays: number,
    shiftTemplateId: string
  ): RotationDayPattern[] {
    const pattern: RotationDayPattern[] = [];
    for (let i = 0; i < cycleDays; i++) {
      pattern.push({
        day: i + 1,
        shift_template_id: i < workDays ? shiftTemplateId : null,
        is_off: i >= workDays,
      });
    }
    return pattern;
  }

  // Common rotation patterns
  static getPresetPatterns(): { name: string; cycleDays: number; workDays: number; description: string }[] {
    return [
      { name: '5x2', cycleDays: 7, workDays: 5, description: '5 días trabajo, 2 días libres' },
      { name: '4x4', cycleDays: 8, workDays: 4, description: '4 días trabajo, 4 días libres' },
      { name: '6x1', cycleDays: 7, workDays: 6, description: '6 días trabajo, 1 día libre' },
      { name: '4x3', cycleDays: 7, workDays: 4, description: '4 días trabajo, 3 días libres' },
      { name: '2x2', cycleDays: 4, workDays: 2, description: '2 días trabajo, 2 días libres' },
      { name: '3x3', cycleDays: 6, workDays: 3, description: '3 días trabajo, 3 días libres' },
    ];
  }
}

export default ShiftRotationsService;
