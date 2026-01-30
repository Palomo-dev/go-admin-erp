import { supabase } from '@/lib/supabase/config';

export interface ShippingRate {
  id: string;
  organization_id: number;
  carrier_id?: string;
  rate_name: string;
  rate_code?: string;
  origin_zone?: string;
  destination_zone?: string;
  origin_city?: string;
  destination_city?: string;
  service_level?: string;
  calculation_method: 'weight' | 'volume' | 'dimensional' | 'flat';
  base_rate: number;
  rate_per_kg: number;
  rate_per_m3: number;
  dimensional_factor: number;
  min_weight_kg?: number;
  max_weight_kg?: number;
  min_charge: number;
  fuel_surcharge_percent: number;
  insurance_percent: number;
  currency: string;
  valid_from?: string;
  valid_until?: string;
  is_active: boolean;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ShippingRateWithCarrier extends ShippingRate {
  transport_carriers?: {
    id: string;
    name: string;
    code: string;
    carrier_type: string;
    service_type: string;
  };
}

export interface TransportCarrier {
  id: string;
  organization_id: number;
  name: string;
  code: string;
  carrier_type: 'own_fleet' | 'external' | 'partner';
  service_type: 'passenger' | 'cargo' | 'both';
  api_provider?: string;
  tracking_url_template?: string;
  contact_name?: string;
  contact_phone?: string;
  contact_email?: string;
  is_active: boolean;
}

export interface CreateShippingRateData {
  organization_id: number;
  carrier_id?: string;
  rate_name: string;
  rate_code?: string;
  origin_zone?: string;
  destination_zone?: string;
  origin_city?: string;
  destination_city?: string;
  service_level?: string;
  calculation_method?: string;
  base_rate?: number;
  rate_per_kg?: number;
  rate_per_m3?: number;
  dimensional_factor?: number;
  min_weight_kg?: number;
  max_weight_kg?: number;
  min_charge?: number;
  fuel_surcharge_percent?: number;
  insurance_percent?: number;
  currency?: string;
  valid_from?: string;
  valid_until?: string;
  is_active?: boolean;
}

export interface ShippingRateFilters {
  search?: string;
  carrier_id?: string;
  service_level?: string;
  is_active?: boolean;
  origin_city?: string;
  destination_city?: string;
}

export interface SimulateShippingParams {
  origin_city?: string;
  destination_city?: string;
  weight_kg: number;
  length_cm?: number;
  width_cm?: number;
  height_cm?: number;
  declared_value?: number;
  carrier_id?: string;
  service_level?: string;
}

export interface SimulatedRate {
  rate: ShippingRateWithCarrier;
  base_cost: number;
  weight_cost: number;
  volume_cost: number;
  fuel_surcharge: number;
  insurance_cost: number;
  total_cost: number;
  billable_weight: number;
  calculation_details: string;
}

class ShippingRatesService {
  /**
   * Obtiene tarifas de envío con filtros opcionales
   */
  async getShippingRates(
    organizationId: number,
    filters?: ShippingRateFilters
  ): Promise<ShippingRateWithCarrier[]> {
    let query = supabase
      .from('shipping_rates')
      .select(`
        *,
        transport_carriers (
          id,
          name,
          code,
          carrier_type,
          service_type
        )
      `)
      .eq('organization_id', organizationId)
      .order('rate_name', { ascending: true });

    if (filters?.carrier_id) {
      query = query.eq('carrier_id', filters.carrier_id);
    }
    if (filters?.service_level) {
      query = query.eq('service_level', filters.service_level);
    }
    if (filters?.is_active !== undefined) {
      query = query.eq('is_active', filters.is_active);
    }
    if (filters?.origin_city) {
      query = query.ilike('origin_city', `%${filters.origin_city}%`);
    }
    if (filters?.destination_city) {
      query = query.ilike('destination_city', `%${filters.destination_city}%`);
    }
    if (filters?.search) {
      query = query.or(`rate_name.ilike.%${filters.search}%,rate_code.ilike.%${filters.search}%`);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  }

  /**
   * Obtiene una tarifa por ID
   */
  async getShippingRateById(rateId: string): Promise<ShippingRateWithCarrier | null> {
    const { data, error } = await supabase
      .from('shipping_rates')
      .select(`
        *,
        transport_carriers (
          id,
          name,
          code,
          carrier_type,
          service_type
        )
      `)
      .eq('id', rateId)
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Crea una nueva tarifa
   */
  async createShippingRate(data: CreateShippingRateData): Promise<ShippingRate> {
    const { data: newRate, error } = await supabase
      .from('shipping_rates')
      .insert({
        ...data,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;
    return newRate;
  }

  /**
   * Actualiza una tarifa existente
   */
  async updateShippingRate(
    rateId: string,
    updates: Partial<CreateShippingRateData>
  ): Promise<ShippingRate> {
    const { data, error } = await supabase
      .from('shipping_rates')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', rateId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Elimina una tarifa
   */
  async deleteShippingRate(rateId: string): Promise<void> {
    const { error } = await supabase
      .from('shipping_rates')
      .delete()
      .eq('id', rateId);

    if (error) throw error;
  }

  /**
   * Duplica una tarifa
   */
  async duplicateShippingRate(rateId: string): Promise<ShippingRate> {
    const original = await this.getShippingRateById(rateId);
    if (!original) throw new Error('Tarifa no encontrada');

    const { id, created_at, updated_at, transport_carriers, ...rateData } = original;

    return this.createShippingRate({
      ...rateData,
      rate_name: `${rateData.rate_name} (Copia)`,
      rate_code: rateData.rate_code ? `${rateData.rate_code}_COPY` : undefined,
      is_active: false,
    });
  }

  /**
   * Activa/Desactiva una tarifa
   */
  async toggleActive(rateId: string, isActive: boolean): Promise<ShippingRate> {
    return this.updateShippingRate(rateId, { is_active: isActive });
  }

  /**
   * Obtiene transportadores activos
   */
  async getCarriers(organizationId: number): Promise<TransportCarrier[]> {
    const { data, error } = await supabase
      .from('transport_carriers')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  /**
   * Importa tarifas desde CSV
   */
  async importRates(
    organizationId: number,
    rates: Partial<CreateShippingRateData>[]
  ): Promise<{ success: number; errors: string[] }> {
    const results = { success: 0, errors: [] as string[] };

    for (let i = 0; i < rates.length; i++) {
      const rate = rates[i];
      try {
        if (!rate.rate_name) {
          results.errors.push(`Fila ${i + 1}: Nombre de tarifa requerido`);
          continue;
        }

        await this.createShippingRate({
          ...rate,
          organization_id: organizationId,
          rate_name: rate.rate_name,
        });
        results.success++;
      } catch (error) {
        results.errors.push(`Fila ${i + 1}: ${error instanceof Error ? error.message : 'Error desconocido'}`);
      }
    }

    return results;
  }

  /**
   * Simula el cálculo de tarifa para un envío
   */
  async simulateShipping(
    organizationId: number,
    params: SimulateShippingParams
  ): Promise<SimulatedRate[]> {
    // Obtener tarifas aplicables
    const filters: ShippingRateFilters = {
      is_active: true,
    };
    
    if (params.carrier_id) filters.carrier_id = params.carrier_id;
    if (params.origin_city) filters.origin_city = params.origin_city;
    if (params.destination_city) filters.destination_city = params.destination_city;

    const rates = await this.getShippingRates(organizationId, filters);

    // Calcular para cada tarifa aplicable
    const results: SimulatedRate[] = [];

    for (const rate of rates) {
      // Filtrar por nivel de servicio si se especifica
      if (params.service_level && rate.service_level !== params.service_level) continue;

      // Filtrar por rango de peso
      if (rate.min_weight_kg && params.weight_kg < rate.min_weight_kg) continue;
      if (rate.max_weight_kg && params.weight_kg > rate.max_weight_kg) continue;

      // Calcular peso volumétrico
      let volumetricWeight = 0;
      if (params.length_cm && params.width_cm && params.height_cm) {
        volumetricWeight = (params.length_cm * params.width_cm * params.height_cm) / (rate.dimensional_factor || 5000);
      }

      // Determinar peso facturable
      const billableWeight = Math.max(params.weight_kg, volumetricWeight);

      // Calcular costos
      let baseCost = rate.base_rate || 0;
      let weightCost = 0;
      let volumeCost = 0;
      let details = '';

      switch (rate.calculation_method) {
        case 'weight':
          weightCost = billableWeight * (rate.rate_per_kg || 0);
          details = `Cálculo por peso: ${billableWeight.toFixed(2)} kg × $${rate.rate_per_kg}`;
          break;
        case 'volume':
          if (params.length_cm && params.width_cm && params.height_cm) {
            const m3 = (params.length_cm * params.width_cm * params.height_cm) / 1000000;
            volumeCost = m3 * (rate.rate_per_m3 || 0);
            details = `Cálculo por volumen: ${m3.toFixed(4)} m³ × $${rate.rate_per_m3}`;
          }
          break;
        case 'dimensional':
          weightCost = billableWeight * (rate.rate_per_kg || 0);
          details = `Peso volumétrico: ${volumetricWeight.toFixed(2)} kg, Peso real: ${params.weight_kg} kg, Facturable: ${billableWeight.toFixed(2)} kg`;
          break;
        case 'flat':
          details = 'Tarifa fija';
          break;
        default:
          weightCost = billableWeight * (rate.rate_per_kg || 0);
          details = `Por peso: ${billableWeight.toFixed(2)} kg`;
      }

      const subtotal = baseCost + weightCost + volumeCost;
      const fuelSurcharge = subtotal * ((rate.fuel_surcharge_percent || 0) / 100);
      const insuranceCost = (params.declared_value || 0) * ((rate.insurance_percent || 0) / 100);

      let totalCost = subtotal + fuelSurcharge + insuranceCost;

      // Aplicar cargo mínimo
      if (rate.min_charge && totalCost < rate.min_charge) {
        totalCost = rate.min_charge;
        details += ' (Cargo mínimo aplicado)';
      }

      results.push({
        rate,
        base_cost: baseCost,
        weight_cost: weightCost,
        volume_cost: volumeCost,
        fuel_surcharge: fuelSurcharge,
        insurance_cost: insuranceCost,
        total_cost: totalCost,
        billable_weight: billableWeight,
        calculation_details: details,
      });
    }

    // Ordenar por precio total
    return results.sort((a, b) => a.total_cost - b.total_cost);
  }

  /**
   * Obtiene ciudades únicas para autocompletado
   */
  async getUniqueCities(organizationId: number): Promise<{ origins: string[]; destinations: string[] }> {
    const { data, error } = await supabase
      .from('shipping_rates')
      .select('origin_city, destination_city')
      .eq('organization_id', organizationId);

    if (error) throw error;

    const origins = Array.from(new Set((data || []).map(r => r.origin_city).filter(Boolean))) as string[];
    const destinations = Array.from(new Set((data || []).map(r => r.destination_city).filter(Boolean))) as string[];

    return { origins, destinations };
  }

  /**
   * Obtiene niveles de servicio únicos
   */
  async getServiceLevels(organizationId: number): Promise<string[]> {
    const { data, error } = await supabase
      .from('shipping_rates')
      .select('service_level')
      .eq('organization_id', organizationId)
      .not('service_level', 'is', null);

    if (error) throw error;

    return Array.from(new Set((data || []).map(r => r.service_level).filter(Boolean))) as string[];
  }
}

export const shippingRatesService = new ShippingRatesService();
