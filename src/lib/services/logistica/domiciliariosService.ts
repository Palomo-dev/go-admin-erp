/**
 * Domiciliarios (logística Fase 1): listado con su carga del día, alta rápida y candidatos.
 *
 * Recibe el cliente Supabase (navegador para leer; la sesión del servidor para escribir, desde
 * `/api/logistica/domiciliarios`). RLS (migración 20261123165617): leer, quien ve todo en la
 * organización (un domiciliario sin permiso solo ve su fila); escribir, solo con
 * `fn_logistica_gestiona` (= `fn_caja_puede` 'pos.create', el mismo permiso que revisa la ruta).
 * Filtra siempre por organización además de la política.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { filaAlta, type AltaDomiciliario } from '@/lib/logistica/domiciliarios';
import { ESTADOS_EN_RUTA } from '@/lib/logistica/misEnvios';

export interface DomiciliarioFila {
  id: string;
  organization_id: number;
  branch_id: number | null;
  user_id: string | null;
  employment_id: string | null;
  full_name: string | null;
  phone: string | null;
  document_type: string | null;
  document_number: string | null;
  is_external: boolean;
  vehicle_type: string | null;
  license_number: string | null;
  license_expiry: string | null;
  is_active: boolean;
  metadata: Record<string, unknown> | null;
  created_at: string;
  employee?: { first_name?: string | null; last_name?: string | null; phone?: string | null } | null;
}

export interface EnvioCargaFila {
  id: string;
  shipment_number: string;
  driver_id: string;
  status: string;
  delivery_address: string | null;
  delivery_contact_name: string | null;
  delivered_at: string | null;
  cod_amount: number | null;
  cod_status: string | null;
  cod_collected_amount: number | null;
  updated_at: string;
}

const COLUMNAS_DOMICILIARIO =
  'id, organization_id, branch_id, user_id, employment_id, full_name, phone, document_type, document_number, is_external, ' +
  'vehicle_type, license_number, license_expiry, is_active, metadata, created_at, ' +
  'employment:employments!driver_credentials_employment_id_fkey(id, organization_member:organization_members(id, profiles(first_name, last_name, phone)))';

type Perfil = { first_name?: string | null; last_name?: string | null; phone?: string | null };
type FilaCruda = Omit<DomiciliarioFila, 'employee'> & {
  employment?: { organization_member?: { profiles?: Perfil | Perfil[] | null } | null } | null;
};

function aplanar(fila: FilaCruda): DomiciliarioFila {
  const perfiles = fila.employment?.organization_member?.profiles;
  const perfil = Array.isArray(perfiles) ? perfiles[0] : perfiles;
  const { employment: _employment, ...resto } = fila;
  void _employment;
  return { ...resto, employee: perfil ?? null };
}

/** Todos los domiciliarios de la organización (activos e inactivos). */
export async function listarDomiciliarios(client: SupabaseClient, organizationId: number): Promise<DomiciliarioFila[]> {
  const { data, error } = await client
    .from('driver_credentials')
    .select(COLUMNAS_DOMICILIARIO)
    .eq('organization_id', organizationId)
    .order('is_active', { ascending: false })
    .order('full_name', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as unknown as FilaCruda[]).map(aplanar);
}

/**
 * Envíos que hacen la carga del día: los que están en la ruta, las novedades, lo cobrado sin
 * cuadrar y lo tocado desde `desde` (instante de inicio del día en la zona de la organización).
 */
export async function enviosDeCarga(client: SupabaseClient, organizationId: number, desde: string): Promise<EnvioCargaFila[]> {
  const enRuta = [...ESTADOS_EN_RUTA, 'failed_attempt'].join(',');
  const { data, error } = await client
    .from('shipments')
    .select('id, shipment_number, driver_id, status, delivery_address, delivery_contact_name, delivered_at, cod_amount, cod_status, cod_collected_amount, updated_at')
    .eq('organization_id', organizationId)
    .not('driver_id', 'is', null)
    .or(`status.in.(${enRuta}),cod_status.eq.collected,updated_at.gte.${desde}`)
    .order('updated_at', { ascending: false })
    .limit(1000);
  if (error) throw error;
  return (data ?? []) as EnvioCargaFila[];
}

export interface CandidatosAlta {
  empleados: Array<{ employmentId: string; nombre: string; telefono: string | null; branchId: number | null }>;
  miembros: Array<{ userId: string; nombre: string; telefono: string | null }>;
}

/**
 * «Traer desde Recursos humanos»: empleos activos que aún no son domiciliarios; y miembros activos
 * sin domiciliario (para darle «Mis envíos» a un externo que ya tiene cuenta).
 */
export async function candidatosAlta(client: SupabaseClient, organizationId: number): Promise<CandidatosAlta> {
  const [empleos, miembros, existentes] = await Promise.all([
    client
      .from('employments')
      .select('id, branch_id, organization_member:organization_members(id, user_id, profiles(first_name, last_name, phone))')
      .eq('organization_id', organizationId)
      .eq('status', 'active')
      .limit(500),
    client
      .from('organization_members')
      .select('user_id, profiles(first_name, last_name, phone)')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .limit(500),
    client.from('driver_credentials').select('employment_id, user_id').eq('organization_id', organizationId),
  ]);
  if (empleos.error) throw empleos.error;
  if (miembros.error) throw miembros.error;
  if (existentes.error) throw existentes.error;

  const conEmpleo = new Set((existentes.data ?? []).map((d) => d.employment_id).filter(Boolean));
  const conUsuario = new Set((existentes.data ?? []).map((d) => d.user_id).filter(Boolean));
  const nombre = (p: Perfil | null | undefined) => [p?.first_name, p?.last_name].map((s) => (s ?? '').trim()).filter(Boolean).join(' ');
  const uno = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

  type Empleo = { id: string; branch_id: number | null; organization_member?: unknown };
  type Miembro = { user_id: string; profiles?: unknown };

  return {
    empleados: ((empleos.data ?? []) as Empleo[])
      .filter((e) => !conEmpleo.has(e.id))
      .map((e) => {
        const om = uno(e.organization_member as { user_id?: string; profiles?: Perfil | Perfil[] } | null);
        const p = uno(om?.profiles);
        return { employmentId: e.id, nombre: nombre(p), telefono: p?.phone ?? null, branchId: e.branch_id ?? null };
      })
      .filter((e) => e.nombre)
      .sort((a, b) => a.nombre.localeCompare(b.nombre)),
    miembros: ((miembros.data ?? []) as Miembro[])
      .filter((m) => m.user_id && !conUsuario.has(m.user_id))
      .map((m) => {
        const p = uno(m.profiles as Perfil | Perfil[] | null);
        return { userId: m.user_id, nombre: nombre(p), telefono: p?.phone ?? null };
      })
      .filter((m) => m.nombre)
      .sort((a, b) => a.nombre.localeCompare(b.nombre)),
  };
}

export class AltaDomiciliarioError extends Error {
  constructor(public readonly codigo: 'sede' | 'empleo' | 'usuario' | 'duplicado' | 'empleo_ajeno' | 'error', mensaje?: string) {
    super(mensaje ?? codigo);
    this.name = 'AltaDomiciliarioError';
  }
}

/**
 * Alta de un domiciliario con el cliente de la SESIÓN (RLS) y la organización de la sesión.
 * Comprueba que la sede, el empleo y el usuario sean de esa organización antes de escribir.
 */
export async function crearDomiciliario(client: SupabaseClient, organizationId: number, alta: AltaDomiciliario): Promise<DomiciliarioFila> {
  const { data: sede } = await client.from('branches').select('id').eq('id', alta.branchId).eq('organization_id', organizationId).maybeSingle();
  if (!sede) throw new AltaDomiciliarioError('sede');
  if (alta.employmentId) {
    const { data } = await client.from('employments').select('id').eq('id', alta.employmentId).eq('organization_id', organizationId).maybeSingle();
    if (!data) throw new AltaDomiciliarioError('empleo');
  } else if (alta.userId) {
    const { data } = await client
      .from('organization_members')
      .select('user_id')
      .eq('organization_id', organizationId)
      .eq('user_id', alta.userId)
      .eq('is_active', true)
      .maybeSingle();
    if (!data) throw new AltaDomiciliarioError('usuario');
  }

  const { data, error } = await client.from('driver_credentials').insert(filaAlta(alta, organizationId)).select(COLUMNAS_DOMICILIARIO).single();
  if (error) {
    const m = error.message ?? '';
    if (error.code === '23505') throw new AltaDomiciliarioError('duplicado', m);
    if (m.includes('EMPLEO_DE_OTRA_ORGANIZACION')) throw new AltaDomiciliarioError('empleo_ajeno', m);
    throw new AltaDomiciliarioError('error', m);
  }
  return aplanar(data as unknown as FilaCruda);
}

/** Activar o desactivar (no se borra: tiene envíos y cuadres). */
export async function cambiarActivo(client: SupabaseClient, organizationId: number, driverId: string, activo: boolean): Promise<void> {
  const { data, error } = await client
    .from('driver_credentials')
    .update({ is_active: activo })
    .eq('id', driverId)
    .eq('organization_id', organizationId)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new AltaDomiciliarioError('error', 'NO_ENCONTRADO');
}

/**
 * Fin de jornada del domiciliario de la SESIÓN: marca `metadata.fin_jornada_at` (lo que la lista
 * de Domiciliarios muestra como «fuera de turno»). Va por la RPC `logistica_fin_jornada`
 * (migración 20261123165617): la RLS de `driver_credentials` ya no deja que el domiciliario escriba
 * su fila; la RPC solo toca la fila cuyo `user_id` es la sesión y fusiona `metadata`. La hora es la
 * del servidor de base de datos.
 */
export async function marcarFinJornada(client: SupabaseClient, organizationId: number): Promise<{ driverId: string; finJornadaAt: string } | null> {
  const { data, error } = await client.rpc('logistica_fin_jornada', { p_organization_id: organizationId });
  if (error) throw error;
  const r = data as { driver_id?: string; fin_jornada_at?: string } | null;
  if (!r?.driver_id) return null;
  return { driverId: r.driver_id, finJornadaAt: r.fin_jornada_at ?? new Date().toISOString() };
}
