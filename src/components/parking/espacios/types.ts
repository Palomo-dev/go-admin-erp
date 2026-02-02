export type SpaceType = 'car' | 'motorcycle' | 'truck' | 'bicycle';
export type SpaceState = 'free' | 'occupied' | 'reserved' | 'maintenance' | 'disabled';

export interface ParkingZone {
  id: string;
  branch_id: number;
  name: string;
  description: string | null;
  capacity: number;
  rate_multiplier: number;
  is_covered: boolean;
  is_vip: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ParkingSpace {
  id: string;
  branch_id: number;
  label: string;
  zone: string | null;
  type: SpaceType;
  state: SpaceState;
  zone_id: string | null;
  created_at: string;
  updated_at: string;
  parking_zones?: ParkingZone | null;
}

export interface SpaceFilters {
  search: string;
  zone_id: string;
  type: string;
  state: string;
}

export interface SpaceStats {
  total: number;
  free: number;
  occupied: number;
  reserved: number;
  maintenance: number;
  byType: Record<SpaceType, number>;
  byZone: Record<string, { total: number; occupied: number }>;
}
