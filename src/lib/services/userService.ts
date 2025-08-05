'use client';

import { supabase } from '@/lib/supabase/config';
import { UserData } from '@/components/app-layout/types';

/**
 * Obtiene el nombre de usuario a partir de su ID
 * @param userId ID del usuario
 * @returns Nombre del usuario o undefined si no se encuentra
 */
export const getUserName = async (userId: string): Promise<string | undefined> => {
  try {
    if (!userId) return undefined;

    console.log('getUserName - Buscando usuario con ID:', userId);
    const { data, error } = await supabase
      .from('profiles')
      .select('first_name, last_name, email')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Error al obtener perfil de usuario:', error);
      return undefined;
    }

    if (!data) {
      console.error('No se encontró el perfil para el ID:', userId);
      return undefined;
    }

    console.log('Datos de perfil obtenidos:', data);

    // Si tenemos nombre y apellido, los combinamos; de lo contrario, usamos el email
    const nombreCompleto = data.first_name && data.last_name 
      ? `${data.first_name} ${data.last_name}` 
      : data.email || 'Usuario sin nombre';

    console.log('Nombre generado:', nombreCompleto);
    return nombreCompleto;
  } catch (error) {
    console.error('Error en getUserName:', error);
    return undefined;
  }
};

/**
 * Obtiene varios nombres de usuario a partir de sus IDs
 * @param userIds Array de IDs de usuarios
 * @returns Mapa de ID de usuario a nombre
 */
export const getUserNames = async (userIds: string[]): Promise<Record<string, string>> => {
  try {
    if (!userIds || userIds.length === 0) return {};

    // Filtramos IDs vacíos o inválidos
    const validUserIds = userIds.filter(id => id && id.trim() !== '');
    if (validUserIds.length === 0) return {};

    const { data, error } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, email')
      .in('id', validUserIds);

    if (error) {
      console.error('Error al obtener perfiles de usuarios:', error);
      return {};
    }

    // Convertimos el array de resultados en un mapa ID -> Nombre
    const userMap: Record<string, string> = {};
    data.forEach(user => {
      userMap[user.id] = user.first_name && user.last_name 
        ? `${user.first_name} ${user.last_name}` 
        : user.email || 'Usuario desconocido';
    });

    return userMap;
  } catch (error) {
    console.error('Error en getUserNames:', error);
    return {};
  }
};

/**
 * Obtiene los datos completos del usuario autenticado incluyendo su rol en la organización
 * @param userId ID del usuario
 * @param organizationId ID de la organización (opcional, usa la actual del localStorage si no se proporciona)
 * @returns Datos completos del usuario con rol
 */
export const getUserData = async (userId: string, organizationId?: number): Promise<UserData | null> => {
  try {
    if (!userId) return null;

    // Si no se proporciona organizationId, intentar obtenerlo del localStorage
    let orgId = organizationId;
    if (!orgId && typeof window !== 'undefined') {
      const storedOrgId = localStorage.getItem('currentOrganizationId');
      orgId = storedOrgId ? parseInt(storedOrgId, 10) : undefined;
    }

    console.log('getUserData - Buscando usuario:', userId, 'en organización:', orgId);

    // Consulta que obtiene perfil del usuario con su rol en la organización
    const query = supabase
      .from('profiles')
      .select(`
        id,
        email,
        first_name,
        last_name,
        avatar_url,
        organization_members!inner(
          organization_id,
          is_super_admin,
          roles(
            name
          )
        )
      `)
      .eq('id', userId);

    // Si tenemos organizationId, filtrar por esa organización
    if (orgId) {
      query.eq('organization_members.organization_id', orgId);
    }

    const { data, error } = await query.single();

    if (error) {
      console.error('Error al obtener datos del usuario:', error);
      return null;
    }

    if (!data) {
      console.error('No se encontraron datos para el usuario:', userId);
      return null;
    }

    console.log('Datos de usuario obtenidos:', data);

    // Construir el objeto UserData
    const orgMember = data.organization_members?.[0]; // Tomar el primer miembro (debería ser único por organización)
    
    // Verificar la estructura de roles
    console.log('orgMember:', orgMember);
    console.log('orgMember.roles:', orgMember?.roles);
    
    let roleName = 'Sin rol';
    if (orgMember?.roles) {
      // Si roles es un objeto con name
      if (typeof orgMember.roles === 'object' && 'name' in orgMember.roles) {
        roleName = (orgMember.roles as any).name || 'Sin rol';
      }
      // Si roles es un array, tomar el primer elemento
      else if (Array.isArray(orgMember.roles) && orgMember.roles.length > 0) {
        roleName = (orgMember.roles[0] as any)?.name || 'Sin rol';
      }
    }
    
    const userData: UserData = {
      name: data.first_name && data.last_name 
        ? `${data.first_name} ${data.last_name}` 
        : data.email || 'Usuario',
      email: data.email,
      role: roleName,
      avatar: data.avatar_url || undefined
    };

    console.log('UserData generado:', userData);
    return userData;
  } catch (error) {
    console.error('Error en getUserData:', error);
    return null;
  }
};

/**
 * Obtiene la lista de usuarios disponibles para asignación
 * @returns Lista de usuarios con su id y nombre
 */
export const getAssignableUsers = async (): Promise<Array<{id: string, nombre: string, full_name?: string, email: string}>> => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, email')
      .order('first_name', { ascending: true });
      
    if (error) {
      console.error('Error al obtener usuarios asignables:', error);
      return [];
    }
    
    return data.map(user => {
      const fullName = user.first_name && user.last_name 
        ? `${user.first_name} ${user.last_name}` 
        : null;
      
      return {
        id: user.id,
        nombre: fullName || user.email || 'Usuario sin nombre',
        full_name: fullName || undefined,
        email: user.email || ''
      };
    });
  } catch (error) {
    console.error('Error en getAssignableUsers:', error);
    return [];
  }
};
