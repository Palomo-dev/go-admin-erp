/**
 * Catálogo común › Conductores y domiciliarios: lectura de `driver_credentials` de la organización
 * con su empleo, su cargo de Recursos humanos y su perfil.
 *
 * `transportService.getDrivers` solo devuelve personas con empleo (filtra en el navegador por
 * `employments.organization_members`), así que los domiciliarios externos de Logística no salían.
 * Aquí se filtra por `driver_credentials.organization_id` (columna NOT NULL que completa el
 * trigger `trg_driver_credentials_completar`) y RLS decide qué filas ve la sesión.
 *
 * Las escrituras siguen siendo las de `transportService` (crear, editar, activar, eliminar): esta
 * función solo lee. `credencial` devuelve cada fila con la forma de `DriverCredential` para que los
 * diálogos de siempre (editar, estado, historial, asignar) la reciban sin cambios.
 *
 * Columnas y FK verificadas con el MCP de Supabase (2026-11-24): `driver_credentials_employment_id_fkey`
 * y `employments_position_id_fkey` → `job_positions.name` (el CARGO, nunca un rol).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DriverCredential } from '@/lib/services/transportService';

type Perfil = { id?: string | null; first_name?: string | null; last_name?: string | null; email?: string | null; phone?: string | null };
type Uno<T> = T | T[] | null | undefined;

interface FilaCruda {
  id: string;
  organization_id: number;
  branch_id: number | null;
  user_id: string | null;
  employment_id: string | null;
  full_name: string | null;
  phone: string | null;
  document_type: string | null;
  document_number: string | null;
  is_external: boolean | null;
  vehicle_type: string | null;
  license_number: string | null;
  license_category: string | null;
  license_expiry: string | null;
  license_restrictions: string | null;
  medical_certificate_expiry: string | null;
  hazmat_certified: boolean | null;
  passenger_certified: boolean | null;
  is_active: boolean | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  blood_type?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  employment?: Uno<{
    id: string;
    hire_date?: string | null;
    position?: Uno<{ name: string | null }>;
    organization_member?: Uno<{ id: number; organization_id: number; user_id: string | null; profiles?: Uno<Perfil> }>;
  }>;
}

/** `DriverCredential` con las columnas que el tipo del servicio no declara (están en la tabla). */
export type CredencialCatalogo = DriverCredential & {
  user_id: string | null;
  full_name: string | null;
  document_number: string | null;
  is_external: boolean;
  organization_id: number;
  branch_id: number | null;
};

export interface PersonaCatalogo {
  id: string;
  userId: string | null;
  employmentId: string | null;
  nombre: string;
  documentoTipo: string | null;
  documento: string | null;
  telefono: string | null;
  externo: boolean;
  /** Cargo de Recursos humanos (`job_positions.name`); null si no tiene empleo o cargo. */
  cargo: string | null;
  tipoVehiculo: string | null;
  licenciaNumero: string | null;
  licenciaCategoria: string | null;
  licenciaVence: string | null;
  examenVence: string | null;
  activo: boolean;
  sedeId: number | null;
  /** Ficha de la persona (columnas de `driver_credentials` y `employments.hire_date`, `date`). */
  restricciones: string | null;
  certificadoPasajeros: boolean;
  mercanciasPeligrosas: boolean;
  sangre: string | null;
  emergenciaNombre: string | null;
  emergenciaTelefono: string | null;
  vinculadoDesde: string | null;
  credencial: CredencialCatalogo;
}

const COLUMNAS =
  'id, organization_id, branch_id, user_id, employment_id, full_name, phone, document_type, document_number, is_external, vehicle_type, ' +
  'license_number, license_category, license_expiry, license_restrictions, medical_certificate_expiry, hazmat_certified, passenger_certified, ' +
  'is_active, metadata, created_at, updated_at, blood_type, emergency_contact_name, emergency_contact_phone, ' +
  'employment:employments!driver_credentials_employment_id_fkey(id, hire_date, position:job_positions!employments_position_id_fkey(name), ' +
  'organization_member:organization_members(id, organization_id, user_id, profiles(id, first_name, last_name, email, phone)))';

const uno = <T,>(v: Uno<T>): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

/** Pura: convierte una fila cruda de PostgREST en la persona del catálogo. */
export function aPersona(f: FilaCruda): PersonaCatalogo {
  const empleo = uno(f.employment);
  const miembro = uno(empleo?.organization_member);
  const perfil = uno(miembro?.profiles);
  const nombrePerfil = perfil ? `${perfil.first_name ?? ''} ${perfil.last_name ?? ''}`.trim() : '';
  const nombre = f.full_name?.trim() || nombrePerfil;
  const userId = f.user_id ?? miembro?.user_id ?? null;
  const credencial: CredencialCatalogo = {
    id: f.id,
    employment_id: f.employment_id ?? '',
    license_number: f.license_number ?? '',
    license_category: f.license_category ?? '',
    license_expiry: f.license_expiry ?? '',
    license_restrictions: f.license_restrictions ?? undefined,
    medical_certificate_expiry: f.medical_certificate_expiry ?? undefined,
    hazmat_certified: f.hazmat_certified ?? false,
    passenger_certified: f.passenger_certified ?? false,
    is_active: f.is_active ?? true,
    metadata: f.metadata ?? {},
    created_at: f.created_at,
    updated_at: f.updated_at,
    user_id: userId,
    full_name: f.full_name,
    document_number: f.document_number,
    is_external: f.is_external === true,
    organization_id: f.organization_id,
    branch_id: f.branch_id,
    // Los diálogos de siempre leen el nombre del perfil: sin empleo se arma con `full_name`.
    employments: {
      id: empleo?.id ?? '',
      organization_members: {
        id: miembro?.id ?? 0,
        organization_id: miembro?.organization_id ?? f.organization_id,
        profiles: {
          id: perfil?.id ?? '',
          first_name: perfil ? perfil.first_name ?? '' : nombre,
          last_name: perfil ? perfil.last_name ?? '' : '',
          email: perfil?.email ?? '',
          phone: perfil?.phone ?? f.phone ?? undefined,
        },
      },
    },
  };
  return {
    id: f.id,
    userId,
    employmentId: f.employment_id,
    nombre,
    documentoTipo: f.document_type,
    documento: f.document_number,
    telefono: f.phone ?? perfil?.phone ?? null,
    externo: f.is_external === true || !f.employment_id,
    cargo: uno(empleo?.position)?.name?.trim() || null,
    tipoVehiculo: f.vehicle_type,
    licenciaNumero: f.license_number,
    licenciaCategoria: f.license_category,
    licenciaVence: f.license_expiry,
    examenVence: f.medical_certificate_expiry,
    activo: f.is_active !== false,
    sedeId: f.branch_id,
    restricciones: f.license_restrictions?.trim() || null,
    certificadoPasajeros: f.passenger_certified === true,
    mercanciasPeligrosas: f.hazmat_certified === true,
    sangre: f.blood_type?.trim() || null,
    emergenciaNombre: f.emergency_contact_name?.trim() || null,
    emergenciaTelefono: f.emergency_contact_phone?.trim() || null,
    vinculadoDesde: empleo?.hire_date ?? null,
    credencial,
  };
}

/** Todas las personas (conductores y domiciliarios, activas e inactivas) de la organización. */
export async function listarPersonasCatalogo(db: SupabaseClient, organizationId: number): Promise<PersonaCatalogo[]> {
  const { data, error } = await db
    .from('driver_credentials')
    .select(COLUMNAS)
    .eq('organization_id', organizationId)
    .order('full_name', { ascending: true })
    .limit(2000);
  if (error) throw error;
  return ((data ?? []) as unknown as FilaCruda[]).map(aPersona);
}

/**
 * Una persona del catálogo (ficha de detalle). Filtra por la organización de la sesión además de
 * RLS: un id de otra organización responde `null`, igual que uno que no existe.
 */
export async function obtenerPersonaCatalogo(db: SupabaseClient, organizationId: number, id: string): Promise<PersonaCatalogo | null> {
  const { data, error } = await db.from('driver_credentials').select(COLUMNAS).eq('organization_id', organizationId).eq('id', id).maybeSingle();
  // 22P02: el id de la URL no es un uuid → no existe.
  if (error) {
    if (error.code === '22P02') return null;
    throw error;
  }
  return data ? aPersona(data as unknown as FilaCruda) : null;
}
