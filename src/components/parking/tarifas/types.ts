export type RateUnit = 'minute' | 'hour' | 'day';
export type VehicleType = 'car' | 'motorcycle' | 'truck' | 'bicycle';

export interface ParkingRate {
  id: string;
  organization_id: number;
  vehicle_type: VehicleType;
  rate_name: string;
  unit: RateUnit;
  price: number;
  grace_period_min: number;
  is_active?: boolean;
  lost_ticket_fee?: number;
  created_at: string;
  updated_at: string;
}

export interface RateFilters {
  search: string;
  vehicle_type: string;
  unit: string;
  is_active: string;
}

export interface RateStats {
  total: number;
  active: number;
  inactive: number;
  byVehicleType: Record<VehicleType, number>;
  byUnit: Record<RateUnit, number>;
}
