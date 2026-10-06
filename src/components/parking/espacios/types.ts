import type { EstadoEspacioBD, TipoEspacioBD } from '@/lib/services/parkingValores';

/** Enum `parking_space_type` (ver parkingValores.ts). */
export type SpaceType = TipoEspacioBD;
/** Enum `parking_space_state` (ver parkingValores.ts). */
export type SpaceState = EstadoEspacioBD;

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
  byType: Partial<Record<SpaceType, number>>;
  byZone: Record<string, { total: number; occupied: number }>;
}
