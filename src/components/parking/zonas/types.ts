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
  spaces_count?: number;
  occupied_count?: number;
}

export interface ZoneFilters {
  search: string;
  is_active: string;
  is_covered: string;
  is_vip: string;
}

export interface ZoneStats {
  total: number;
  active: number;
  inactive: number;
  totalCapacity: number;
  covered: number;
  vip: number;
}
