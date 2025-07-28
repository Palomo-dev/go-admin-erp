export interface Branch {
  id?: number;
  organization_id: number;
  name: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postal_code?: string;
  latitude?: number;
  longitude?: number;
  phone?: string;
  email?: string;
  manager_id?: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
  is_main?: boolean;
  tax_identification?: string;
  opening_hours?: OpeningHours;
  features?: BranchFeatures;
  capacity?: number;
  branch_type?: string;
  zone?: string;
  branch_code: string;
  is_active?: boolean;
}

export interface OpeningHours {
  monday?: DayHours;
  tuesday?: DayHours;
  wednesday?: DayHours;
  thursday?: DayHours;
  friday?: DayHours;
  saturday?: DayHours;
  sunday?: DayHours;
}

export interface DayHours {
  open: string;
  close: string;
  closed: boolean;
}

export interface BranchFeatures {
  has_wifi?: boolean;
  has_parking?: boolean;
  has_delivery?: boolean;
  has_outdoor_seating?: boolean;
  is_wheelchair_accessible?: boolean;
  has_air_conditioning?: boolean;
  [key: string]: boolean | undefined;
}

export interface BranchFormData extends Omit<Branch, 'opening_hours' | 'features'> {
  opening_hours?: string;
  features?: string;
}
