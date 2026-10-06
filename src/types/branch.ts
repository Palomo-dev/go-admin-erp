export interface Branch {
  id?: number;
  organization_id: number;
  name: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  country_code?: string;
  state_code?: string;
  municipality_id?: string;
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
  // Columna nullable: el formulario manda null cuando se vacía (undefined no la tocaría al editar).
  capacity?: number | null;
  // Corrección QA Ronda 2: usar BranchType en vez de string para consistencia.
  // Admite null porque la columna es nullable y el código envía null al
  // normalizar el valor vacío del select.
  branch_type?: BranchType | null;
  zone?: string;
  /**
   * Zona horaria IANA propia de la sucursal (fase A3). `null`/ausente =
   * hereda la de la organización. La cascada efectiva la resuelven
   * `resolveTimezoneForBranch` en el cliente y `fn_timezone_for` en la base.
   */
  timezone?: string | null;
  branch_code: string;
  is_active?: boolean;
  is_web_stock_source?: boolean;

  // --- Identidad Web (Fase 6) ---
  slug?: string;
  subdomain?: string;
  custom_domain?: string;
  website_logo_url?: string;
  website_cover_url?: string;
  is_web_published?: boolean;
}

/**
 * Tipo de negocio del outlet. Determina las secciones disponibles en el
 * editor de branding (Fase 4). Ya existía en la BD pero no se exponía en el UI.
 */
export type BranchType = 'hotel' | 'restaurant' | 'retail' | 'gym' | 'transport' | 'parking' | 'services';

export const BRANCH_TYPES: { value: BranchType; label: string }[] = [
  { value: 'hotel', label: 'Hotel' },
  { value: 'restaurant', label: 'Restaurante' },
  { value: 'retail', label: 'Tienda / Retail' },
  { value: 'gym', label: 'Gimnasio' },
  { value: 'transport', label: 'Transporte' },
  { value: 'parking', label: 'Parqueadero' },
  { value: 'services', label: 'Servicios' },
];

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
  /**
   * Turnos partidos (2 o más, ordenados, sin solapes). Si existe manda sobre open/close, que
   * quedan como apertura del primero y cierre del último. Ver lib/organizacion/horarioSede.ts.
   */
  tramos?: TurnoHorario[];
}

export interface TurnoHorario {
  open: string;
  close: string;
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

export interface BranchFormData extends Omit<Branch, 'opening_hours' | 'features' | 'branch_type'> {
  opening_hours?: string;
  features?: string;
  // El estado inicial del formulario usa '' como valor vacío (option "Sin
  // especificar"). El select hace value={form.branch_type || ''}. Al guardar,
  // si branch_type === '', se trata como null para no persistir un string
  // vacío en la columna branch_type (que es nullable).
  branch_type?: BranchType | '' | null;
}
