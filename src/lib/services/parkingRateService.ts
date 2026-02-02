import { supabase } from '@/lib/supabase/config';

export type RateUnit = 'minute' | 'hour' | 'day';

export interface ParkingRate {
  id: string;
  organization_id: number;
  vehicle_type: string;
  rate_name: string;
  unit: RateUnit;
  price: number;
  grace_period_min?: number;
  is_active?: boolean;
  lost_ticket_fee?: number;
  created_at: string;
  updated_at: string;
}

export interface CalculatedFee {
  rate: ParkingRate | null;
  duration_minutes: number;
  billable_minutes: number;
  amount: number;
  breakdown: string;
}

class ParkingRateService {
  /**
   * Obtener tarifas activas de una organización
   */
  async getActiveRates(organizationId: number): Promise<ParkingRate[]> {
    try {
      const { data, error } = await supabase
        .from('parking_rates')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .order('vehicle_type', { ascending: true });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error obteniendo tarifas:', error);
      throw error;
    }
  }

  /**
   * Obtener tarifa por tipo de vehículo
   */
  async getRateByVehicleType(
    organizationId: number,
    vehicleType: string
  ): Promise<ParkingRate | null> {
    try {
      const { data, error } = await supabase
        .from('parking_rates')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('vehicle_type', vehicleType)
        .eq('is_active', true)
        .order('created_at', { ascending: true })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data || null;
    } catch (error) {
      console.error('Error obteniendo tarifa:', error);
      return null;
    }
  }

  /**
   * Calcular tarifa basada en duración y tipo de vehículo
   */
  calculateFee(
    rate: ParkingRate | null,
    entryTime: Date,
    exitTime: Date = new Date()
  ): CalculatedFee {
    if (!rate) {
      const durationMs = exitTime.getTime() - entryTime.getTime();
      const durationMinutes = Math.ceil(durationMs / 60000);
      return {
        rate: null,
        duration_minutes: durationMinutes,
        billable_minutes: durationMinutes,
        amount: 0,
        breakdown: 'Sin tarifa configurada',
      };
    }

    const durationMs = exitTime.getTime() - entryTime.getTime();
    const durationMinutes = Math.ceil(durationMs / 60000);

    // Aplicar período de gracia
    const gracePeriod = rate.grace_period_min || 0;
    const billableMinutes = Math.max(0, durationMinutes - gracePeriod);

    let amount = 0;
    let breakdown = '';

    switch (rate.unit) {
      case 'minute':
        amount = billableMinutes * rate.price;
        breakdown = `${billableMinutes} min × $${rate.price.toLocaleString()}/min`;
        break;

      case 'hour':
        const hours = Math.ceil(billableMinutes / 60);
        amount = hours * rate.price;
        breakdown = `${hours} hora(s) × $${rate.price.toLocaleString()}/hora`;
        break;

      case 'day':
        const days = Math.ceil(billableMinutes / 1440); // 1440 min = 1 día
        amount = days * rate.price;
        breakdown = `${days} día(s) × $${rate.price.toLocaleString()}/día`;
        break;
    }

    if (gracePeriod > 0 && durationMinutes <= gracePeriod) {
      breakdown = `Dentro del período de gracia (${gracePeriod} min)`;
      amount = 0;
    }

    return {
      rate,
      duration_minutes: durationMinutes,
      billable_minutes: billableMinutes,
      amount: Math.round(amount),
      breakdown,
    };
  }

  /**
   * Formatear duración en texto legible
   */
  formatDuration(minutes: number): string {
    if (minutes < 60) {
      return `${minutes} min`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours < 24) {
      return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
    }
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
  }
}

const parkingRateService = new ParkingRateService();
export default parkingRateService;
