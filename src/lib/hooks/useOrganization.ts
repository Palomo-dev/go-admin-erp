'use client';

import { useState, useEffect } from 'react';
import { supabase } from "../supabase/config";

// Constante para el almacenamiento local de la organización
const STORAGE_KEY = 'organizacionActiva';

// Interfaz para la organización almacenada localmente
export type Organizacion = {
  id: number;
  name?: string;
  slug?: string;
  logo_url?: string;
  subdomain?: string;
};

/**
 * Guarda la organización activa en localStorage y sessionStorage como respaldo
 */
export function guardarOrganizacionActiva(organizacion: Organizacion): void {
  try {
    // Verificar si la organización ya está guardada para evitar logs innecesarios
    const existingData = localStorage.getItem(STORAGE_KEY);
    const isAlreadySaved = existingData && JSON.parse(existingData)?.id === organizacion.id;
    
    // Guardar en localStorage como fuente principal
    localStorage.setItem(STORAGE_KEY, JSON.stringify(organizacion));
    
    // Guardar en sessionStorage como respaldo
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(organizacion));
    
    // Solo hacer log si es una organización nueva o diferente
    if (!isAlreadySaved) {
      console.log('Organización guardada correctamente:', organizacion.id);
    }
  } catch (error) {
    console.error('Error al guardar organización:', error);
  }
}

/**
 * Obtiene la organización activa de forma robusta
 * Intenta recuperarla de múltiples fuentes para mayor resiliencia
 */
export function obtenerOrganizacionActiva(): Organizacion {
  if (typeof window === 'undefined') {
    return { id: 0 }; // SSR — sin acceso a storage
  }
  
  try {
    // 1. Fuente principal: clave JSON
    const localData = localStorage.getItem(STORAGE_KEY);
    if (localData) {
      const parsed = JSON.parse(localData);
      if (parsed?.id) return parsed;
    }
    
    // 2. Respaldo: sessionStorage
    const sessionData = sessionStorage.getItem(STORAGE_KEY);
    if (sessionData) {
      const parsed = JSON.parse(sessionData);
      if (parsed?.id) return parsed;
    }
    
    // 3. Respaldo: clave simple del OrganizationSelector
    const simpleId = localStorage.getItem('currentOrganizationId');
    if (simpleId) {
      const id = parseInt(simpleId, 10);
      if (!isNaN(id) && id > 0) {
        const org: Organizacion = { id };
        guardarOrganizacionActiva(org);
        return org;
      }
    }
    
    // 4. Claves alternativas (migración)
    const alternativas = ['currentOrganization', 'activeOrganization', 'organizacion'];
    for (const key of alternativas) {
      const altData = localStorage.getItem(key);
      if (altData) {
        const parsed = JSON.parse(altData);
        if (parsed?.id) {
          guardarOrganizacionActiva(parsed);
          return parsed;
        }
      }
    }
    
    // Sin organización guardada — devolver id:0 para que los consumidores lo manejen
    return { id: 0 };
  } catch (error) {
    console.error('Error al recuperar organización:', error);
    return { id: 0 };
  }
}

/**
 * Para uso en componentes: obtiene la organización y proporciona el organization_id
 * Se recomienda usar este método siempre para obtener el ID de organización
 */
export function getOrganizationId(): number {
  const organizacion = obtenerOrganizacionActiva();
  return organizacion?.id || 0;
}

/**
 * Obtiene el nombre de la organización activa
 * @returns Nombre de la organización o un valor predeterminado
 */
export function getOrganizationName(): string {
  const organizacion = obtenerOrganizacionActiva();
  return organizacion?.name || 'Organización por defecto';
}

// Interfaces para tipos base de datos
interface DbBranch {
  id: number;
  name: string;
  address?: string;
  is_main?: boolean;
  created_at?: string;
  organization_id: number;
  [key: string]: any; // Para otros campos adicionales
}

interface DbOrganization {
  id: number;
  name: string;
  created_at?: string;
  [key: string]: any;
}

interface DbOrganizationMember {
  id: number;
  organization_id: number;
  user_id: string;
  role?: string;
  is_active: boolean;
  role_id?: number;
}

// Interfaces para la respuesta formateada
interface FormattedBranch {
  id: number;
  name: string;
  address?: string;
  is_main?: boolean;
  created_at?: string;
  organization_id: number;
}

interface FormattedOrganization {
  id: number;
  name: string;
  created_at: string | null;
  branches: FormattedBranch[];
  country_code?: string | null;  // Agregar country_code
  [key: string]: any;
}

interface FormattedResponse {
  id: number;
  organization: FormattedOrganization;
  branch_id: number | null;
}

// Interface para la respuesta de la función
interface GetOrganizationResponse {
  data: FormattedResponse[] | null;
  error: Error | string | PostgrestError | null;
}

// Tipo para identificar errores de PostgreSQL/Supabase
interface PostgrestError {
  message: string;
  details?: string;
  hint?: string;
  code?: string;
}

// Función para obtener la organización del usuario utilizando un enfoque basado en consultas separadas
export async function getUserOrganization(userId: string): Promise<GetOrganizationResponse> {
  try {
    console.log("Obteniendo organización para userId:", userId);
    
    // Paso 1: Obtener el miembro de la organización
    const { data: memberData, error: memberError } = await supabase
      .from("organization_members")
      .select("id, organization_id, role, role_id")
      .eq("user_id", userId)
      .eq("is_active", true);

    if (memberError) {
      console.error("Error al consultar members:", memberError);
      throw memberError;
    }
    
    console.log("Datos de miembro encontrados:", JSON.stringify(memberData));
    
    if (!memberData || memberData.length === 0) {
      console.warn("No se encontraron organizaciones para el usuario");
      return { data: null, error: new Error("Usuario no asociado a ninguna organización") };
    }
    
    // Si el usuario tiene múltiples orgs, respetar la guardada en localStorage
    const savedOrg = obtenerOrganizacionActiva();
    let member: DbOrganizationMember;
    if (memberData.length > 1 && savedOrg?.id) {
      const saved = memberData.find((m: any) => m.organization_id === savedOrg.id);
      member = (saved || memberData[0]) as DbOrganizationMember;
    } else {
      member = memberData[0] as DbOrganizationMember;
    }
    
    // Paso 2: Obtener datos de la organización
    const { data: orgData, error: orgError } = await supabase
      .from("organizations")
      .select("id, name, created_at, country_code, type_id, subdomain")
      .eq("id", member.organization_id)
      .single();

    if (orgError) {
      console.error("Error al obtener datos de organización:", orgError);
      throw orgError;
    }
    
    if (!orgData) {
      console.error("No se encontraron datos para la organización ID:", member.organization_id);
      throw new Error("No se encontraron datos para la organización");
    }
    
    const organization = orgData as DbOrganization;
    console.log("Datos de organización encontrados:", JSON.stringify(organization));
    
    // Paso 3: Obtener las sucursales de la organización
    const { data: branchesData, error: branchesError } = await supabase
      .from("branches")
      .select("*")
      .eq("organization_id", member.organization_id);
    
    if (branchesError) {
      console.error("Error al obtener sucursales:", branchesError);
      throw branchesError;
    }
    
    const branches = branchesData as FormattedBranch[] || [];
    console.log("Sucursales encontradas:", JSON.stringify(branches));
    console.log("Miembro procesado:", JSON.stringify(member));
    
    // Formato final de la respuesta - estructura exacta que espera el componente
    const formattedData = [
      {
        id: member.id,
        organization: {
          // Primero extraemos la mayoría de los campos de la organización
          ...Object.fromEntries(
            Object.entries(organization).filter(([key]) => 
              key !== 'id' && key !== 'name' && key !== 'created_at'
            )
          ),
          // Luego asignamos explícitamente los campos esenciales para garantizar el formato correcto
          id: organization.id,
          name: organization.name,
          created_at: organization.created_at || null,
          // Asignamos las sucursales
          branches: branches
        },
        // Usamos la primera sucursal como predeterminada, si existe
        branch_id: branches && branches.length > 0 ? branches[0].id : null
      }
    ];
    
    console.log("Datos procesados de organización (FINAL):", JSON.stringify(formattedData));
    
    return { data: formattedData, error: null };
  } catch (error: any) {
    console.error("Error al obtener la organización:", error);
    return { data: null, error };
  }
}

// Función para obtener la sucursal principal de una organización
export async function getMainBranch(organizationId: number) {
  try {
    const { data, error } = await supabase
      .from("branches")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("is_main", true)
      .single();

    if (error) throw error;
    
    return { data, error: null };
  } catch (error) {
    console.error("Error al obtener la sucursal principal:", error);
    return { data: null, error };
  }
}

// Caché para branch_id para evitar múltiples accesos a localStorage
let _branchIdCache: { value: number | null; timestamp: number } | null = null;
const BRANCH_ID_CACHE_TTL = 30000; // 30 segundos de TTL
let _lastBranchIdLogTime = 0;

// Función para obtener el branch_id actual desde localStorage con caché optimizado
export function getCurrentBranchId(): number | null {
  try {
    // Verificar si localStorage está disponible (cliente)
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      // En SSR no retornamos ningún branch_id para evitar consultas innecesarias
      return null;
    }
    
    const now = Date.now();
    
    // Verificar si tenemos un valor en caché válido
    if (_branchIdCache && (now - _branchIdCache.timestamp) < BRANCH_ID_CACHE_TTL) {
      return _branchIdCache.value;
    }
    
    // Obtener valor fresco de localStorage
    const branchId = localStorage.getItem('currentBranchId');
    const parsedBranchId = branchId ? parseInt(branchId, 10) : null;
    
    // Actualizar caché
    _branchIdCache = {
      value: parsedBranchId,
      timestamp: now
    };
    
    // Solo loguear debug si han pasado más de 5 segundos desde el último log
    // Esto reduce significativamente el spam en consola
    if (now - _lastBranchIdLogTime > 5000) {
      console.log('🏦 DEBUG getCurrentBranchId (actualizado):', { 
        branchId, 
        parsed: parsedBranchId,
        cached: true,
        timestamp: new Date(now).toISOString()
      });
      _lastBranchIdLogTime = now;
    }
    
    return parsedBranchId;
  } catch (error) {
    console.error('Error obteniendo branch_id:', error);
    return null; // No retornar valor por defecto en caso de error
  }
}

// Función para invalidar el caché del branch_id (útil cuando se cambia la sucursal)
export function invalidateBranchIdCache(): void {
  _branchIdCache = null;
  _lastBranchIdLogTime = 0;
  console.log('🏦 Caché de branch_id invalidado');
}

// Función auxiliar para obtener branch_id con fallback (solo usar cuando se necesite realmente)
export function getCurrentBranchIdWithFallback(): number {
  const branchId = getCurrentBranchId();
  if (branchId !== null) {
    return branchId;
  }
  
  // Solo usar fallback cuando sea absolutamente necesario
  console.warn('🏦 Usando branch_id fallback (ID: 999) - considerar si es necesario');
  return 2; // Sede Principal como último recurso
}

// Función para obtener el usuario actual desde Supabase Auth
export async function getCurrentUserId(): Promise<string | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    return user?.id || null;
  } catch (error) {
    console.error('Error obteniendo current user:', error);
    return null;
  }
}

/**
 * Hook para usar la organización del usuario en componentes React
 * Combina los datos almacenados en localStorage con datos actuales de Supabase
 * Integra las funcionalidades de almacenamiento local para mayor resiliencia
 */
export function useOrganization() {
  // Intentamos obtener la organización del localStorage en la inicialización
  const initOrg = () => {
    try {
      const organizacionLocal = obtenerOrganizacionActiva();
      if (organizacionLocal && organizacionLocal.id) {
        // Crear un objeto FormattedOrganization válido desde el inicio
        return {
          organization: {
            id: organizacionLocal.id,
            name: organizacionLocal.name || `Organización ${organizacionLocal.id}`,
            created_at: null,
            branches: [],
            slug: organizacionLocal.slug || '',
            logo_url: organizacionLocal.logo_url || '',
            subdomain: organizacionLocal.subdomain || ''
          } as FormattedOrganization,
          branch_id: getCurrentBranchId(), // Obtener branch_id actual desde localStorage
          isLoading: false,
          error: null
        };
      }
    } catch (e) {
      console.error('Error al inicializar organización:', e);
    }
    return {
      organization: null,
      branch_id: null,
      isLoading: true,
      error: null
    };
  };

  const [organizationData, setOrganizationData] = useState<{
    organization: FormattedOrganization | null;
    branch_id: number | null;
    isLoading: boolean;
    error: Error | string | null;
  }>(initOrg());

  useEffect(() => {
    // Intentamos recuperar el usuario actual del localStorage y consultar datos actuales
    const fetchOrganizationData = async () => {
      try {
        // Primero intentamos recuperar la organización del almacenamiento local
        const organizacionLocal = obtenerOrganizacionActiva();
        
        // Recuperamos datos del usuario para obtener más información de la organización
        const userDataStr = localStorage.getItem('userData');
        const userData = userDataStr ? JSON.parse(userDataStr) : null;
        const userId = userData?.id;
        
        if (!userId) {
          // Si no hay usuario pero hay organización en local, usamos esa
          if (organizacionLocal && organizacionLocal.id) {
            // Crear un objeto FormattedOrganization válido a partir de los datos locales
            const formattedOrg: FormattedOrganization = {
              id: organizacionLocal.id,
              name: organizacionLocal.name || `Organización ${organizacionLocal.id}`,
              created_at: null,
              branches: [],
              slug: organizacionLocal.slug || '',
              logo_url: organizacionLocal.logo_url || '',
              subdomain: organizacionLocal.subdomain || ''
            };
            
            setOrganizationData({
              organization: formattedOrg,
              branch_id: getCurrentBranchId(),
              isLoading: false,
              error: null
            });
            return;
          }
          throw new Error('No se encontró ID de usuario');
        }
        
        // Obtenemos datos completos de la organización desde Supabase
        const { data, error } = await getUserOrganization(userId);
        
        if (error) {
          throw error;
        }
        
        if (data && data.length > 0) {
          // Guardar datos actualizados en almacenamiento local
          const orgData = data[0].organization;
          guardarOrganizacionActiva({
            id: orgData.id,
            name: orgData.name,
            slug: orgData.slug || undefined,
            logo_url: orgData.logo_url || undefined,
            subdomain: orgData.subdomain || undefined
          });
          
          // Actualizar estado del componente
          setOrganizationData({
            organization: orgData,
            branch_id: data[0].branch_id,
            isLoading: false,
            error: null
          });
        } else if (organizacionLocal && organizacionLocal.id) {
          // Si no hay datos de API pero sí tenemos datos locales, usamos esos
          console.log('No se encontraron datos en API, usando almacenamiento local:', organizacionLocal.id);
          // Crear un objeto FormattedOrganization válido a partir de los datos locales
          const formattedOrg: FormattedOrganization = {
            id: organizacionLocal.id,
            name: organizacionLocal.name || `Organización ${organizacionLocal.id}`,
            created_at: null,
            branches: [],
            slug: organizacionLocal.slug || '',
            logo_url: organizacionLocal.logo_url || '',
            subdomain: organizacionLocal.subdomain || ''
          };
          
          setOrganizationData({
            organization: formattedOrg,
            branch_id: getCurrentBranchId(),
            isLoading: false,
            error: null
          });
        } else {
          setOrganizationData({
            organization: null,
            branch_id: null,
            isLoading: false,
            error: 'No se encontraron datos de organización'
          });
        }
      } catch (err: any) {
        console.error('Error al obtener datos de organización:', err);
        
        // Intentar usar datos locales como respaldo si hay un error en la API
        const organizacionLocal = obtenerOrganizacionActiva();
        if (organizacionLocal && organizacionLocal.id) {
          console.log('Error en API, usando datos de respaldo del almacenamiento local:', organizacionLocal.id);
          const formattedOrg: FormattedOrganization = {
            id: organizacionLocal.id,
            name: organizacionLocal.name || `Organización ${organizacionLocal.id}`,
            created_at: null,
            branches: [],
            slug: organizacionLocal.slug || '',
            logo_url: organizacionLocal.logo_url || '',
            subdomain: organizacionLocal.subdomain || ''
          };
          
          setOrganizationData({
            organization: formattedOrg,
            branch_id: getCurrentBranchId(),
            isLoading: false,
            error: null
          });
        } else {
          setOrganizationData({
            organization: null,
            branch_id: null,
            isLoading: false,
            error: err?.message || 'Error al cargar datos de organización'
          });
        }
      }
    };
    
    fetchOrganizationData();
  }, []);

  return organizationData;
}

// Exportar todo como objeto por defecto para compatibilidad con código existente
export default {
  useOrganization,
  getUserOrganization,
  getMainBranch,
  guardarOrganizacionActiva,
  obtenerOrganizacionActiva,
  getOrganizationId,
  getCurrentBranchId,
  getCurrentUserId,
  invalidateBranchIdCache,
  getCurrentBranchIdWithFallback
};
