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
};

/**
 * Guarda la organización activa en localStorage y sessionStorage como respaldo
 */
export function guardarOrganizacionActiva(organizacion: Organizacion): void {
  try {
    // Guardar en localStorage como fuente principal
    localStorage.setItem(STORAGE_KEY, JSON.stringify(organizacion));
    
    // Guardar en sessionStorage como respaldo
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(organizacion));
    
    console.log('Organización guardada correctamente:', organizacion.id);
  } catch (error) {
    console.error('Error al guardar organización:', error);
  }
}

/**
 * Obtiene la organización activa de forma robusta
 * Intenta recuperarla de múltiples fuentes para mayor resiliencia
 */
export function obtenerOrganizacionActiva(): Organizacion {
  // Valor predeterminado si todo falla
  const valorPredeterminado: Organizacion = { id: 1 };
  
  if (typeof window === 'undefined') {
    return valorPredeterminado; // Para SSR
  }
  
  try {
    // Intentar recuperar del localStorage (fuente principal)
    const localData = localStorage.getItem(STORAGE_KEY);
    if (localData) {
      const parsed = JSON.parse(localData);
      return parsed;
    }
    
    // Intentar recuperar del sessionStorage (fuente de respaldo)
    const sessionData = sessionStorage.getItem(STORAGE_KEY);
    if (sessionData) {
      const parsed = JSON.parse(sessionData);
      console.log('Organización recuperada de sessionStorage:', parsed.id);
      return parsed;
    }
    
    // Si no se encontró nada, verificar otras posibles claves (para migración)
    const alternativas = ['currentOrganization', 'activeOrganization', 'organizacion'];
    for (const key of alternativas) {
      const altData = localStorage.getItem(key);
      if (altData) {
        const parsed = JSON.parse(altData);
        console.log(`Organización recuperada de clave alternativa (${key}):`, parsed.id);
        // Migrar a la clave estándar
        guardarOrganizacionActiva(parsed);
        return parsed;
      }
    }
    
    console.log('No se encontró organización guardada, usando predeterminada');
    return valorPredeterminado;
  } catch (error) {
    console.error('Error al recuperar organización:', error);
    return valorPredeterminado;
  }
}

/**
 * Para uso en componentes: obtiene la organización y proporciona el organization_id
 * Se recomienda usar este método siempre para obtener el ID de organización
 */
export function getOrganizationId(): number {
  const organizacion = obtenerOrganizacionActiva();
  // Usando ID 2 como valor predeterminado ya que es el que existe en la base de datos
  // y con el que se crearon las tareas
  return organizacion?.id || 2;
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
    
    const member = memberData[0] as DbOrganizationMember;
    
    // Paso 2: Obtener datos de la organización
    const { data: orgData, error: orgError } = await supabase
      .from("organizations")
      .select("*")
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
            logo_url: organizacionLocal.logo_url || ''
          } as FormattedOrganization,
          branch_id: null,
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
              // Agregar cualquier otro campo requerido por FormattedOrganization
              slug: organizacionLocal.slug || '',
              logo_url: organizacionLocal.logo_url || ''
            };
            
            setOrganizationData({
              organization: formattedOrg,
              branch_id: null, // No tenemos datos de sucursal en este punto
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
            logo_url: orgData.logo_url || undefined
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
            // Agregar cualquier otro campo requerido por FormattedOrganization
            slug: organizacionLocal.slug || '',
            logo_url: organizacionLocal.logo_url || ''
          };
          
          setOrganizationData({
            organization: formattedOrg,
            branch_id: null,
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
          // Crear un objeto FormattedOrganization válido a partir de los datos locales
          const formattedOrg: FormattedOrganization = {
            id: organizacionLocal.id,
            name: organizacionLocal.name || `Organización ${organizacionLocal.id}`,
            created_at: null,
            branches: [],
            // Agregar cualquier otro campo requerido por FormattedOrganization
            slug: organizacionLocal.slug || '',
            logo_url: organizacionLocal.logo_url || ''
          };
          
          setOrganizationData({
            organization: formattedOrg,
            branch_id: null,
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
  getOrganizationId
};
